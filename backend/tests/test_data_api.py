from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.api.routes import data as data_routes
from app.db.base import Base
from app.models.profile import PatientProfile
from app.services import audit_service


class DataApiTests(unittest.TestCase):
    def setUp(self) -> None:
        # A single shared in-memory connection so the TestClient's worker
        # thread sees the same database as the test thread.
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)

        self._tmp = TemporaryDirectory()
        self._audit_patch = patch.object(
            audit_service,
            "get_app_paths",
            return_value=SimpleNamespace(logs_dir=Path(self._tmp.name)),
        )
        self._audit_patch.start()

        with self.session_factory() as session:
            session.add(
                PatientProfile(
                    profile_name="Jane Patient Smith",
                    cancer_type="NSCLC",
                    would_consider=[],
                    would_not_consider=[],
                )
            )
            session.commit()

        app = FastAPI()
        app.include_router(data_routes.router, prefix="/api/data")

        def override_get_db():
            session = self.session_factory()
            try:
                yield session
            finally:
                session.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self._audit_patch.stop()
        self._tmp.cleanup()
        self.engine.dispose()

    def test_export_returns_attachment_with_profile(self) -> None:
        response = self.client.get("/api/data/export")
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response.headers.get("content-disposition", ""))
        body = response.json()
        self.assertEqual(body["schema"], "oncowatch.export.v1")
        self.assertEqual(body["profiles"][0]["profile_name"], "Jane Patient Smith")

    def test_audit_log_endpoint_returns_export_event(self) -> None:
        self.client.get("/api/data/export")
        response = self.client.get("/api/data/audit-log")
        self.assertEqual(response.status_code, 200)
        actions = [event["action"] for event in response.json()["events"]]
        self.assertIn("data_exported", actions)

    def test_delete_endpoint_wipes_profiles(self) -> None:
        response = self.client.post("/api/data/delete")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profiles"], 1)
        export = self.client.get("/api/data/export").json()
        self.assertEqual(export["profiles"], [])


if __name__ == "__main__":
    unittest.main()
