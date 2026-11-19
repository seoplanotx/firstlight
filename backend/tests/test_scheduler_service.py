from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from pydantic import ValidationError

from app.schemas.settings import AppSettingsUpdate
from app.services import scheduler_service


class SchedulerServiceTests(unittest.TestCase):
    def test_parse_run_time(self) -> None:
        self.assertEqual(scheduler_service.parse_run_time("08:30"), (8, 30))
        self.assertEqual(scheduler_service.parse_run_time("23:59"), (23, 59))
        for bad in ("", "8", "24:00", "07:60", "ab:cd", "08:30:00", None):
            self.assertIsNone(scheduler_service.parse_run_time(bad), bad)

    def test_malformed_time_falls_back_and_never_skips_misfires(self) -> None:
        scheduler = MagicMock()
        with patch.object(scheduler_service, "get_scheduler", return_value=scheduler):
            scheduler_service.configure_scheduler_from_settings("not-a-time")
        kwargs = scheduler.add_job.call_args.kwargs
        self.assertEqual((kwargs["hour"], kwargs["minute"]), scheduler_service.DEFAULT_RUN_TIME)
        self.assertIsNone(kwargs["misfire_grace_time"])
        self.assertTrue(kwargs["coalesce"])

    def test_settings_update_rejects_malformed_time(self) -> None:
        with self.assertRaises(ValidationError):
            AppSettingsUpdate(daily_run_time="25:00")
        self.assertEqual(AppSettingsUpdate(daily_run_time="06:05").daily_run_time, "06:05")


if __name__ == "__main__":
    unittest.main()
