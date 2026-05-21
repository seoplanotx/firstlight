from __future__ import annotations

from datetime import datetime, timezone
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import MonitoringRun, PatientProfile, SourceConfig
from app.services.monitoring_service import RunConflictError, run_monitoring


class MonitoringServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_rejects_overlapping_run_when_existing_run_is_marked_running(self) -> None:
        with self.session_factory() as session:
            profile = PatientProfile(
                profile_name="Sample",
                cancer_type="NSCLC",
                would_consider=[],
                would_not_consider=[],
                is_active=True,
            )
            session.add(profile)
            session.commit()
            session.refresh(profile)

            session.add(
                MonitoringRun(
                    profile_id=profile.id,
                    status="running",
                    triggered_by="manual",
                    started_at=datetime(2026, 4, 3, 10, 0, tzinfo=timezone.utc),
                    summary_json={"connectors": []},
                    sources_checked=[],
                )
            )
            session.commit()

            with self.assertRaises(RunConflictError):
                run_monitoring(session, profile_id=profile.id, triggered_by="manual")

    def test_run_monitoring_stores_heartbeat_metadata_after_connector_failures(self) -> None:
        with self.session_factory() as session:
            profile = PatientProfile(
                profile_name="Sample",
                cancer_type="NSCLC",
                would_consider=[],
                would_not_consider=[],
                is_active=True,
            )
            source = SourceConfig(
                category="literature",
                name="PubMed",
                connector_key="pubmed_literature",
                enabled=True,
                settings_json={},
            )
            session.add_all([profile, source])
            session.commit()
            session.refresh(profile)

            class FailingConnector:
                def fetch(self, context):
                    raise RuntimeError("pubmed timeout")

            with patch("app.services.monitoring_service.connector_registry", return_value={"pubmed_literature": FailingConnector()}):
                run = run_monitoring(session, profile_id=profile.id, triggered_by="heartbeat")

            self.assertEqual(run.status, "completed_with_warnings")
            self.assertEqual(run.summary_json["heartbeat"]["workflow"]["name"], "heartbeat_briefing")
            self.assertEqual(run.summary_json["heartbeat"]["source_failures"][0]["connector_key"], "pubmed_literature")
            self.assertEqual(run.summary_json["heartbeat"]["source_failures"][0]["message"], "pubmed timeout")
            self.assertTrue(run.summary_json["heartbeat"]["suggested_questions"])
