from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import MonitoringRun
from app.schemas.run import MonitoringRunRead


class UTCDateTimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine)

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_round_trip_is_aware_utc_and_serializes_with_offset(self) -> None:
        pacific = timezone(timedelta(hours=-8))
        with self.session_factory() as session:
            run = MonitoringRun(
                status="completed",
                started_at=datetime(2026, 3, 27, 4, 0, tzinfo=pacific),
                completed_at=datetime(2026, 3, 27, 12, 5),  # naive values are treated as UTC
            )
            session.add(run)
            session.commit()
            run_id = run.id

        with self.session_factory() as session:
            loaded = session.get(MonitoringRun, run_id)
            self.assertEqual(loaded.started_at, datetime(2026, 3, 27, 12, 0, tzinfo=timezone.utc))
            self.assertEqual(loaded.completed_at.tzinfo, timezone.utc)
            payload = MonitoringRunRead.model_validate(loaded).model_dump_json()

        # The UI parses these with new Date(); without an offset it would assume local time.
        self.assertIn('"started_at":"2026-03-27T12:00:00Z"', payload)


if __name__ == "__main__":
    unittest.main()
