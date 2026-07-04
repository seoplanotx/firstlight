from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from typing import Any
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.api.routes import mcp_gateway as mcp_routes
from app.api.routes import settings as settings_routes
from app.db.base import Base
from app.models.finding import Finding, FindingEvidence
from app.models.profile import Biomarker, PatientProfile
from app.models.run import MonitoringRun
from app.services import audit_service
from app.services.deidentification_service import _BLOCKED_KEYS, assert_deidentified_packet


def _collect_keys(value: Any, keys: set[str]) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            keys.add(str(key).lower())
            _collect_keys(child, keys)
    elif isinstance(value, list):
        for item in value:
            _collect_keys(item, keys)


class McpGatewayTests(unittest.TestCase):
    def setUp(self) -> None:
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
            profile = PatientProfile(
                profile_name="Jane Patient Smith",
                display_name="J.S.",
                cancer_type="Non-small cell lung cancer",
                subtype="Adenocarcinoma",
                stage_or_context="Stage IV",
                location_label="Durham, North Carolina",
                travel_radius_miles=200,
                notes="Private notes that must never leave the device.",
                would_consider=["clinical trials"],
                would_not_consider=[],
            )
            profile.biomarkers = [Biomarker(name="EGFR", variant="Exon 19 deletion", status="positive")]
            session.add(profile)
            session.commit()
            session.refresh(profile)
            self.profile_id = profile.id

            trial = Finding(
                profile_id=profile.id,
                type="clinical_trials",
                title="Phase II trial of osimertinib combinations in EGFR-mutant NSCLC",
                source_name="ClinicalTrials.gov",
                source_url="https://clinicaltrials.gov/study/NCT00000001",
                external_identifier="NCT00000001",
                structured_tags=["EGFR", "NSCLC"],
                normalized_summary="A public trial summary.",
                why_it_surfaced="Matches biomarker EGFR and metastatic staging context.",
                why_it_may_not_fit="Recruitment sites may be far from the entered travel radius.",
                confidence="medium",
                score=0.82,
                relevance_label="Worth discussing",
                status="new",
                location_summary="12 sites, including North Carolina and Texas",
                matching_gaps=["ECOG status not entered"],
                match_debug={
                    "record_payload": {
                        "recruitment_status": "Recruiting",
                        "phases": ["Phase 2"],
                        "sponsor": "Example Sponsor Inc",
                        "interventions": ["osimertinib"],
                    },
                    "normalized_facts": {"record": {"recruitment_bucket": "recruiting"}},
                    "profile_snapshot": {"display_name": "MUST-NOT-LEAK"},
                },
                llm_metadata={"prompt": "must-not-leak"},
                content_hash="hash-trial-1",
            )
            trial.evidence_items = [
                FindingEvidence(
                    label="Trial record",
                    snippet="Public registry snippet.",
                    source_url="https://clinicaltrials.gov/study/NCT00000001",
                    source_identifier="NCT00000001",
                )
            ]
            paper = Finding(
                profile_id=profile.id,
                type="literature",
                title="Osimertinib resistance mechanisms in EGFR-mutant NSCLC",
                source_name="PubMed",
                external_identifier="PMID-1",
                confidence="low",
                score=0.5,
                relevance_label="May be relevant",
                status="new",
                match_debug={},
                llm_metadata={},
                content_hash="hash-paper-1",
            )
            run = MonitoringRun(
                profile_id=profile.id,
                status="completed",
                triggered_by="manual",
                new_findings_count=2,
                changed_findings_count=0,
                sources_checked=["clinicaltrials_gov", "pubmed_literature"],
                error_text="/Users/someone/private/path.log",
            )
            session.add_all([trial, paper, run])
            session.commit()

        app = FastAPI()
        app.include_router(mcp_routes.router, prefix="/api/mcp")
        app.include_router(settings_routes.router, prefix="/api/settings")

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

    def _enable(self) -> str:
        response = self.client.post("/api/settings/mcp/enable")
        self.assertEqual(response.status_code, 200)
        return response.json()["connection_code"]

    def _auth(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def test_gateway_disabled_returns_403(self) -> None:
        response = self.client.get("/api/mcp/status")
        self.assertEqual(response.status_code, 403)
        response = self.client.get("/api/mcp/findings", headers=self._auth("anything"))
        self.assertEqual(response.status_code, 403)

    def test_missing_or_wrong_token_returns_401(self) -> None:
        self._enable()
        self.assertEqual(self.client.get("/api/mcp/status").status_code, 401)
        self.assertEqual(
            self.client.get("/api/mcp/status", headers=self._auth("wrong-code")).status_code,
            401,
        )

    def test_status_ok_with_token(self) -> None:
        token = self._enable()
        response = self.client.get("/api/mcp/status", headers=self._auth(token))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["app_name"], "Firstlight")
        self.assertTrue(body["has_profile"])
        self.assertEqual(body["total_findings"], 2)
        self.assertIn("disclaimer", body)

    def test_findings_payloads_contain_no_blocked_keys(self) -> None:
        token = self._enable()
        listing = self.client.get("/api/mcp/findings", headers=self._auth(token))
        self.assertEqual(listing.status_code, 200)
        body = listing.json()
        self.assertEqual(body["total"], 2)

        finding_id = body["items"][0]["finding_id"]
        detail = self.client.get(f"/api/mcp/findings/{finding_id}", headers=self._auth(token))
        self.assertEqual(detail.status_code, 200)

        for payload in (body, detail.json()):
            keys: set[str] = set()
            _collect_keys(payload, keys)
            leaked = keys & _BLOCKED_KEYS
            self.assertFalse(leaked, f"blocked identity keys leaked into MCP payload: {leaked}")
            self.assertNotIn("match_debug", keys)
            self.assertNotIn("llm_metadata", keys)
            self.assertNotIn("raw_summary", keys)

        trial_item = next(i for i in body["items"] if i["type"] == "clinical_trials")
        self.assertEqual(trial_item["trial_recruitment_status"], "Recruiting")
        self.assertEqual(trial_item["trial_sponsor"], "Example Sponsor Inc")
        self.assertNotIn("MUST-NOT-LEAK", listing.text)

    def test_status_runs_and_summary_contain_no_blocked_keys(self) -> None:
        token = self._enable()
        for path in ("/api/mcp/status", "/api/mcp/runs", "/api/mcp/clinician-summary"):
            response = self.client.get(path, headers=self._auth(token))
            self.assertEqual(response.status_code, 200, path)
            keys: set[str] = set()
            _collect_keys(response.json(), keys)
            leaked = keys & _BLOCKED_KEYS
            self.assertFalse(leaked, f"blocked identity keys leaked into {path}: {leaked}")

        runs = self.client.get("/api/mcp/runs", headers=self._auth(token)).json()
        run_keys: set[str] = set()
        _collect_keys(runs, run_keys)
        self.assertNotIn("error_text", run_keys)
        self.assertNotIn("summary_json", run_keys)
        self.assertNotIn("/Users/", self.client.get("/api/mcp/runs", headers=self._auth(token)).text)

    def test_case_context_passes_deidentification_assertion(self) -> None:
        token = self._enable()
        response = self.client.get("/api/mcp/case-context", headers=self._auth(token))
        self.assertEqual(response.status_code, 200)
        packet = response.json()["packet"]
        assert_deidentified_packet(packet)
        context = packet["profile_context"]
        self.assertEqual(context["general_location"], "North Carolina")
        self.assertEqual(context["stage_group"], "Stage IV")
        self.assertNotIn("location_label", context)

    def test_clinician_summary_uses_deidentified_case_context(self) -> None:
        token = self._enable()
        response = self.client.get("/api/mcp/clinician-summary", headers=self._auth(token))
        self.assertEqual(response.status_code, 200)
        body = response.json()
        context = body["case_context"]
        self.assertNotIn("location_label", context)
        self.assertNotIn("current_therapy_status", context)
        self.assertEqual(context.get("general_location"), "North Carolina")
        self.assertTrue(body["case_framing"])
        self.assertNotIn("Durham", response.text)
        self.assertNotIn("Jane", response.text)
        trial_items = body["trial_findings"]
        self.assertTrue(trial_items)
        self.assertIn("finding_id", trial_items[0])

    def test_token_rotation_invalidates_previous_code(self) -> None:
        first = self._enable()
        second = self._enable()
        self.assertNotEqual(first, second)
        self.assertEqual(self.client.get("/api/mcp/status", headers=self._auth(first)).status_code, 401)
        self.assertEqual(self.client.get("/api/mcp/status", headers=self._auth(second)).status_code, 200)

    def test_disable_turns_gateway_off(self) -> None:
        token = self._enable()
        response = self.client.post("/api/settings/mcp/disable")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"enabled": False, "has_token": False})
        self.assertEqual(self.client.get("/api/mcp/status", headers=self._auth(token)).status_code, 403)

    def test_settings_mcp_status_never_returns_token(self) -> None:
        self._enable()
        response = self.client.get("/api/settings/mcp")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json().keys()), {"enabled", "has_token"})
        self.assertEqual(response.json(), {"enabled": True, "has_token": True})


if __name__ == "__main__":
    unittest.main()
