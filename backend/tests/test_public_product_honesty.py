from __future__ import annotations

import os
import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure models are registered.
from app.db.base import Base
from app import models  # noqa: F401
from app.core.release import DEMO_SOURCE_KEYS, PUBLIC_SOURCE_KEYS
from app.models.settings import SourceConfig
from app.services.bootstrap_service import _disable_non_public_sources, initialize_application
from app.services.profile_extraction_service import extract_profile_candidates


class PublicProductHonestyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

    def test_disable_non_public_sources(self) -> None:
        os.environ.pop("ONCOWATCH_ALLOW_DEMO_CONTENT", None)
        with self.Session() as session:
            session.add(
                SourceConfig(
                    category="clinical_trials",
                    name="Demo clinical trials",
                    connector_key="demo_trials",
                    enabled=True,
                    settings_json={},
                )
            )
            session.add(
                SourceConfig(
                    category="clinical_trials",
                    name="ClinicalTrials.gov trials",
                    connector_key="clinicaltrials_gov",
                    enabled=True,
                    settings_json={},
                )
            )
            session.commit()
            _disable_non_public_sources(session)
            session.commit()
            demo = session.scalar(select(SourceConfig).where(SourceConfig.connector_key == "demo_trials"))
            live = session.scalar(select(SourceConfig).where(SourceConfig.connector_key == "clinicaltrials_gov"))
            assert demo is not None and live is not None
            self.assertFalse(demo.enabled)
            self.assertTrue(live.enabled)
            self.assertIn(live.connector_key, PUBLIC_SOURCE_KEYS)
            self.assertIn(demo.connector_key, DEMO_SOURCE_KEYS)

    def test_profile_extraction_finds_nsclc_egfr(self) -> None:
        text = """
        Diagnosis: Non-small cell lung cancer, adenocarcinoma, Stage IV.
        Molecular: EGFR Exon 19 deletion positive; TP53 positive.
        Prior therapy: Osimertinib with progression; currently carboplatin + pemetrexed.
        """
        result = extract_profile_candidates(text)
        self.assertEqual(result.cancer_type, "Non-small cell lung cancer")
        self.assertTrue(result.stage_or_context)
        names = {item["name"] for item in result.biomarkers}
        self.assertIn("EGFR", names)
        therapy_names = " ".join(item["therapy_name"].lower() for item in result.therapy_history)
        self.assertIn("osimertinib", therapy_names)


if __name__ == "__main__":
    unittest.main()
