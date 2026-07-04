from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class McpAccessStatus(BaseModel):
    enabled: bool
    has_token: bool


class McpEnableResponse(BaseModel):
    enabled: bool
    # Shown exactly once at generation time; only the encrypted form is stored.
    connection_code: str


class McpStatusResponse(BaseModel):
    app_name: str
    app_version: str
    onboarding_completed: bool
    has_profile: bool
    privacy_mode: str
    latest_run_status: str | None = None
    latest_run_started_at: datetime | None = None
    latest_run_completed_at: datetime | None = None
    total_findings: int = 0
    sources_enabled: list[str] = Field(default_factory=list)
    disclaimer: str


class McpEvidenceItem(BaseModel):
    label: str | None = None
    snippet: str | None = None
    source_url: str | None = None
    source_identifier: str | None = None
    published_at: datetime | None = None


class McpFinding(BaseModel):
    # These schemas double as privacy projections: FastAPI's response_model
    # filtering drops any key not declared here, so new internal fields on
    # findings can never leak into MCP payloads by accident.
    finding_id: int
    type: str
    title: str
    source_name: str
    source_url: str | None = None
    external_identifier: str
    retrieved_at: datetime
    published_at: datetime | None = None
    structured_tags: list[str] = Field(default_factory=list)
    normalized_summary: str | None = None
    why_it_surfaced: str | None = None
    why_it_may_not_fit: str | None = None
    confidence: str
    score: float
    relevance_label: str
    status: str
    user_action: str = "none"
    location_summary: str | None = None
    matching_gaps: list[str] = Field(default_factory=list)
    trial_recruitment_status: str | None = None
    trial_phases: list[str] = Field(default_factory=list)
    trial_sponsor: str | None = None
    trial_intervention_summary: str | None = None
    evidence: list[McpEvidenceItem] = Field(default_factory=list)


class McpFindingsResponse(BaseModel):
    total: int
    items: list[McpFinding] = Field(default_factory=list)
    disclaimer: str


class McpCaseContextResponse(BaseModel):
    # The packet is produced by build_deidentified_case_packet(), which
    # asserts the de-identification contract before returning.
    packet: dict = Field(default_factory=dict)
    disclaimer: str


class McpCondensedFinding(BaseModel):
    finding_id: int | None = None
    type: str | None = None
    title: str | None = None
    source_name: str | None = None
    source_url: str | None = None
    identifier: str | None = None
    relevance_label: str | None = None
    score: float = 0.0
    status: str | None = None
    recruitment_bucket: str | None = None
    freshness_bucket: str | None = None
    why_it_surfaced: str | None = None
    why_it_may_not_fit: str | None = None
    matching_gaps: list[str] = Field(default_factory=list)
    user_action: str | None = None


class McpDataGap(BaseModel):
    label: str
    finding_count: int = 0
    examples: list[str] = Field(default_factory=list)


class McpClinicianSummaryResponse(BaseModel):
    generated_at: str
    # De-identified profile context only — never the raw case header.
    case_context: dict = Field(default_factory=dict)
    case_framing: str
    trial_findings: list[McpCondensedFinding] = Field(default_factory=list)
    research_findings: list[McpCondensedFinding] = Field(default_factory=list)
    discussion_questions: list[str] = Field(default_factory=list)
    data_gaps: list[McpDataGap] = Field(default_factory=list)
    disclaimer: str


class McpRun(BaseModel):
    run_id: int
    status: str
    triggered_by: str
    started_at: datetime
    completed_at: datetime | None = None
    new_findings_count: int = 0
    changed_findings_count: int = 0
    sources_checked: list[str] = Field(default_factory=list)


class McpRunsResponse(BaseModel):
    items: list[McpRun] = Field(default_factory=list)
