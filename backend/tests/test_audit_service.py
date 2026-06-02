from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from app.services import audit_service


class AuditServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.logs_dir = Path(self._tmp.name)
        self._patch = patch.object(
            audit_service,
            "get_app_paths",
            return_value=SimpleNamespace(logs_dir=self.logs_dir),
        )
        self._patch.start()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()

    def test_records_and_reads_events_newest_first(self) -> None:
        audit_service.record_audit_event("profile_created", {"profile_id": 1})
        audit_service.record_audit_event("monitoring_run_completed", {"run_id": 7, "status": "completed"})

        events = audit_service.read_audit_events()
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0]["action"], "monitoring_run_completed")
        self.assertEqual(events[0]["detail"]["run_id"], 7)
        self.assertEqual(events[1]["action"], "profile_created")
        self.assertIn("timestamp", events[0])

    def test_read_is_empty_when_no_log_exists(self) -> None:
        self.assertEqual(audit_service.read_audit_events(), [])

    def test_limit_caps_returned_events(self) -> None:
        for index in range(10):
            audit_service.record_audit_event("tick", {"i": index})
        events = audit_service.read_audit_events(limit=3)
        self.assertEqual(len(events), 3)
        # Newest first: the last three writes (9, 8, 7).
        self.assertEqual([event["detail"]["i"] for event in events], [9, 8, 7])

    def test_append_only_file_is_one_json_object_per_line(self) -> None:
        audit_service.record_audit_event("a")
        audit_service.record_audit_event("b")
        lines = (self.logs_dir / audit_service.AUDIT_FILE_NAME).read_text().splitlines()
        self.assertEqual(len(lines), 2)


if __name__ == "__main__":
    unittest.main()
