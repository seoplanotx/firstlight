from __future__ import annotations

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.schemas.settings import AppSettingsUpdate
from app.services.settings_service import get_settings, update_settings


class SettingsPrivacyModeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_settings_default_to_local_only_privacy_mode(self) -> None:
        with self.session_factory() as session:
            settings = get_settings(session)

        self.assertEqual(settings.privacy_mode, "local_only")
        self.assertFalse(settings.deidentified_ai_disclosure_acknowledged)

    def test_settings_can_enable_deidentified_ai_assist(self) -> None:
        with self.session_factory() as session:
            saved = update_settings(
                session,
                AppSettingsUpdate(
                    daily_run_time="08:30",
                    default_report_style="clinical",
                    default_report_length="daily_summary",
                    demo_profile_enabled=False,
                    privacy_mode="deidentified_ai_assist",
                    deidentified_ai_disclosure_acknowledged=True,
                ),
            )

        self.assertEqual(saved.privacy_mode, "deidentified_ai_assist")
        self.assertTrue(saved.deidentified_ai_disclosure_acknowledged)

    def test_settings_reject_deidentified_ai_without_disclosure_acknowledgement(self) -> None:
        with self.session_factory() as session:
            with self.assertRaises(ValueError):
                update_settings(
                    session,
                    AppSettingsUpdate(
                        daily_run_time="08:30",
                        default_report_style="clinical",
                        default_report_length="daily_summary",
                        demo_profile_enabled=False,
                        privacy_mode="deidentified_ai_assist",
                        deidentified_ai_disclosure_acknowledged=False,
                    ),
                )


if __name__ == "__main__":
    unittest.main()
