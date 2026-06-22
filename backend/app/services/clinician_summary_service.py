from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.finding import Finding
from app.models.profile import PatientProfile
from app.services.deidentification_service import (
    PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
    PRIVACY_MODE_LOCAL_ONLY,
    build_deidentified_case_packet,
)
from app.services.findings_service import (
    _build_confidence_blockers,
    literature_priority_key,
    trial_priority_key,
)
from app.services.heartbeat_service import deterministic_briefing_questions
from app.services.llm_service import OpenRouterClient, validate_case_framing
from app.services.report_service import DISCLAIMER
from app.services.settings_service import get_provider_api_key, get_provider_config, get_settings
from app.utils.dates import utcnow

TRIAL_LIMIT = 12
RESEARCH_LIMIT = 12
RESEARCH_TYPES = {"literature", "drug_updates", "biomarker"}


def build_confidence_blockers(findings: list[Finding], *, limit: int = 5) -> list[dict[str, Any]]:
    """Public wrapper over the shared blocker aggregation used across briefings."""

    return _build_confidence_blockers(findings, limit=limit)


def _record_facts(finding: Finding) -> dict[str, Any]:
    match_debug = finding.match_debug if isinstance(finding.match_debug, dict) else {}
    normalized_facts = match_debug.get("normalized_facts")
    if not isinstance(normalized_facts, dict):
        return {}
    record = normalized_facts.get("record")
    return record if isinstance(record, dict) else {}


def _condensed_finding(finding: Finding) -> dict[str, Any]:
    facts = _record_facts(finding)
    recruitment_bucket = facts.get("recruitment_bucket") if finding.type == "clinical_trials" else None
    return {
        "id": finding.id,
        "type": finding.type,
        "title": finding.title,
        "source_name": finding.source_name,
        "source_url": finding.source_url,
        "identifier": finding.external_identifier,
        "relevance_label": finding.relevance_label,
        "score": float(finding.score or 0.0),
        "status": finding.status,
        "recruitment_bucket": str(recruitment_bucket) if recruitment_bucket else None,
        "freshness_bucket": (
            str(facts.get("evidence_freshness_bucket")) if facts.get("evidence_freshness_bucket") else None
        ),
        "why_it_surfaced": finding.why_it_surfaced,
        "why_it_may_not_fit": finding.why_it_may_not_fit,
        "matching_gaps": list(finding.matching_gaps or []),
        "user_action": finding.user_action,
    }


def _case_header(profile: PatientProfile) -> dict[str, Any]:
    return {
        "cancer_type": profile.cancer_type,
        "subtype": profile.subtype,
        "stage_or_context": profile.stage_or_context,
        "current_therapy_status": profile.current_therapy_status,
        "location_label": profile.location_label,
        "travel_radius_miles": profile.travel_radius_miles,
        "biomarkers": [
            {"name": b.name, "variant": b.variant, "status": b.status} for b in profile.biomarkers
        ],
        "lines_of_therapy": [
            {
                "therapy_name": t.therapy_name,
                "therapy_type": t.therapy_type,
                "line_of_therapy": t.line_of_therapy,
                "status": t.status,
                "start_date": t.start_date.isoformat() if t.start_date else None,
                "end_date": t.end_date.isoformat() if t.end_date else None,
            }
            for t in profile.therapy_history
        ],
        "would_consider": list(profile.would_consider or []),
        "would_not_consider": list(profile.would_not_consider or []),
    }


def _deterministic_framing(profile: PatientProfile, trial_count: int, research_count: int) -> str:
    descriptor = profile.cancer_type or "This case"
    if profile.subtype:
        descriptor = f"{descriptor} ({profile.subtype})"
    stage = f", {profile.stage_or_context}" if profile.stage_or_context else ""
    return (
        f"{descriptor}{stage}: {trial_count} trial and {research_count} research "
        "items flagged for clinician review."
    )


def _case_framing(
    *,
    session: Session,
    profile: PatientProfile,
    findings: list[Finding],
    trial_count: int,
    research_count: int,
) -> dict[str, Any]:
    fallback = _deterministic_framing(profile, trial_count, research_count)
    settings = get_settings(session)
    mode = settings.privacy_mode or PRIVACY_MODE_LOCAL_ONLY

    if mode != PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST:
        return {
            "text": fallback,
            "generation": {
                "mode": PRIVACY_MODE_LOCAL_ONLY,
                "status": "deterministic_fallback",
                "provider": None,
                "model": None,
            },
        }

    if not settings.deidentified_ai_disclosure_acknowledged:
        return {
            "text": fallback,
            "generation": {
                "mode": PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
                "status": "disclosure_required",
                "provider": None,
                "model": None,
            },
        }

    provider = get_provider_config(session, "openrouter")
    api_key = get_provider_api_key(provider)
    if provider is None or not provider.is_configured or not provider.selected_model or not api_key:
        return {
            "text": fallback,
            "generation": {
                "mode": PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
                "status": "ai_unavailable",
                "provider": "openrouter",
                "model": provider.selected_model if provider else None,
            },
        }

    try:
        case_packet = build_deidentified_case_packet(
            profile=profile,
            findings=findings[:8],
            task="clinician_summary",
        )
        text = validate_case_framing(
            OpenRouterClient(api_key=api_key, model=provider.selected_model).generate_case_framing(
                case_packet=case_packet
            )
        )
    except Exception as exc:
        return {
            "text": fallback,
            "generation": {
                "mode": PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
                "status": "ai_failed",
                "provider": "openrouter",
                "model": provider.selected_model,
                "message": str(exc),
            },
        }

    if not text:
        return {
            "text": fallback,
            "generation": {
                "mode": PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
                "status": "ai_failed",
                "provider": "openrouter",
                "model": provider.selected_model,
                "message": "AI provider returned no usable case framing; deterministic fallback was used.",
            },
        }

    return {
        "text": text,
        "generation": {
            "mode": PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
            "status": "ai_generated",
            "provider": "openrouter",
            "model": provider.selected_model,
        },
    }


def build_clinician_summary(
    session: Session,
    *,
    profile: PatientProfile,
    findings: list[Finding],
) -> dict[str, Any]:
    trials = sorted((f for f in findings if f.type == "clinical_trials"), key=trial_priority_key)[:TRIAL_LIMIT]
    research = sorted((f for f in findings if f.type in RESEARCH_TYPES), key=literature_priority_key)[:RESEARCH_LIMIT]

    framing = _case_framing(
        session=session,
        profile=profile,
        findings=findings,
        trial_count=len(trials),
        research_count=len(research),
    )

    return {
        "generated_at": utcnow().isoformat(),
        "case_header": _case_header(profile),
        "case_framing": framing,
        "trial_findings": [_condensed_finding(f) for f in trials],
        "research_findings": [_condensed_finding(f) for f in research],
        "discussion_questions": deterministic_briefing_questions(profile, findings),
        "data_gaps": build_confidence_blockers([*trials, *research], limit=6),
        "disclaimer": DISCLAIMER,
    }
