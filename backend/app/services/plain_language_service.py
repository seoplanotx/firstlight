from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.finding import Finding
from app.services.deidentification_service import (
    PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
    PRIVACY_MODE_LOCAL_ONLY,
    assert_no_profile_identity,
)
from app.services.findings_service import get_finding
from app.services.llm_service import create_llm_client
from app.services.profile_service import get_profile
from app.services.public_finding_service import build_public_finding_packet
from app.services.settings_service import get_active_provider, get_provider_api_key, get_settings
from app.utils.dates import utcnow


# Status values returned to the API layer:
#   not_found          - no such finding
#   cached             - a stored plain-language summary was returned unchanged
#   local_only         - AI assist is off (local-only privacy mode); nothing left the device
#   disclosure_required- AI assist selected but the disclosure was not acknowledged
#   ai_unavailable     - no provider / model / key configured
#   ai_failed          - provider errored or returned nothing usable (deterministic no-op)
#   ai_generated       - a fresh summary was produced, validated, and cached


def _result(
    finding: Finding | None,
    status: str,
    *,
    provider: str | None = None,
    model: str | None = None,
    message: str | None = None,
) -> dict[str, Any]:
    return {
        "finding": finding,
        "status": status,
        "provider": provider,
        "model": model,
        "message": message,
    }


def generate_plain_language(session: Session, finding_id: int, *, force: bool = False) -> dict[str, Any]:
    """Produce (and cache) a plain-language explanation of a finding's PUBLIC source text.

    Fail-closed at every step: if AI assist is off, unconfigured, errors, or returns
    advice-shaped output, the finding is returned unchanged with an explanatory status
    and no summary is stored.
    """

    finding = get_finding(session, finding_id)
    if finding is None:
        return _result(None, "not_found")

    if finding.plain_language_summary and not force:
        return _result(
            finding,
            "cached",
            provider=finding.plain_language_provider,
            model=finding.plain_language_model,
        )

    settings = get_settings(session)
    mode = settings.privacy_mode or PRIVACY_MODE_LOCAL_ONLY
    if mode != PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST:
        return _result(finding, "local_only")
    if not settings.deidentified_ai_disclosure_acknowledged:
        return _result(finding, "disclosure_required")

    provider_key, provider = get_active_provider(session)
    api_key = get_provider_api_key(provider)
    if provider is None or not provider.is_configured or not provider.selected_model or not api_key:
        return _result(
            finding,
            "ai_unavailable",
            provider=provider_key,
            model=provider.selected_model if provider else None,
        )

    try:
        packet = build_public_finding_packet(finding)
        profile = get_profile(session, finding.profile_id)
        if profile is not None:
            # Belt-and-suspenders: the patient's own identity terms must never ride along,
            # even though the payload is built only from public source fields.
            assert_no_profile_identity(packet, profile)
        text = create_llm_client(
            provider_key, api_key=api_key, model=provider.selected_model
        ).explain_finding(finding_packet=packet)
    except Exception as exc:  # noqa: BLE001 - fail closed on any error
        return _result(
            finding,
            "ai_failed",
            provider=provider_key,
            model=provider.selected_model,
            message=str(exc),
        )

    if not text:
        return _result(
            finding,
            "ai_failed",
            provider=provider_key,
            model=provider.selected_model,
            message="The AI provider returned no usable plain-language summary.",
        )

    finding.plain_language_summary = text
    finding.plain_language_generated_at = utcnow()
    finding.plain_language_provider = provider_key
    finding.plain_language_model = provider.selected_model
    session.commit()
    refreshed = get_finding(session, finding_id)
    return _result(refreshed, "ai_generated", provider=provider_key, model=provider.selected_model)
