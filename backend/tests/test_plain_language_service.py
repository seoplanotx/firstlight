from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Biomarker, Finding, PatientProfile
from app.services import plain_language_service
from app.services.deidentification_service import DeidentificationError
from app.services.llm_service import validate_plain_language
from app.services.public_finding_service import (
    assert_public_finding_packet,
    build_public_finding_packet,
)


CLEAN = (
    "In this study, researchers tested a drug in people with advanced lung cancer. "
    "About 40 percent had their tumors shrink, and the results were published for other doctors to review."
)


def _profile() -> PatientProfile:
    profile = PatientProfile(
        profile_name="Sample EGFR NSCLC",
        cancer_type="Non-small cell lung cancer",
        subtype="Adenocarcinoma",
        stage_or_context="Metastatic",
        is_active=True,
    )
    profile.biomarkers = [Biomarker(name="EGFR", variant="Exon 19 deletion", status="positive")]
    return profile


def _finding(profile_id: int, **overrides) -> Finding:
    ts = datetime(2026, 3, 27, 4, 0, tzinfo=timezone.utc)
    data = dict(
        profile_id=profile_id,
        type="literature",
        title="EGFR inhibitor phase III results",
        source_name="PubMed",
        source_url="https://example.org/1",
        external_identifier="LIT-1",
        retrieved_at=ts,
        published_at=ts,
        structured_tags=["EGFR", "NSCLC"],
        raw_summary="A phase III randomized study of an EGFR inhibitor in advanced NSCLC reporting progression-free survival.",
        normalized_summary=None,
        confidence="high",
        score=70.0,
        relevance_label="Worth reviewing",
        status="new",
        matching_gaps=[],
        match_debug={},
        content_hash="hash-LIT-1",
        llm_metadata={},
        created_at=ts,
        updated_at=ts,
    )
    data.update(overrides)
    return Finding(**data)


class ValidatePlainLanguageTests(unittest.TestCase):
    def test_accepts_clean_third_person_explanation(self) -> None:
        self.assertEqual(validate_plain_language(CLEAN), CLEAN)

    def test_rejects_advice_and_second_person(self) -> None:
        unsafe_examples = [
            "You should ask your doctor about this drug.",
            "Your father may be eligible for this trial.",
            "This looks like a good option for you.",
            "The care team recommends starting osimertinib.",
            "The patient qualifies for enrollment in this study group.",
            "This could be the best treatment choice going forward.",
        ]
        for unsafe in unsafe_examples:
            with self.subTest(unsafe=unsafe):
                self.assertEqual(validate_plain_language(unsafe), "")

    def test_rejects_empty_and_too_short(self) -> None:
        self.assertEqual(validate_plain_language(""), "")
        self.assertEqual(validate_plain_language(None), "")
        self.assertEqual(validate_plain_language("Too short."), "")


class PublicFindingPacketTests(unittest.TestCase):
    def test_packet_contains_only_public_whitelisted_keys(self) -> None:
        fake = SimpleNamespace(
            title="EGFR inhibitor phase III results",
            type="literature",
            source_name="PubMed",
            normalized_summary=None,
            raw_summary="A phase III study of an EGFR inhibitor in advanced NSCLC.",
            structured_tags=["EGFR", "NSCLC"],
            evidence_items=[],
        )
        packet = build_public_finding_packet(fake)
        self.assertTrue(set(packet).issubset({"title", "type", "source_name", "summary", "evidence", "tags"}))
        self.assertNotIn("profile_id", packet)
        self.assertNotIn("notes", packet)
        self.assertEqual(packet["summary"], "A phase III study of an EGFR inhibitor in advanced NSCLC.")

    def test_assert_rejects_unexpected_keys(self) -> None:
        with self.assertRaises(DeidentificationError):
            assert_public_finding_packet({"title": "ok", "notes": "leak"})

    def test_assert_rejects_non_string_field(self) -> None:
        with self.assertRaises(DeidentificationError):
            assert_public_finding_packet({"title": 123})


class GeneratePlainLanguageServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:", future=True)
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)

    def tearDown(self) -> None:
        self.engine.dispose()

    def _seed(self, session, **finding_overrides):
        profile = _profile()
        session.add(profile)
        session.commit()
        session.refresh(profile)
        finding = _finding(profile.id, **finding_overrides)
        session.add(finding)
        session.commit()
        session.refresh(finding)
        return profile, finding

    def _ai_enabled(self, explain_return):
        return (
            patch.object(
                plain_language_service,
                "get_settings",
                return_value=SimpleNamespace(
                    privacy_mode="deidentified_ai_assist",
                    deidentified_ai_disclosure_acknowledged=True,
                ),
            ),
            patch.object(
                plain_language_service,
                "get_active_provider",
                return_value=("openrouter", SimpleNamespace(is_configured=True, selected_model="m")),
            ),
            patch.object(plain_language_service, "get_provider_api_key", return_value="k"),
            patch.object(
                plain_language_service,
                "create_llm_client",
                return_value=SimpleNamespace(explain_finding=lambda **kw: explain_return),
            ),
        )

    def test_local_only_mode_never_generates(self) -> None:
        with self.Session() as session:
            _, finding = self._seed(session)
            result = plain_language_service.generate_plain_language(session, finding.id)
            self.assertEqual(result["status"], "local_only")
            self.assertIsNone(result["finding"].plain_language_summary)

    def test_cached_summary_returned_without_ai(self) -> None:
        with self.Session() as session:
            _, finding = self._seed(session, plain_language_summary=CLEAN)
            result = plain_language_service.generate_plain_language(session, finding.id)
            self.assertEqual(result["status"], "cached")
            self.assertEqual(result["finding"].plain_language_summary, CLEAN)

    def test_missing_finding_returns_not_found(self) -> None:
        with self.Session() as session:
            result = plain_language_service.generate_plain_language(session, 999)
            self.assertEqual(result["status"], "not_found")
            self.assertIsNone(result["finding"])

    def test_ai_generated_summary_is_stored(self) -> None:
        with self.Session() as session:
            _, finding = self._seed(session)
            fid = finding.id
            p1, p2, p3, p4 = self._ai_enabled(CLEAN)
            with p1, p2, p3, p4:
                result = plain_language_service.generate_plain_language(session, fid)
            self.assertEqual(result["status"], "ai_generated")
            self.assertEqual(result["finding"].plain_language_summary, CLEAN)
            self.assertEqual(result["finding"].plain_language_provider, "openrouter")
            self.assertIsNotNone(result["finding"].plain_language_generated_at)

    def test_empty_ai_output_fails_closed_and_stores_nothing(self) -> None:
        with self.Session() as session:
            _, finding = self._seed(session)
            fid = finding.id
            p1, p2, p3, p4 = self._ai_enabled("")
            with p1, p2, p3, p4:
                result = plain_language_service.generate_plain_language(session, fid)
            self.assertEqual(result["status"], "ai_failed")
            self.assertIsNone(result["finding"].plain_language_summary)


if __name__ == "__main__":
    unittest.main()
