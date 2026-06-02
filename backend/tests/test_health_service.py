from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import SourceConfig
from app.services.health_service import run_health_check


class FailingExternalConnector:
    def healthcheck(self) -> tuple[bool, str]:
        return False, "ClinicalTrials.gov returned 403 from this network."


class HealthServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_external_source_health_failures_are_non_blocking_warnings(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            paths = SimpleNamespace(
                data_dir=root / "data",
                reports_dir=root / "reports",
                logs_dir=root / "logs",
                db_path=root / "data" / "oncowatch.db",
            )
            paths.data_dir.mkdir()
            paths.reports_dir.mkdir()
            paths.logs_dir.mkdir()

            with self.session_factory() as session:
                session.add(
                    SourceConfig(
                        category="clinical_trials",
                        name="ClinicalTrials.gov",
                        connector_key="clinicaltrials_gov",
                        enabled=True,
                        settings_json={},
                    )
                )
                session.commit()

                with patch("app.services.health_service.get_app_paths", return_value=paths), patch(
                    "app.services.health_service.can_render_test_pdf", return_value=(True, "PDF generation ready")
                ), patch(
                    "app.services.health_service.connector_registry",
                    return_value={"clinicaltrials_gov": FailingExternalConnector()},
                ):
                    health = run_health_check(session)

        source_item = next(item for item in health.items if item.key == "clinicaltrials_gov")
        self.assertTrue(health.overall_ok)
        self.assertFalse(source_item.ok)
        self.assertEqual(source_item.severity, "warning")
        self.assertFalse(source_item.blocking)

        integrity_item = next(item for item in health.items if item.key == "database_integrity")
        self.assertTrue(integrity_item.ok)
        self.assertTrue(integrity_item.blocking)


if __name__ == "__main__":
    unittest.main()
