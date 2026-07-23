from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services.deidentification_service import (
    DeidentificationError,
    PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
    PRIVACY_MODE_LOCAL_ONLY,
    assert_free_text_deidentified,
    redact_free_text,
)
from app.services.llm_service import create_llm_client
from app.services.profile_extraction_service import extract_profile_candidates
from app.services.settings_service import get_active_provider, get_provider_api_key, get_settings

# Cap the amount of pasted text sent for AI assist. Local regex extraction still runs on
# the full text; this only bounds what could be redacted-and-sent.
_MAX_REPORT_CHARS = 20_000

_AI_ITEM_NOTE = "Suggested by AI from the de-identified report — confirm against the original before saving."


def _norm(value: Any) -> str:
    return str(value).strip().lower() if value else ""


def _regex_result(text: str) -> dict[str, Any]:
    result = extract_profile_candidates(text)
    return {
        "cancer_type": result.cancer_type,
        "subtype": result.subtype,
        "stage_or_context": result.stage_or_context,
        "biomarkers": [dict(item) for item in result.biomarkers],
        "therapy_history": [dict(item) for item in result.therapy_history],
        "notes": result.notes,
        "warnings": list(result.warnings),
        "ai_status": "not_requested",
        "ai_message": None,
    }


def _merge_ai_additions(base: dict[str, Any], ai: dict[str, Any]) -> int:
    """Fold AI-suggested fields into the regex result, tagging every addition. Returns the
    number of fields added. Existing (report-derived) values are never overwritten."""

    added = 0

    for key in ("cancer_type", "subtype", "stage_or_context"):
        if not base.get(key) and ai.get(key):
            base[key] = ai[key]
            added += 1

    existing_biomarkers = {_norm(item.get("name")) for item in base["biomarkers"]}
    for item in ai.get("biomarkers", []):
        name_key = _norm(item.get("name"))
        if name_key and name_key not in existing_biomarkers:
            base["biomarkers"].append(
                {
                    "name": item["name"],
                    "variant": item.get("variant"),
                    "status": item.get("status"),
                    "notes": _AI_ITEM_NOTE,
                }
            )
            existing_biomarkers.add(name_key)
            added += 1

    existing_therapies = {_norm(item.get("therapy_name")) for item in base["therapy_history"]}
    for item in ai.get("therapy_history", []):
        name_key = _norm(item.get("therapy_name"))
        if name_key and name_key not in existing_therapies:
            base["therapy_history"].append(
                {
                    "therapy_name": item["therapy_name"],
                    "therapy_type": item.get("therapy_type"),
                    "line_of_therapy": None,
                    "status": item.get("status"),
                    "notes": _AI_ITEM_NOTE,
                }
            )
            existing_therapies.add(name_key)
            added += 1

    return added


def extract_profile_candidates_ai(session: Session, text: str, *, allow_ai: bool) -> dict[str, Any]:
    """Local regex extraction, optionally augmented by a de-identified AI pass.

    The AI pass is gated (Mode 2 + disclosure + provider) and PHI-safe: the report is
    redacted locally and re-asserted clean before anything is sent. If it cannot be
    de-identified, the AI call is refused and local extraction is returned. AI additions
    are never auto-applied — they are tagged for the user to confirm.
    """

    base = _regex_result(text)
    if not allow_ai:
        return base

    settings = get_settings(session)
    mode = settings.privacy_mode or PRIVACY_MODE_LOCAL_ONLY
    if mode != PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST:
        base["ai_status"] = "local_only"
        base["ai_message"] = "AI help is off. Turn on de-identified AI assist in Settings to use it."
        return base
    if not settings.deidentified_ai_disclosure_acknowledged:
        base["ai_status"] = "disclosure_required"
        base["ai_message"] = "Acknowledge the AI privacy disclosure in Settings to use AI help."
        return base

    provider_key, provider = get_active_provider(session)
    api_key = get_provider_api_key(provider)
    if provider is None or not provider.is_configured or not provider.selected_model or not api_key:
        base["ai_status"] = "ai_unavailable"
        base["ai_message"] = "Add and select an AI provider in Settings to use AI help."
        return base

    # Redact locally and re-assert clean BEFORE any network call. Fail closed.
    try:
        redacted = redact_free_text((text or "")[:_MAX_REPORT_CHARS])
        assert_free_text_deidentified(redacted)
    except DeidentificationError:
        base["ai_status"] = "redaction_failed"
        base["ai_message"] = (
            "AI help was skipped: the report could not be automatically de-identified, so nothing "
            "was sent. Local extraction was used instead."
        )
        return base

    try:
        ai = create_llm_client(
            provider_key, api_key=api_key, model=provider.selected_model
        ).extract_profile_candidates(redacted_text=redacted)
    except Exception:  # noqa: BLE001 - fail closed on any provider error
        ai = {}

    if not ai:
        base["ai_status"] = "ai_failed"
        base["ai_message"] = "The AI helper could not read the report right now. Local extraction was used instead."
        return base

    added = _merge_ai_additions(base, ai)
    if added:
        base["ai_status"] = "ai_assisted"
        base["ai_message"] = (
            "AI suggested additional fields from the de-identified report. Confirm each against the "
            "original report before saving."
        )
    else:
        base["ai_status"] = "ai_no_additions"
        base["ai_message"] = "AI reviewed the de-identified report and found nothing to add beyond the local matches."
    return base
