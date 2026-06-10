from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import ApiProviderConfig, AppSettings, Biomarker, Finding, PatientProfile
from app.services.heartbeat_service import build_heartbeat_metadata, deterministic_briefing_questions
from app.services.llm_service import validate_clinician_questions


class FakeOpenRouterClient:
    captured_packet: dict | None = None

    def __init__(self, api_key: str, model: str | None = None) -> None:
        self.api_key = api_key
        self.model = model

    def generate_clinician_questions(self, *, case_packet: dict) -> list[str]:
        FakeOpenRouterClient.captured_packet = case_packet
        return [
            "Could the care team review whether this trial is worth formal screening based on the full chart?",
            "Could the oncology team discuss which missing labs or reports would clarify this source?",
        ]


class UnsafeOpenRouterClient(FakeOpenRouterClient):
    def generate_clinician_questions(self, *, case_packet: dict) -> list[str]:
        FakeOpenRouterClient.captured_packet = case_packet
        return ["You should start osimertinib now.", "The patient is eligible for NCT00000000."]


def build_profile() -> PatientProfile:
    profile = PatientProfile(
        profile_name="Mom",
        display_name="Jane Firstlight",
        date_of_birth=datetime(1958, 4, 12, tzinfo=timezone.utc).date(),
        cancer_type="Non-small cell lung cancer",
        subtype="adenocarcinoma",
        stage_or_context="Stage IV",
        current_therapy_status="Progressed after osimertinib",
        location_label="Jacksonville, NC 28546",
        travel_radius_miles=150,
        notes="Sees Dr. Smith at Example Hospital.",
        would_consider=["clinical trials"],
        would_not_consider=["long-distance travel"],
        is_active=True,
    )
    profile.biomarkers = [Biomarker(name="EGFR", variant="exon 19 deletion", status="positive")]
    return profile


def build_finding(profile_id: int) -> Finding:
    now = datetime(2026, 5, 20, 12, 0, tzinfo=timezone.utc)
    return Finding(
        profile_id=profile_id,
        type="clinical_trials",
        title="EGFR NSCLC trial",
        source_name="ClinicalTrials.gov",
        source_url="https://clinicaltrials.gov/study/NCT00000000",
        external_identifier="NCT00000000",
        retrieved_at=now,
        published_at=now,
        structured_tags=["EGFR", "NSCLC"],
        raw_summary="Public trial summary",
        normalized_summary="Source-backed normalized summary",
        why_it_surfaced="EGFR and NSCLC overlap",
        why_it_may_not_fit="Eligibility not assessed",
        confidence="high",
        score=82.0,
        relevance_label="High relevance",
        status="new",
        location_summary="North Carolina",
        matching_gaps=["ECOG status not entered"],
        match_debug={},
        content_hash="abc123",
        llm_metadata={},
    )


class HeartbeatServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)
        FakeOpenRouterClient.captured_packet = None

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_deterministic_questions_pass_clinician_review_safety_policy(self) -> None:
        profile = build_profile()
        finding = build_finding(profile_id=1)

        questions = deterministic_briefing_questions(profile, [finding])

        self.assertTrue(questions)
        self.assertEqual(validate_clinician_questions(questions), questions)

    def test_local_only_metadata_uses_deterministic_questions_and_source_failures(self) -> None:
        with self.session_factory() as session:
            profile = build_profile()
            session.add(profile)
            session.add(AppSettings(enabled_source_categories=["clinical_trials"], privacy_mode="local_only"))
            session.commit()
            session.refresh(profile)
            finding = build_finding(profile.id)

            metadata = build_heartbeat_metadata(
                session,
                profile=profile,
                findings=[finding],
                connector_summaries=[
                    {"connector_key": "clinicaltrials_gov", "status": "ok", "retrieved": 1},
                    {"connector_key": "pubmed_literature", "status": "error", "retrieved": 0, "error": "timeout"},
                ],
            )

        self.assertEqual(metadata["workflow"]["name"], "heartbeat_briefing")
        self.assertEqual(metadata["workflow"]["version"], "v1")
        self.assertEqual(metadata["question_generation"]["mode"], "local_only")
        self.assertEqual(metadata["question_generation"]["status"], "deterministic_fallback")
        self.assertTrue(metadata["suggested_questions"])
        self.assertEqual(metadata["source_failures"][0]["connector_key"], "pubmed_literature")
        self.assertEqual(metadata["source_failures"][0]["message"], "timeout")

    def test_mode2_uses_deidentified_ai_packet_when_configured(self) -> None:
        with self.session_factory() as session:
            profile = build_profile()
            session.add(profile)
            session.add(
                AppSettings(
                    enabled_source_categories=["clinical_trials"],
                    privacy_mode="deidentified_ai_assist",
                    deidentified_ai_disclosure_acknowledged=True,
                )
            )
            session.add(
                ApiProviderConfig(
                    provider_key="openrouter",
                    display_name="OpenRouter",
                    is_configured=True,
                    selected_model="openai/gpt-4.1-mini",
                    metadata_json={},
                )
            )
            session.commit()
            session.refresh(profile)
            finding = build_finding(profile.id)

            with patch("app.services.heartbeat_service.get_provider_api_key", return_value="test-key"), patch(
                "app.services.heartbeat_service.OpenRouterClient", FakeOpenRouterClient
            ):
                metadata = build_heartbeat_metadata(
                    session,
                    profile=profile,
                    findings=[finding],
                    connector_summaries=[{"connector_key": "clinicaltrials_gov", "status": "ok", "retrieved": 1}],
                )

        self.assertEqual(metadata["question_generation"]["mode"], "deidentified_ai_assist")
        self.assertEqual(metadata["question_generation"]["status"], "ai_generated")
        self.assertEqual(
            metadata["suggested_questions"],
            [
                "Could the care team review whether this trial is worth formal screening based on the full chart?",
                "Could the oncology team discuss which missing labs or reports would clarify this source?",
            ],
        )
        packet = FakeOpenRouterClient.captured_packet
        self.assertIsNotNone(packet)
        serialized = repr(packet)
        self.assertIn("Non-small cell lung cancer", serialized)
        self.assertIn("EGFR", serialized)
        self.assertNotIn("Jane", serialized)
        self.assertNotIn("Firstlight", serialized)
        self.assertNotIn("Dr. Smith", serialized)
        self.assertNotIn("Example Hospital", serialized)
        self.assertNotIn("1958", serialized)

    def test_mode2_falls_back_when_ai_returns_recommendations_or_eligibility_claims(self) -> None:
        with self.session_factory() as session:
            profile = build_profile()
            session.add(profile)
            session.add(
                AppSettings(
                    enabled_source_categories=["clinical_trials"],
                    privacy_mode="deidentified_ai_assist",
                    deidentified_ai_disclosure_acknowledged=True,
                )
            )
            session.add(
                ApiProviderConfig(
                    provider_key="openrouter",
                    display_name="OpenRouter",
                    is_configured=True,
                    selected_model="openai/gpt-4.1-mini",
                    metadata_json={},
                )
            )
            session.commit()
            session.refresh(profile)

            with patch("app.services.heartbeat_service.get_provider_api_key", return_value="test-key"), patch(
                "app.services.heartbeat_service.OpenRouterClient", UnsafeOpenRouterClient
            ):
                metadata = build_heartbeat_metadata(
                    session,
                    profile=profile,
                    findings=[build_finding(profile.id)],
                    connector_summaries=[{"connector_key": "clinicaltrials_gov", "status": "ok", "retrieved": 1}],
                )

        self.assertEqual(metadata["question_generation"]["status"], "ai_failed")
        self.assertIn("AI provider returned no usable clinician-review questions", metadata["question_generation"]["message"])
        self.assertTrue(metadata["suggested_questions"])
        self.assertNotIn("You should start osimertinib now.", metadata["suggested_questions"])
        self.assertNotIn("The patient is eligible for NCT00000000.", metadata["suggested_questions"])

    def test_mode2_without_provider_falls_back_deterministically(self) -> None:
        with self.session_factory() as session:
            profile = build_profile()
            session.add(profile)
            session.add(
                AppSettings(
                    enabled_source_categories=["clinical_trials"],
                    privacy_mode="deidentified_ai_assist",
                    deidentified_ai_disclosure_acknowledged=True,
                )
            )
            session.commit()
            session.refresh(profile)

            metadata = build_heartbeat_metadata(
                session,
                profile=profile,
                findings=[build_finding(profile.id)],
                connector_summaries=[],
            )

        self.assertEqual(metadata["question_generation"]["status"], "ai_unavailable")
        self.assertTrue(metadata["suggested_questions"])


if __name__ == "__main__":
    unittest.main()
