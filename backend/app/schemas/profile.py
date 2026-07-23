from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class BiomarkerBase(BaseModel):
    name: str = ""
    variant: str | None = None
    status: str | None = None
    notes: str | None = None


class BiomarkerCreate(BiomarkerBase):
    pass


class BiomarkerRead(BiomarkerBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


class TherapyHistoryEntryBase(BaseModel):
    therapy_name: str = ""
    therapy_type: str | None = None
    line_of_therapy: str | None = None
    status: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None


class TherapyHistoryEntryCreate(TherapyHistoryEntryBase):
    pass


class TherapyHistoryEntryRead(TherapyHistoryEntryBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


class PatientProfileBase(BaseModel):
    profile_name: str = "My profile"
    display_name: str | None = None
    date_of_birth: date | None = None
    cancer_type: str = ""
    subtype: str | None = None
    stage_or_context: str | None = None
    current_therapy_status: str | None = None
    location_label: str | None = None
    travel_radius_miles: int | None = None
    notes: str | None = None
    would_consider: list[str] = Field(default_factory=list)
    would_not_consider: list[str] = Field(default_factory=list)
    is_active: bool = True


class PatientProfileCreate(PatientProfileBase):
    biomarkers: list[BiomarkerCreate] = Field(default_factory=list)
    therapy_history: list[TherapyHistoryEntryCreate] = Field(default_factory=list)


class PatientProfileUpdate(PatientProfileCreate):
    pass


class PatientProfileRead(PatientProfileBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    biomarkers: list[BiomarkerRead] = Field(default_factory=list)
    therapy_history: list[TherapyHistoryEntryRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ProfileExtractRequest(BaseModel):
    text: str = Field(min_length=1)
    # Opt-in per paste: attempt a de-identified AI pass in addition to local rules.
    allow_ai: bool = False


class ProfileExtractResponse(BaseModel):
    cancer_type: str | None = None
    subtype: str | None = None
    stage_or_context: str | None = None
    biomarkers: list[BiomarkerCreate] = Field(default_factory=list)
    therapy_history: list[TherapyHistoryEntryCreate] = Field(default_factory=list)
    notes: str | None = None
    warnings: list[str] = Field(default_factory=list)
    # AI-assist outcome: not_requested | local_only | disclosure_required | ai_unavailable
    # | redaction_failed | ai_failed | ai_assisted | ai_no_additions
    ai_status: str = "not_requested"
    ai_message: str | None = None
