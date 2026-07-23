from __future__ import annotations

import json
import re
from typing import Any

import anthropic
import httpx

from app.core.config import settings
from app.services.deidentification_service import assert_deidentified_packet

_UNSAFE_QUESTION_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bshould\b",
        r"\b(?:start|starting|switch|take|prescribe|enroll)\b",
        r"\bbest\s+(?:treatment|for\s+this\s+patient)\b",
        r"\beligib(?:le|ility)\b",
        r"\bqualif(?:y|ies|ied|ying)\b",
        r"\bcandidate\s+for\b",
        r"\brecommend(?:ed|ation|ations|ing|s)?\b",
        r"\bbenefit(?:s|ed|ing)?\s+from\b",
        r"\blikely\s+(?:eligible|to\s+benefit|to\s+respond)\b",
        r"\bappropriate\b",
        r"\bgood\s+fit\b",
        r"\b(?:dose|dosing)\b",
        r"\b(?:rank|ranking|choose|choosing|compare|comparing)\b",
        r"\brespond(?:s|ed|ing)?\b",
        r"\b(?:diagnose|diagnosis|diagnostic|prove)\b",
        r"\bfinal\s+(?:decision|relevance)\b",
    )
)
_REVIEW_FRAME_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bclinician(?:-review)?\b",
        r"\bcare\s+team\b.*\breview\b",
        r"\boncology\s+team\b.*\b(?:review|discuss)",
        r"\b(?:review|reviewing|discuss|discussing|discussion)\b",
        r"\bworth\s+formal\s+screening\b",
    )
)


def _strip_question_prefix(text: str) -> str:
    return text.strip("-• ").strip().lstrip("0123456789. )").strip()


def validate_clinician_questions(questions: list[str]) -> list[str]:
    """Keep only cautious clinician-review questions; fail closed on advice/eligibility output."""

    validated: list[str] = []
    unsafe_found = False
    for question in questions:
        cleaned = _strip_question_prefix(str(question))
        if len(cleaned) <= 5:
            continue
        if any(pattern.search(cleaned) for pattern in _UNSAFE_QUESTION_PATTERNS):
            unsafe_found = True
            continue
        if "?" not in cleaned:
            continue
        if not any(pattern.search(cleaned) for pattern in _REVIEW_FRAME_PATTERNS):
            unsafe_found = True
            continue
        validated.append(cleaned)
    if unsafe_found:
        return []
    return validated[:5]


_CASE_FRAMING_MAX_CHARS = 320


def validate_case_framing(text: str | None) -> str:
    """Keep only a short, cautious one-line case framing; fail closed on advice language."""

    if not text:
        return ""
    cleaned = " ".join(str(text).split()).strip("-• ").strip()
    if len(cleaned) <= 5 or len(cleaned) > _CASE_FRAMING_MAX_CHARS:
        return ""
    if any(pattern.search(cleaned) for pattern in _UNSAFE_QUESTION_PATTERNS):
        return ""
    return cleaned


# Fail-closed prose validator for plain-language explanations of PUBLIC source text.
# Explaining what a study says (third person, factual) is allowed; addressing the reader
# or drifting into advice/eligibility/recommendation is not. Any hit fails closed to "".
_UNSAFE_EXPLANATION_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\byou\b",
        r"\byour\b",
        r"\bwe\s+recommend\b",
        r"\brecommend(?:ed|ation|ations|ing|s)?\b",
        r"\bshould\b",
        r"\beligib(?:le|ility)\b",
        r"\bqualif(?:y|ies|ied|ying)\b",
        r"\bcandidate\s+for\b",
        r"\bbest\s+(?:option|treatment|choice|for)\b",
        r"\btalk\s+to\s+your\b",
        r"\bask\s+your\b",
        r"\bconsider\s+(?:starting|switching|taking|enrolling)\b",
    )
)
_EXPLANATION_MIN_CHARS = 20
_EXPLANATION_MAX_CHARS = 900


def validate_plain_language(text: str | None) -> str:
    """Keep only a short, factual, third-person explanation; fail closed on advice,
    second-person address, eligibility, or recommendation language."""

    if not text:
        return ""
    cleaned = " ".join(str(text).split()).strip("-• ").strip()
    if len(cleaned) < _EXPLANATION_MIN_CHARS or len(cleaned) > _EXPLANATION_MAX_CHARS:
        return ""
    if any(pattern.search(cleaned) for pattern in _UNSAFE_EXPLANATION_PATTERNS):
        return ""
    return cleaned


_PLAIN_LANGUAGE_SYSTEM_PROMPT = (
    "You explain public cancer-research and clinical-trial text in plain language for a "
    "worried family member with no medical background. Use ONLY the provided public source "
    "text. Write 2 to 4 short sentences, in the third person, describing what the source "
    "says. Do NOT address the reader ('you'/'your'). Do NOT give advice, recommendations, "
    "next steps, or opinions. Do NOT say anyone is eligible, qualifies, should do anything, "
    "or would benefit. Do NOT mention or infer any specific patient. Keep it calm and factual; "
    "briefly gloss any unavoidable medical term."
)
_PLAIN_LANGUAGE_INSTRUCTION = (
    "Explain in 2 to 4 plain, third-person sentences what this public source text is about. "
    "No advice, no eligibility, no recommendations, no next steps, no 'you'."
)

_PROFILE_EXTRACTION_SYSTEM_PROMPT = (
    "You extract structured oncology profile fields from DE-IDENTIFIED pathology or molecular "
    "report text. Names, dates, contacts, IDs, and places have been removed and replaced with "
    "[redacted]; never try to infer or reconstruct them. Return ONLY a compact JSON object with "
    "these keys: cancer_type (string or null), subtype (string or null), stage_or_context "
    "(string or null), biomarkers (array of objects with name, variant, status), therapy_history "
    "(array of objects with therapy_name, therapy_type, status). Use null or empty arrays when "
    "unsure. Do NOT give advice, eligibility, prognosis, recommendations, or any commentary. "
    "Output JSON only, with no surrounding prose or code fences."
)
_PROFILE_EXTRACTION_INSTRUCTION = (
    "Extract the oncology profile fields as a JSON object from this de-identified report text."
)


def validate_extracted_candidates(raw: Any) -> dict[str, Any]:
    """Parse and whitelist the model's profile-extraction output.

    Fail-closed to an empty dict on anything that is not a clean JSON object of the
    expected shape. Only short structured fields are kept, so advice/commentary cannot
    ride along in free text.
    """

    text = str(raw or "").strip()
    if not text:
        return {}
    if text.startswith("```"):
        text = re.sub(r"^```[A-Za-z]*\n?", "", text).strip().rstrip("`").strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return {}
    try:
        data = json.loads(text[start : end + 1])
    except (json.JSONDecodeError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}

    def _clean(value: Any, limit: int) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(str(value).split()).strip()
        return cleaned[:limit] if cleaned else None

    result: dict[str, Any] = {
        "cancer_type": _clean(data.get("cancer_type"), 120),
        "subtype": _clean(data.get("subtype"), 120),
        "stage_or_context": _clean(data.get("stage_or_context"), 120),
        "biomarkers": [],
        "therapy_history": [],
    }

    raw_biomarkers = data.get("biomarkers")
    if isinstance(raw_biomarkers, list):
        for item in raw_biomarkers[:25]:
            if not isinstance(item, dict):
                continue
            name = _clean(item.get("name"), 120)
            if not name:
                continue
            result["biomarkers"].append(
                {"name": name, "variant": _clean(item.get("variant"), 120), "status": _clean(item.get("status"), 60)}
            )

    raw_therapies = data.get("therapy_history")
    if isinstance(raw_therapies, list):
        for item in raw_therapies[:25]:
            if not isinstance(item, dict):
                continue
            name = _clean(item.get("therapy_name"), 160) or _clean(item.get("name"), 160)
            if not name:
                continue
            result["therapy_history"].append(
                {"therapy_name": name, "therapy_type": _clean(item.get("therapy_type"), 80), "status": _clean(item.get("status"), 60)}
            )

    return result


# First-party Anthropic model IDs (console.anthropic.com); OpenRouter uses its
# own aggregator IDs like "anthropic/claude-sonnet-4.6".
FIRST_PARTY_ANTHROPIC_MODELS = [
    "claude-sonnet-4-6",
    "claude-opus-4-8",
    "claude-haiku-4-5",
]

_QUESTIONS_SYSTEM_PROMPT = (
    "You are generating cautious clinician-discussion questions for a local oncology monitoring app. "
    "Use only the de-identified case context provided. Do not infer identity. "
    "Do not give treatment advice. Do not claim eligibility. Keep each question plain, short, and respectful."
)
_QUESTIONS_INSTRUCTION = "Generate 5 short questions the patient or clinician could review at an oncology visit."
_FRAMING_SYSTEM_PROMPT = (
    "You are writing a single neutral one-line case framing for a local oncology "
    "monitoring app. Use only the de-identified case context provided. Do not infer "
    "identity. Do not give treatment advice, claim eligibility, recommend, rank, or "
    "judge appropriateness. Summarize the case and what was flagged for clinician "
    "review in one short, plain sentence."
)
_FRAMING_INSTRUCTION = (
    "Write ONE short sentence (max 40 words) framing this case for the "
    "patient's oncology team to review. No advice, no eligibility, no ranking."
)
_COMPLETION_MAX_TOKENS = 1024


class _BaseLLMClient:
    """Shared prompts and safety gates for every AI provider.

    The de-identification assertion on input and the fail-closed output
    validators live here, so no provider implementation can skip them —
    providers only implement transport (`_complete`, `test_api_key`).
    """

    provider_key = ""

    def __init__(self, api_key: str, model: str | None = None) -> None:
        self.api_key = api_key
        self.model = model or self.default_model()

    @classmethod
    def default_model(cls) -> str:
        raise NotImplementedError

    def test_api_key(self) -> tuple[bool, str, list[str]]:
        raise NotImplementedError

    def _complete(self, *, system: str, user_payload: str) -> str:
        raise NotImplementedError

    def generate_clinician_questions(self, *, case_packet: dict[str, Any]) -> list[str]:
        assert_deidentified_packet(case_packet)
        user_payload = json.dumps(
            {
                "deidentified_case_packet": case_packet,
                "instruction": _QUESTIONS_INSTRUCTION,
            },
            sort_keys=True,
            default=str,
        )
        try:
            content = self._complete(system=_QUESTIONS_SYSTEM_PROMPT, user_payload=user_payload)
            lines = [line.strip("-• ").strip() for line in str(content).splitlines() if line.strip()]
            return validate_clinician_questions(lines)
        except Exception:
            return []

    def generate_case_framing(self, *, case_packet: dict[str, Any]) -> str:
        assert_deidentified_packet(case_packet)
        user_payload = json.dumps(
            {
                "deidentified_case_packet": case_packet,
                "instruction": _FRAMING_INSTRUCTION,
            },
            sort_keys=True,
            default=str,
        )
        try:
            content = self._complete(system=_FRAMING_SYSTEM_PROMPT, user_payload=user_payload)
            return validate_case_framing(str(content))
        except Exception:
            return ""

    def explain_finding(self, *, finding_packet: dict[str, Any]) -> str:
        """Explain a finding's PUBLIC source text in plain language.

        Unlike the clinician-question / case-framing paths, the input here is public
        source material (not a de-identified case packet), so `assert_deidentified_packet`
        is deliberately NOT applied. The caller guarantees the packet is built only from
        whitelisted public Finding fields and carries no patient identity. Output is
        fail-closed validated to strip advice / eligibility / second-person language.
        """

        user_payload = json.dumps(
            {
                "public_source": finding_packet,
                "instruction": _PLAIN_LANGUAGE_INSTRUCTION,
            },
            sort_keys=True,
            default=str,
        )
        try:
            content = self._complete(system=_PLAIN_LANGUAGE_SYSTEM_PROMPT, user_payload=user_payload)
            return validate_plain_language(str(content))
        except Exception:
            return ""

    def extract_profile_candidates(self, *, redacted_text: str) -> dict[str, Any]:
        """Extract structured oncology fields from ALREADY-REDACTED report text.

        The caller (profile_ai_service) guarantees `redacted_text` has been locally
        redacted and re-asserted clean before this is invoked. Output is fail-closed
        validated to a whitelisted JSON shape.
        """

        user_payload = json.dumps(
            {
                "deidentified_report_text": redacted_text,
                "instruction": _PROFILE_EXTRACTION_INSTRUCTION,
            },
            default=str,
        )
        try:
            content = self._complete(system=_PROFILE_EXTRACTION_SYSTEM_PROMPT, user_payload=user_payload)
            return validate_extracted_candidates(content)
        except Exception:
            return {}


class OpenRouterClient(_BaseLLMClient):
    provider_key = "openrouter"

    def __init__(self, api_key: str, model: str | None = None) -> None:
        super().__init__(api_key, model)
        self.base_url = settings.openrouter_base_url

    @classmethod
    def default_model(cls) -> str:
        return "anthropic/claude-sonnet-4.6"

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": settings.app_referer_header,
            "X-OpenRouter-Title": settings.app_title_header,
        }

    def test_api_key(self) -> tuple[bool, str, list[str]]:
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.get(f"{self.base_url}/models", headers=self._headers)
                response.raise_for_status()
                payload = response.json()
                data = payload.get("data", [])
                models = [item["id"] for item in data if item.get("id")]
                return True, "API key looks valid.", models
        except Exception as exc:
            return False, f"Could not validate the API key: {exc}", []

    def _complete(self, *, system: str, user_payload: str) -> str:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_payload},
        ]
        with httpx.Client(timeout=45.0) as client:
            response = client.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers,
                json={
                    "model": self.model,
                    "messages": messages,
                    "temperature": 0.2,
                },
            )
            response.raise_for_status()
            return str(response.json()["choices"][0]["message"]["content"])


class AnthropicClient(_BaseLLMClient):
    """First-party Anthropic API client for console.anthropic.com keys."""

    provider_key = "anthropic"

    def __init__(self, api_key: str, model: str | None = None) -> None:
        super().__init__(api_key, model)
        self.base_url = settings.anthropic_base_url

    @classmethod
    def default_model(cls) -> str:
        return FIRST_PARTY_ANTHROPIC_MODELS[0]

    def _client(self) -> anthropic.Anthropic:
        return anthropic.Anthropic(
            api_key=self.api_key,
            base_url=self.base_url,
            timeout=45.0,
            max_retries=1,
        )

    def test_api_key(self) -> tuple[bool, str, list[str]]:
        try:
            models = [item.id for item in self._client().models.list()]
            return True, "API key looks valid.", models
        except anthropic.AuthenticationError:
            return (
                False,
                "Anthropic rejected this API key. Check it at console.anthropic.com/settings/keys.",
                [],
            )
        except Exception as exc:
            return False, f"Could not validate the API key: {exc}", []

    def _complete(self, *, system: str, user_payload: str) -> str:
        # The Messages API requires max_tokens; newer Claude models reject
        # sampling parameters like temperature, so none are sent.
        response = self._client().messages.create(
            model=self.model,
            max_tokens=_COMPLETION_MAX_TOKENS,
            system=system,
            messages=[{"role": "user", "content": user_payload}],
        )
        parts = [block.text for block in response.content if getattr(block, "type", "") == "text"]
        return "\n".join(parts)


def create_llm_client(provider_key: str, *, api_key: str, model: str | None = None) -> _BaseLLMClient:
    if provider_key == OpenRouterClient.provider_key:
        return OpenRouterClient(api_key=api_key, model=model)
    if provider_key == AnthropicClient.provider_key:
        return AnthropicClient(api_key=api_key, model=model)
    raise ValueError(f"Unknown AI provider: {provider_key}")
