from __future__ import annotations

from datetime import datetime, timezone
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Biomarker, Finding, MonitoringRun, PatientProfile
from app.services.clinician_summary_service import build_clinician_summary
from app.services.deidentification_service import PRIVACY_MODE_LOCAL_ONLY


def build_profile() -> PatientProfile:
    profile = PatientProfile(
        profile_name="Sample EGFR NSCLC",
        cancer_type="Non-small cell lung cancer",
        subtype="Adenocarcinoma",
        stage_or_context="Metastatic",
        current_therapy_status="Discussing next line therapy",
        location_label="Dallas, Texas",
        travel_radius_miles=100,
        would_consider=["clinical trials"],
        would_not_consider=["chemotherapy"],
        is_active=True,
    )
    profile.biomarkers = [Biomarker(name="EGFR", variant="Exon 19 deletion", status="positive")]
    return profile


def build_finding(
    *,
    profile_id: int,
    monitoring_run_id: int,
    title: str,
    external_identifier: str,
    finding_type: str,
    status: str,
    score: float,
    relevance_label: str,
    recruitment_bucket: str | None = None,
    freshness_bucket: str | None = None,
) -> Finding:
    timestamp = datetime(2026, 3, 27, 4, 0, tzinfo=timezone.utc)
    return Finding(
        profile_id=profile_id,
        monitoring_run_id=monitoring_run_id,
        type=finding_type,
        title=title,
        source_name="ClinicalTrials.gov" if finding_type == "clinical_trials" else "PubMed",
        source_url=f"https://example.org/{external_identifier}",
        external_identifier=external_identifier,
        retrieved_at=timestamp,
        published_at=timestamp,
        structured_tags=[],
        raw_summary=f"Raw summary for {title}",
        normalized_summary=f"Normalized summary for {title}",
        why_it_surfaced=f"Why {title} surfaced",
        why_it_may_not_fit=None,
        confidence="high",
        score=score,
        relevance_label=relevance_label,
        status=status,
        location_summary="Dallas, Texas",
        matching_gaps=["Performance status was not available."],
        match_debug={
            "normalized_facts": {
                "record": {
                    "recruitment_bucket": recruitment_bucket,
                    "evidence_freshness_bucket": freshness_bucket,
                }
            }
        },
        content_hash=f"hash-{external_identifier}",
        llm_metadata={},
        created_at=timestamp,
        updated_at=timestamp,
    )


class ClinicianSummaryServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)

    def tearDown(self) -> None:
        self.engine.dispose()

    def _seed(self, session) -> tuple[PatientProfile, list[Finding]]:
        profile = build_profile()
        session.add(profile)
        session.commit()
        session.refresh(profile)

        run = MonitoringRun(
            profile_id=profile.id,
            status="completed",
            triggered_by="manual",
            started_at=datetime(2026, 3, 27, 4, 0, tzinfo=timezone.utc),
            completed_at=datetime(2026, 3, 27, 4, 5, tzinfo=timezone.utc),
            new_findings_count=1,
            changed_findings_count=1,
            summary_json={},
            sources_checked=[],
        )
        session.add(run)
        session.commit()
        session.refresh(run)

        findings = [
            build_finding(
                profile_id=profile.id,
                monitoring_run_id=run.id,
                title="New recruiting EGFR trial",
                external_identifier="NCT-NEW-OPEN",
                finding_type="clinical_trials",
                status="new",
                score=91.0,
                relevance_label="High relevance",
                recruitment_bucket="open",
                freshness_bucket="very_recent",
            ),
            build_finding(
                profile_id=profile.id,
                monitoring_run_id=run.id,
                title="EGFR literature update",
                external_identifier="LIT-1",
                finding_type="literature",
                status="changed",
                score=73.0,
                relevance_label="Worth reviewing",
                freshness_bucket="recent",
            ),
        ]
        session.add_all(findings)
        session.commit()
        return profile, findings

    def test_local_only_summary_uses_deterministic_framing(self) -> None:
        with self.session_factory() as session:
            profile, findings = self._seed(session)
            summary = build_clinician_summary(session, profile=profile, findings=findings)

            self.assertEqual(summary["case_header"]["cancer_type"], "Non-small cell lung cancer")
            self.assertEqual(summary["case_header"]["biomarkers"][0]["name"], "EGFR")

            # Local-only mode must never call an external provider.
            self.assertEqual(summary["case_framing"]["generation"]["mode"], PRIVACY_MODE_LOCAL_ONLY)
            self.assertEqual(summary["case_framing"]["generation"]["status"], "deterministic_fallback")
            self.assertIn("trial", summary["case_framing"]["text"])

            self.assertEqual(len(summary["trial_findings"]), 1)
            self.assertEqual(summary["trial_findings"][0]["identifier"], "NCT-NEW-OPEN")
            self.assertEqual(summary["trial_findings"][0]["recruitment_bucket"], "open")
            self.assertEqual(len(summary["research_findings"]), 1)
            self.assertEqual(summary["research_findings"][0]["type"], "literature")

            self.assertTrue(summary["discussion_questions"])
            self.assertIsInstance(summary["data_gaps"], list)
            self.assertTrue(summary["disclaimer"])

    def test_research_finding_excludes_trials(self) -> None:
        with self.session_factory() as session:
            profile, findings = self._seed(session)
            summary = build_clinician_summary(session, profile=profile, findings=findings)

            research_types = {item["type"] for item in summary["research_findings"]}
            self.assertNotIn("clinical_trials", research_types)


if __name__ == "__main__":
    unittest.main()
