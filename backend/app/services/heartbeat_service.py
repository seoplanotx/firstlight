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
from app.services.llm_service import create_llm_client, validate_clinician_questions
from app.services.settings_service import get_active_provider, get_provider_api_key, get_settings

HEARTBEAT_WORKFLOW_NAME = "heartbeat_briefing"
HEARTBEAT_WORKFLOW_VERSION = "v1"


def deterministic_briefing_questions(profile: PatientProfile, findings: list[Finding]) -> list[str]:
    questions: list[str] = []
    if profile.biomarkers:
        questions.append("Does the current molecular testing still capture the most important resistance changes to review now?")
    if any(item.type == "clinical_trials" for item in findings):
        questions.append("Are any of these trials worth a formal clinician screening review based on the full chart and current performance status?")
    if profile.current_therapy_status:
        questions.append("Do any of these updates raise clinician-review questions for the current plan or future options?")
    if any(item.matching_gaps for item in findings):
        questions.append("Which missing details matter most before deciding whether any finding is worth reviewing further?")
    questions.append("Is additional tissue or liquid biopsy testing worth discussing before the next major treatment decision?")
    return questions[:5]


def _source_status(summary: dict[str, Any]) -> dict[str, Any]:
    message = summary.get("message") or summary.get("error")
    payload = {
        "connector_key": str(summary.get("connector_key") or "unknown"),
        "status": str(summary.get("status") or "unknown"),
        "retrieved": int(summary.get("retrieved") or 0),
    }
    if message:
        payload["message"] = str(message)
    return payload


def _source_failures(source_statuses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [status for status in source_statuses if status.get("status") != "ok"]


def _ai_questions(
    *,
    session: Session,
    profile: PatientProfile,
    findings: list[Finding],
    fallback_questions: list[str],
) -> tuple[list[str], dict[str, Any]]:
    settings = get_settings(session)
    mode = settings.privacy_mode or PRIVACY_MODE_LOCAL_ONLY

    if mode != PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST:
        return fallback_questions, {
            "mode": PRIVACY_MODE_LOCAL_ONLY,
            "status": "deterministic_fallback",
            "provider": None,
            "model": None,
        }

    if not settings.deidentified_ai_disclosure_acknowledged:
        return fallback_questions, {
            "mode": PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
            "status": "disclosure_required",
            "provider": None,
            "model": None,
        }

    provider_key, provider = get_active_provider(session)
    api_key = get_provider_api_key(provider)
    if provider is None or not provider.is_configured or not provider.selected_model or not api_key:
        return fallback_questions, {
            "mode": PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
            "status": "ai_unavailable",
            "provider": provider_key,
            "model": provider.selected_model if provider else None,
        }

    try:
        case_packet = build_deidentified_case_packet(
            profile=profile,
            findings=findings[:8],
            task="clinician_questions",
        )
        questions = validate_clinician_questions(
            create_llm_client(
                provider_key, api_key=api_key, model=provider.selected_model
            ).generate_clinician_questions(case_packet=case_packet)
        )
    except Exception as exc:
        return fallback_questions, {
            "mode": PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
            "status": "ai_failed",
            "provider": provider_key,
            "model": provider.selected_model,
            "message": str(exc),
        }

    if not questions:
        return fallback_questions, {
            "mode": PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
            "status": "ai_failed",
            "provider": provider_key,
            "model": provider.selected_model,
            "message": "AI provider returned no usable clinician-review questions; deterministic fallback was used.",
        }

    return questions[:5], {
        "mode": PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
        "status": "ai_generated",
        "provider": provider_key,
        "model": provider.selected_model,
    }


def build_heartbeat_metadata(
    session: Session,
    *,
    profile: PatientProfile,
    findings: list[Finding],
    connector_summaries: list[dict[str, Any]],
) -> dict[str, Any]:
    source_statuses = [_source_status(summary) for summary in connector_summaries]
    fallback_questions = deterministic_briefing_questions(profile, findings)
    questions, question_generation = _ai_questions(
        session=session,
        profile=profile,
        findings=findings,
        fallback_questions=fallback_questions,
    )

    return {
        "workflow": {
            "name": HEARTBEAT_WORKFLOW_NAME,
            "version": HEARTBEAT_WORKFLOW_VERSION,
        },
        "source_statuses": source_statuses,
        "source_failures": _source_failures(source_statuses),
        "suggested_questions": questions,
        "question_generation": question_generation,
    }
