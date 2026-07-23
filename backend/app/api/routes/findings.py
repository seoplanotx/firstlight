from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.finding import (
    FindingActionBulkUpdate,
    FindingActionUpdate,
    FindingRead,
    FindingsQueryResponse,
    PlainLanguageResponse,
)
from app.services.findings_service import get_finding, list_findings, set_finding_action, set_finding_actions_bulk
from app.services.plain_language_service import generate_plain_language
from app.services.profile_service import get_active_profile

router = APIRouter()

# Calm, non-technical explanations for each non-generating status. `ai_generated` and
# `cached` need no message (the summary speaks for itself).
_PLAIN_LANGUAGE_MESSAGES = {
    "local_only": "Turn on optional de-identified AI help in Settings to add plain-language summaries.",
    "disclosure_required": "Acknowledge the AI privacy disclosure in Settings to use plain-language summaries.",
    "ai_unavailable": "Add and select an AI provider in Settings to use plain-language summaries.",
    "ai_failed": "The AI helper could not produce a plain-language summary right now. Nothing changed.",
}


@router.get("", response_model=FindingsQueryResponse)
def read_findings(
    finding_type: str | None = Query(default=None),
    q: str | None = Query(default=None),
    profile_id: int | None = Query(default=None),
    include_dismissed: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> FindingsQueryResponse:
    if profile_id is None:
        profile = get_active_profile(db)
        profile_id = profile.id if profile else None
    items = list_findings(
        db,
        profile_id=profile_id,
        finding_type=finding_type,
        q=q,
        include_dismissed=include_dismissed,
    )
    return FindingsQueryResponse(total=len(items), items=items)


@router.post("/actions/bulk", response_model=FindingsQueryResponse)
def update_finding_actions_bulk(
    payload: FindingActionBulkUpdate,
    db: Session = Depends(get_db),
) -> FindingsQueryResponse:
    items = set_finding_actions_bulk(db, payload.finding_ids, payload.action)
    return FindingsQueryResponse(total=len(items), items=items)


@router.get("/{finding_id}", response_model=FindingRead)
def read_finding_detail(finding_id: int, db: Session = Depends(get_db)) -> FindingRead:
    finding = get_finding(db, finding_id)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return finding


@router.post("/{finding_id}/action", response_model=FindingRead)
def update_finding_action(
    finding_id: int,
    payload: FindingActionUpdate,
    db: Session = Depends(get_db),
) -> FindingRead:
    finding = set_finding_action(db, finding_id, payload.action)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return finding


@router.post("/{finding_id}/plain-language", response_model=PlainLanguageResponse)
def create_plain_language_summary(finding_id: int, db: Session = Depends(get_db)) -> PlainLanguageResponse:
    """Generate (or return a cached) plain-language explanation of a finding's public
    source text. Returns 200 with a status even when AI assist is off, so the UI can
    explain calmly rather than surfacing an error."""

    result = generate_plain_language(db, finding_id)
    finding = result["finding"]
    if result["status"] == "not_found" or finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    message = result.get("message") or _PLAIN_LANGUAGE_MESSAGES.get(result["status"])
    return PlainLanguageResponse(finding=finding, status=result["status"], message=message)
