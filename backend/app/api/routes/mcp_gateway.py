from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.mcp import (
    McpCaseContextResponse,
    McpClinicianSummaryResponse,
    McpFinding,
    McpFindingsResponse,
    McpRunsResponse,
    McpStatusResponse,
)
from app.services.deidentification_service import DeidentificationError
from app.services.mcp_gateway_service import (
    mcp_case_context,
    mcp_clinician_summary,
    mcp_finding_detail,
    mcp_findings,
    mcp_runs,
    mcp_status,
    verify_mcp_token,
)
from app.services.settings_service import get_settings

router = APIRouter()


def require_mcp_access(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Session:
    settings = get_settings(db)
    if not settings.mcp_access_enabled:
        raise HTTPException(
            status_code=403,
            detail=(
                "Claude Desktop access is turned off in Firstlight. "
                "Turn it on in Firstlight Settings → Claude Desktop connection."
            ),
        )
    presented: str | None = None
    if authorization and authorization.lower().startswith("bearer "):
        presented = authorization[7:].strip() or None
    if not verify_mcp_token(db, presented):
        raise HTTPException(
            status_code=401,
            detail=(
                "Invalid or missing Firstlight connection code. Generate a new code in "
                "Firstlight Settings → Claude Desktop connection and update the extension settings."
            ),
        )
    return db


@router.get("/status", response_model=McpStatusResponse)
def read_status(db: Session = Depends(require_mcp_access)) -> McpStatusResponse:
    return McpStatusResponse(**mcp_status(db))


@router.get("/findings", response_model=McpFindingsResponse)
def read_findings(
    finding_type: str | None = Query(default=None),
    query: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(require_mcp_access),
) -> McpFindingsResponse:
    return McpFindingsResponse(**mcp_findings(db, finding_type=finding_type, query=query, limit=limit))


@router.get("/findings/{finding_id}", response_model=McpFinding)
def read_finding(finding_id: int, db: Session = Depends(require_mcp_access)) -> McpFinding:
    payload = mcp_finding_detail(db, finding_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    return McpFinding(**payload)


@router.get("/case-context", response_model=McpCaseContextResponse)
def read_case_context(db: Session = Depends(require_mcp_access)) -> McpCaseContextResponse:
    try:
        payload = mcp_case_context(db)
    except DeidentificationError as exc:
        raise HTTPException(
            status_code=422,
            detail="Case context could not be de-identified safely, so nothing was shared.",
        ) from exc
    if payload is None:
        raise HTTPException(status_code=404, detail="No patient profile exists in Firstlight yet.")
    return McpCaseContextResponse(**payload)


@router.get("/clinician-summary", response_model=McpClinicianSummaryResponse)
def read_clinician_summary(db: Session = Depends(require_mcp_access)) -> McpClinicianSummaryResponse:
    try:
        payload = mcp_clinician_summary(db)
    except DeidentificationError as exc:
        raise HTTPException(
            status_code=422,
            detail="Case context could not be de-identified safely, so nothing was shared.",
        ) from exc
    if payload is None:
        raise HTTPException(status_code=404, detail="No patient profile exists in Firstlight yet.")
    return McpClinicianSummaryResponse(**payload)


@router.get("/runs", response_model=McpRunsResponse)
def read_runs(
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(require_mcp_access),
) -> McpRunsResponse:
    return McpRunsResponse(**mcp_runs(db, limit=limit))
