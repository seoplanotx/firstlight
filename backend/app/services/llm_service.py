from __future__ import annotations

import json
import re
from typing import Any

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


class OpenRouterClient:
    def __init__(self, api_key: str, model: str | None = None) -> None:
        self.api_key = api_key
        self.model = model or "anthropic/claude-sonnet-4.6"
        self.base_url = settings.openrouter_base_url

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

    def generate_clinician_questions(self, *, case_packet: dict[str, Any]) -> list[str]:
        assert_deidentified_packet(case_packet)
        messages = [
            {
                "role": "system",
                "content": (
                    "You are generating cautious clinician-discussion questions for a local oncology monitoring app. "
                    "Use only the de-identified case context provided. Do not infer identity. "
                    "Do not give treatment advice. Do not claim eligibility. Keep each question plain, short, and respectful."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "deidentified_case_packet": case_packet,
                        "instruction": "Generate 5 short questions the patient or clinician could review at an oncology visit.",
                    },
                    sort_keys=True,
                    default=str,
                ),
            },
        ]
        try:
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
                content = response.json()["choices"][0]["message"]["content"]
                lines = [line.strip("-• ").strip() for line in str(content).splitlines() if line.strip()]
                return validate_clinician_questions(lines)
        except Exception:
            return []

    def generate_case_framing(self, *, case_packet: dict[str, Any]) -> str:
        assert_deidentified_packet(case_packet)
        messages = [
            {
                "role": "system",
                "content": (
                    "You are writing a single neutral one-line case framing for a local oncology "
                    "monitoring app. Use only the de-identified case context provided. Do not infer "
                    "identity. Do not give treatment advice, claim eligibility, recommend, rank, or "
                    "judge appropriateness. Summarize the case and what was flagged for clinician "
                    "review in one short, plain sentence."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "deidentified_case_packet": case_packet,
                        "instruction": (
                            "Write ONE short sentence (max 40 words) framing this case for the "
                            "patient's oncology team to review. No advice, no eligibility, no ranking."
                        ),
                    },
                    sort_keys=True,
                    default=str,
                ),
            },
        ]
        try:
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
                content = response.json()["choices"][0]["message"]["content"]
                return validate_case_framing(str(content))
        except Exception:
            return ""
