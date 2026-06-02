from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.finding import Finding, FindingEvidence
from app.models.profile import Biomarker, PatientProfile, TherapyHistoryEntry
from app.models.run import MonitoringRun
from app.models.settings import AppSettings, ReportExport
from app.services.audit_service import record_audit_event
from app.services.profile_service import list_profiles
from app.utils.dates import utcnow

logger = logging.getLogger(__name__)


def _serialize_profile(profile: PatientProfile) -> dict[str, Any]:
    return {
        "profile_name": profile.profile_name,
        "display_name": profile.display_name,
        "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
        "cancer_type": profile.cancer_type,
        "subtype": profile.subtype,
        "stage_or_context": profile.stage_or_context,
        "current_therapy_status": profile.current_therapy_status,
        "location_label": profile.location_label,
        "travel_radius_miles": profile.travel_radius_miles,
        "notes": profile.notes,
        "would_consider": profile.would_consider,
        "would_not_consider": profile.would_not_consider,
        "biomarkers": [
            {"name": b.name, "variant": b.variant, "status": b.status, "notes": b.notes}
            for b in profile.biomarkers
        ],
        "therapy_history": [
            {
                "therapy_name": t.therapy_name,
                "therapy_type": t.therapy_type,
                "line_of_therapy": t.line_of_therapy,
                "status": t.status,
                "start_date": t.start_date.isoformat() if t.start_date else None,
                "end_date": t.end_date.isoformat() if t.end_date else None,
                "notes": t.notes,
            }
            for t in profile.therapy_history
        ],
    }


def export_all_data(session: Session) -> dict[str, Any]:
    """Build a portable, plaintext snapshot of the user's own local data.

    This is the patient exercising data portability over their own device, so
    identifying fields are decrypted in the export.
    """
    profiles = list_profiles(session)
    findings = session.scalars(select(Finding)).all()
    runs = session.scalars(select(MonitoringRun)).all()
    reports = session.scalars(select(ReportExport)).all()

    export = {
        "exported_at": utcnow().isoformat(),
        "schema": "oncowatch.export.v1",
        "profiles": [_serialize_profile(profile) for profile in profiles],
        "findings": [
            {
                "type": f.type,
                "title": f.title,
                "source_name": f.source_name,
                "source_url": f.source_url,
                "external_identifier": f.external_identifier,
                "relevance_label": f.relevance_label,
                "score": f.score,
                "status": f.status,
                "why_it_surfaced": f.why_it_surfaced,
                "why_it_may_not_fit": f.why_it_may_not_fit,
                "matching_gaps": f.matching_gaps,
                "retrieved_at": f.retrieved_at.isoformat() if f.retrieved_at else None,
            }
            for f in findings
        ],
        "monitoring_runs": [
            {
                "status": r.status,
                "triggered_by": r.triggered_by,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "new_findings_count": r.new_findings_count,
                "changed_findings_count": r.changed_findings_count,
            }
            for r in runs
        ],
        "reports": [
            {
                "report_type": r.report_type,
                "status": r.status,
                "file_path": r.file_path,
                "generated_at": r.generated_at.isoformat() if r.generated_at else None,
            }
            for r in reports
        ],
    }
    record_audit_event(
        "data_exported",
        {"profiles": len(profiles), "findings": len(findings), "reports": len(reports)},
    )
    return export


def delete_all_data(session: Session) -> dict[str, int]:
    """Permanently delete all patient data: profiles, findings, runs, and reports.

    App settings, source configuration, and onboarding state are preserved so
    the app remains usable after a wipe. Generated report PDFs are removed from
    disk as well.
    """
    report_paths = [row.file_path for row in session.scalars(select(ReportExport)).all()]

    counts = {
        "findings": len(session.scalars(select(Finding.id)).all()),
        "monitoring_runs": len(session.scalars(select(MonitoringRun.id)).all()),
        "reports": len(session.scalars(select(ReportExport.id)).all()),
        "profiles": len(session.scalars(select(PatientProfile.id)).all()),
    }

    # Detach the default profile pointer before removing profiles.
    for settings in session.scalars(select(AppSettings)).all():
        settings.default_profile_id = None

    # Delete in dependency order so the wipe works regardless of whether
    # SQLite foreign-key cascades are enabled on the active connection.
    session.execute(
        delete(FindingEvidence).where(
            FindingEvidence.finding_id.in_(select(Finding.id))
        )
    )
    session.execute(delete(Finding))
    session.execute(delete(MonitoringRun))
    session.execute(delete(ReportExport))
    session.execute(delete(Biomarker))
    session.execute(delete(TherapyHistoryEntry))
    session.execute(delete(PatientProfile))
    session.commit()

    removed_files = 0
    for raw_path in report_paths:
        try:
            path = Path(raw_path)
            if path.is_file():
                path.unlink()
                removed_files += 1
        except OSError as exc:  # pragma: no cover - depends on disk state
            logger.warning("Could not delete report file %s: %s", raw_path, exc)

    counts["report_files_removed"] = removed_files
    record_audit_event("data_deleted", counts)
    return counts
