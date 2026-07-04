from __future__ import annotations

import hmac
import secrets
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.release import APP_NAME, APP_VERSION
from app.core.security import decrypt_secret, encrypt_secret
from app.models.finding import Finding
from app.models.run import MonitoringRun
from app.models.settings import OnboardingState
from app.schemas.finding import FindingRead
from app.services.audit_service import record_audit_event
from app.services.clinician_summary_service import build_clinician_summary
from app.services.deidentification_service import build_deidentified_case_packet
from app.services.findings_service import get_finding, list_findings
from app.services.profile_service import get_active_profile
from app.services.report_service import DISCLAIMER
from app.services.settings_service import get_settings, list_source_configs

# Everything in this module is a *projection* for the Claude Desktop (MCP)
# gateway. The rules, in order of authority:
#   1. Case context leaves only via build_deidentified_case_packet(), which
#      fail-closes on any identity leak.
#   2. Findings/runs payloads carry public source data plus non-identifying
#      match rationale — never profile fields, match internals, LLM metadata,
#      or local file paths.
#   3. Access requires the user-enabled flag AND the connection code issued in
#      Firstlight Settings; both checks live in verify_mcp_request().

MCP_EVIDENCE_LIMIT = 3


# --- access control -----------------------------------------------------------


def enable_mcp_access(session: Session) -> str:
    """Enable Claude Desktop access and return the connection code.

    The plaintext code is returned exactly once for the user to paste into the
    extension; only the encrypted form is stored (same machinery as provider
    API keys). Calling this again rotates the code.
    """

    settings = get_settings(session)
    token = secrets.token_urlsafe(32)
    settings.mcp_access_enabled = True
    settings.mcp_access_token_encrypted = encrypt_secret(token)
    session.commit()
    record_audit_event("mcp_access_enabled", {"rotated": True})
    return token


def disable_mcp_access(session: Session) -> None:
    settings = get_settings(session)
    settings.mcp_access_enabled = False
    settings.mcp_access_token_encrypted = None
    session.commit()
    record_audit_event("mcp_access_disabled", {})


def mcp_access_status(session: Session) -> dict[str, Any]:
    settings = get_settings(session)
    return {
        "enabled": bool(settings.mcp_access_enabled),
        "has_token": bool(settings.mcp_access_token_encrypted),
    }


def verify_mcp_token(session: Session, presented: str | None) -> bool:
    settings = get_settings(session)
    if not settings.mcp_access_enabled:
        return False
    stored = decrypt_secret(settings.mcp_access_token_encrypted)
    if not presented or not stored:
        return False
    return hmac.compare_digest(stored, presented)


# --- payload projections ------------------------------------------------------


def _to_mcp_finding(finding: Finding) -> dict[str, Any]:
    read = FindingRead.model_validate(finding)
    return {
        "finding_id": read.id,
        "type": read.type,
        "title": read.title,
        "source_name": read.source_name,
        "source_url": read.source_url,
        "external_identifier": read.external_identifier,
        "retrieved_at": read.retrieved_at,
        "published_at": read.published_at,
        "structured_tags": read.structured_tags,
        "normalized_summary": read.normalized_summary,
        "why_it_surfaced": read.why_it_surfaced,
        "why_it_may_not_fit": read.why_it_may_not_fit,
        "confidence": read.confidence,
        "score": read.score,
        "relevance_label": read.relevance_label,
        "status": read.status,
        "user_action": read.user_action,
        # Trial-site geography from the public source record, not the profile.
        "location_summary": read.location_summary,
        "matching_gaps": read.matching_gaps,
        "trial_recruitment_status": read.trial_recruitment_status,
        "trial_phases": read.trial_phases,
        "trial_sponsor": read.trial_sponsor,
        "trial_intervention_summary": read.trial_intervention_summary,
        "evidence": [
            {
                "label": item.label,
                "snippet": item.snippet,
                "source_url": item.source_url,
                "source_identifier": item.source_identifier,
                "published_at": item.published_at,
            }
            for item in read.evidence_items[:MCP_EVIDENCE_LIMIT]
        ],
    }


def _condensed_to_mcp(item: dict[str, Any]) -> dict[str, Any]:
    projected = dict(item)
    projected["finding_id"] = projected.pop("id", None)
    return projected


def mcp_status(session: Session) -> dict[str, Any]:
    settings = get_settings(session)
    onboarding = session.scalar(select(OnboardingState))
    latest_run = session.scalar(select(MonitoringRun).order_by(MonitoringRun.started_at.desc()))
    total_findings = session.scalar(select(func.count(Finding.id))) or 0
    return {
        "app_name": APP_NAME,
        "app_version": APP_VERSION,
        "onboarding_completed": bool(onboarding.is_completed) if onboarding else False,
        "has_profile": get_active_profile(session) is not None,
        "privacy_mode": settings.privacy_mode,
        "latest_run_status": latest_run.status if latest_run else None,
        "latest_run_started_at": latest_run.started_at if latest_run else None,
        "latest_run_completed_at": latest_run.completed_at if latest_run else None,
        "total_findings": int(total_findings),
        "sources_enabled": [config.connector_key for config in list_source_configs(session) if config.enabled],
        "disclaimer": DISCLAIMER,
    }


def mcp_findings(
    session: Session,
    *,
    finding_type: str | None = None,
    query: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    profile = get_active_profile(session)
    if profile is None:
        return {"total": 0, "items": [], "disclaimer": DISCLAIMER}
    items = list_findings(
        session,
        profile_id=profile.id,
        finding_type=finding_type,
        q=query,
        include_dismissed=False,
    )
    return {
        "total": len(items),
        "items": [_to_mcp_finding(finding) for finding in items[:limit]],
        "disclaimer": DISCLAIMER,
    }


def mcp_finding_detail(session: Session, finding_id: int) -> dict[str, Any] | None:
    finding = get_finding(session, finding_id)
    if finding is None:
        return None
    return _to_mcp_finding(finding)


def mcp_case_context(session: Session) -> dict[str, Any] | None:
    """The patient's case context, only ever as the de-identified packet."""

    profile = get_active_profile(session)
    if profile is None:
        return None
    packet = build_deidentified_case_packet(profile=profile, findings=[], task="patient_summary")
    return {"packet": packet, "disclaimer": DISCLAIMER}


def mcp_clinician_summary(session: Session) -> dict[str, Any] | None:
    profile = get_active_profile(session)
    if profile is None:
        return None
    findings = list_findings(session, profile_id=profile.id, include_dismissed=False)
    summary = build_clinician_summary(session, profile=profile, findings=findings)
    # The full summary's case_header carries raw profile fields (exact staging
    # text, location label, therapy history) — replace it with the
    # de-identified profile context so this surface obeys the Mode 2 boundary.
    packet = build_deidentified_case_packet(profile=profile, findings=[], task="clinician_summary")
    return {
        "generated_at": summary["generated_at"],
        "case_context": packet["profile_context"],
        "case_framing": summary["case_framing"]["text"],
        "trial_findings": [_condensed_to_mcp(item) for item in summary["trial_findings"]],
        "research_findings": [_condensed_to_mcp(item) for item in summary["research_findings"]],
        "discussion_questions": summary["discussion_questions"],
        "data_gaps": summary["data_gaps"],
        "disclaimer": summary["disclaimer"],
    }


def mcp_runs(session: Session, *, limit: int = 10) -> dict[str, Any]:
    runs = session.scalars(
        select(MonitoringRun).order_by(MonitoringRun.started_at.desc()).limit(limit)
    ).all()
    return {
        "items": [
            {
                "run_id": run.id,
                "status": run.status,
                "triggered_by": run.triggered_by,
                "started_at": run.started_at,
                "completed_at": run.completed_at,
                "new_findings_count": run.new_findings_count,
                "changed_findings_count": run.changed_findings_count,
                "sources_checked": list(run.sources_checked or []),
            }
            for run in runs
        ]
    }
