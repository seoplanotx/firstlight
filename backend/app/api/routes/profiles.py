from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.profile import (
    PatientProfileCreate,
    PatientProfileRead,
    PatientProfileUpdate,
    ProfileExtractRequest,
    ProfileExtractResponse,
)
from app.services.profile_ai_service import extract_profile_candidates_ai
from app.services.profile_service import (
    create_profile,
    get_active_profile,
    get_profile,
    list_profiles,
    set_active_profile,
    update_profile,
)

router = APIRouter()


@router.get("", response_model=list[PatientProfileRead])
def get_profiles(db: Session = Depends(get_db)) -> list[PatientProfileRead]:
    return list_profiles(db)


@router.get("/active", response_model=PatientProfileRead | None)
def get_current_profile(db: Session = Depends(get_db)) -> PatientProfileRead | None:
    return get_active_profile(db)


@router.post("/extract-from-text", response_model=ProfileExtractResponse)
def extract_profile_from_text(
    payload: ProfileExtractRequest, db: Session = Depends(get_db)
) -> ProfileExtractResponse:
    result = extract_profile_candidates_ai(db, payload.text, allow_ai=payload.allow_ai)
    return ProfileExtractResponse(**result)


@router.get("/{profile_id}", response_model=PatientProfileRead)
def get_profile_detail(profile_id: int, db: Session = Depends(get_db)) -> PatientProfileRead:
    profile = get_profile(db, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.post("", response_model=PatientProfileRead)
def create_profile_route(payload: PatientProfileCreate, db: Session = Depends(get_db)) -> PatientProfileRead:
    return create_profile(db, payload)


@router.post("/{profile_id}/activate", response_model=PatientProfileRead)
def activate_profile_route(profile_id: int, db: Session = Depends(get_db)) -> PatientProfileRead:
    try:
        return set_active_profile(db, profile_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/{profile_id}", response_model=PatientProfileRead)
def update_profile_route(profile_id: int, payload: PatientProfileUpdate, db: Session = Depends(get_db)) -> PatientProfileRead:
    try:
        return update_profile(db, profile_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
