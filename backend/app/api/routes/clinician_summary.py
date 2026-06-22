from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.clinician_summary import ClinicianSummaryRead
from app.services.clinician_summary_service import build_clinician_summary
from app.services.findings_service import list_findings
from app.services.profile_service import get_active_profile, get_profile

router = APIRouter()


@router.get("", response_model=ClinicianSummaryRead)
def read_clinician_summary(
    profile_id: int | None = None, db: Session = Depends(get_db)
) -> ClinicianSummaryRead:
    profile = get_profile(db, profile_id) if profile_id else get_active_profile(db)
    if profile is None:
        raise HTTPException(status_code=400, detail="Create a patient profile first.")
    findings = list_findings(db, profile_id=profile.id)
    return build_clinician_summary(db, profile=profile, findings=findings)
