from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.finding import Finding, FindingEvidence
from app.models.profile import Biomarker, PatientProfile, TherapyHistoryEntry
from app.models.run import MonitoringRun
from app.models.settings import AppSettings, ReportExport
from app.services import audit_service, data_service


class DataServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)

        self._tmp = TemporaryDirectory()
        self._audit_patch = patch.object(
            audit_service,
            "get_app_paths",
            return_value=SimpleNamespace(logs_dir=Path(self._tmp.name)),
        )
        self._audit_patch.start()

    def tearDown(self) -> None:
        self._audit_patch.stop()
        self._tmp.cleanup()
        self.engine.dispose()

    def _seed(self, session) -> tuple[int, Path]:
        report_file = Path(self._tmp.name) / "report.pdf"
        report_file.write_bytes(b"%PDF-1.4 test")

        profile = PatientProfile(
            profile_name="Jane Patient Smith",
            display_name="J.S.",
            cancer_type="NSCLC",
            location_label="Texas",
            would_consider=[],
            would_not_consider=[],
        )
        profile.biomarkers = [Biomarker(name="EGFR", variant="Exon 19 deletion")]
        profile.therapy_history = [TherapyHistoryEntry(therapy_name="Osimertinib")]
        session.add(profile)
        session.commit()
        session.refresh(profile)

        run = MonitoringRun(profile_id=profile.id, status="completed", triggered_by="manual", sources_checked=[])
        session.add(run)
        finding = Finding(
            profile_id=profile.id,
            type="clinical_trials",
            title="A trial",
            source_name="ClinicalTrials.gov",
            external_identifier="NCT1",
            content_hash="abc",
        )
        session.add(finding)
        session.commit()
        session.add(FindingEvidence(finding_id=finding.id, snippet="evidence"))
        session.add(
            ReportExport(
                profile_id=profile.id,
                report_type="daily_summary",
                file_path=str(report_file),
            )
        )
        settings = AppSettings(default_profile_id=profile.id)
        session.add(settings)
        session.commit()
        return profile.id, report_file

    def test_export_includes_profile_and_findings(self) -> None:
        with self.session_factory() as session:
            self._seed(session)
            export = data_service.export_all_data(session)

        self.assertEqual(export["schema"], "oncowatch.export.v1")
        self.assertEqual(len(export["profiles"]), 1)
        self.assertEqual(export["profiles"][0]["profile_name"], "Jane Patient Smith")
        self.assertEqual(export["profiles"][0]["biomarkers"][0]["name"], "EGFR")
        self.assertEqual(len(export["findings"]), 1)
        self.assertEqual(len(export["reports"]), 1)

    def test_delete_wipes_patient_data_and_removes_files(self) -> None:
        with self.session_factory() as session:
            _, report_file = self._seed(session)
            counts = data_service.delete_all_data(session)

        self.assertEqual(counts["profiles"], 1)
        self.assertEqual(counts["findings"], 1)
        self.assertEqual(counts["report_files_removed"], 1)
        self.assertFalse(report_file.exists())

        with self.session_factory() as session:
            for model in (PatientProfile, Biomarker, TherapyHistoryEntry, Finding, FindingEvidence, MonitoringRun, ReportExport):
                remaining = session.scalar(select(func.count()).select_from(model))
                self.assertEqual(remaining, 0, f"{model.__name__} should be empty after wipe")
            # Settings survive but no longer point at a deleted profile.
            settings = session.scalar(select(AppSettings))
            self.assertIsNone(settings.default_profile_id)


if __name__ == "__main__":
    unittest.main()
