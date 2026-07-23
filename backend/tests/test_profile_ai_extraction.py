from __future__ import annotations

from types import SimpleNamespace
import unittest
from unittest.mock import patch

from app.services import profile_ai_service
from app.services.deidentification_service import (
    DeidentificationError,
    assert_free_text_deidentified,
    redact_free_text,
)
from app.services.llm_service import validate_extracted_candidates


RAW_REPORT = (
    "Patient: John Smith  MRN: 12345678\n"
    "Collected: 03/14/2026 at Duke University Hospital, Durham, NC 27710\n"
    "Ordering physician: Dr. Jane Doe  Phone: (919) 555-1234  jane.doe@example.com\n"
    "Diagnosis: Non-small cell lung carcinoma, adenocarcinoma, Stage IV.\n"
    "Molecular: EGFR exon 19 deletion positive; TP53 mutation; PD-L1 60%.\n"
    "Prior therapy: osimertinib.\n"
)


class RedactionTests(unittest.TestCase):
    def test_raw_report_is_flagged_as_not_deidentified(self) -> None:
        with self.assertRaises(DeidentificationError):
            assert_free_text_deidentified(RAW_REPORT)

    def test_redaction_removes_identifiers_and_passes_assertion(self) -> None:
        redacted = redact_free_text(RAW_REPORT)
        # Identity must be gone.
        self.assertNotIn("John Smith", redacted)
        self.assertNotIn("Jane Doe", redacted)
        self.assertNotIn("12345678", redacted)
        self.assertNotIn("jane.doe@example.com", redacted)
        self.assertNotIn("919", redacted)
        self.assertNotIn("03/14/2026", redacted)
        self.assertNotIn("27710", redacted)
        # Clinical content the AI needs must survive.
        self.assertIn("EGFR", redacted)
        self.assertIn("carcinoma", redacted.lower())
        self.assertIn("osimertinib", redacted)
        # And the redacted text must clear the fail-closed assertion.
        assert_free_text_deidentified(redacted)

    def test_empty_text_is_clean(self) -> None:
        self.assertEqual(redact_free_text(""), "")
        assert_free_text_deidentified("")

    def test_dashed_ssn_is_redacted_and_flagged(self) -> None:
        report = "Diagnosis: NSCLC. SSN: 123-45-6789 on file."
        # Raw text must fail the fail-closed assertion...
        with self.assertRaises(DeidentificationError):
            assert_free_text_deidentified(report)
        redacted = redact_free_text(report)
        # ...the SSN must be gone, clinical content kept, and the result must clear the gate.
        self.assertNotIn("123-45-6789", redacted)
        self.assertIn("NSCLC", redacted)
        assert_free_text_deidentified(redacted)

    def test_ssn_space_and_dot_separators_are_redacted(self) -> None:
        for raw in ("123 45 6789", "123.45.6789"):
            with self.subTest(raw=raw):
                self.assertNotIn(raw, redact_free_text(f"Social security {raw} noted"))

    def test_labeled_name_colliding_with_oncology_terms_is_redacted(self) -> None:
        # "Small"/"Low"/"Cell" are oncology denylist words; a real surname that collides
        # with one must still be removed when it appears behind a person label.
        cases = [
            ("Patient: Robert Small, follow-up.", "Robert Small"),
            ("Patient: Amy Low presented today.", "Amy Low"),
            ("Ordering physician: Grace Cell", "Grace Cell"),
        ]
        for report, name in cases:
            with self.subTest(report=report):
                with self.assertRaises(DeidentificationError):
                    assert_free_text_deidentified(report)
                redacted = redact_free_text(report)
                self.assertNotIn(name, redacted)
                assert_free_text_deidentified(redacted)

    def test_medical_bigrams_survive_redaction(self) -> None:
        # Regression guard: the denylist must still protect medical phrases that look
        # like First-Last names, so extraction keeps the cancer type it needs.
        report = "Diagnosis: Merkel Cell Carcinoma; also Small Cell Lung Cancer, Stage IV."
        redacted = redact_free_text(report)
        self.assertIn("Merkel Cell", redacted)
        self.assertIn("Small Cell", redacted)

    def test_day_first_spelled_dates_are_redacted_and_flagged(self) -> None:
        for report in (
            "Date of birth 7 February 1955.",
            "Specimen collected 14 March 2026.",
            "Reviewed 3 Apr 2026.",
        ):
            with self.subTest(report=report):
                with self.assertRaises(DeidentificationError):
                    assert_free_text_deidentified(report)
                redacted = redact_free_text(report)
                assert_free_text_deidentified(redacted)
        # Numeric day-first dates were already handled by the exact-date pattern.
        self.assertNotIn("14/03/2026", redact_free_text("Collected 14/03/2026."))


class ValidateExtractedCandidatesTests(unittest.TestCase):
    def test_parses_clean_json_object(self) -> None:
        raw = (
            '{"cancer_type": "Non-small cell lung cancer", "subtype": "Adenocarcinoma", '
            '"stage_or_context": "Stage IV", '
            '"biomarkers": [{"name": "EGFR", "variant": "Exon 19 deletion", "status": "positive"}], '
            '"therapy_history": [{"therapy_name": "Osimertinib", "therapy_type": "targeted", "status": "prior"}]}'
        )
        result = validate_extracted_candidates(raw)
        self.assertEqual(result["cancer_type"], "Non-small cell lung cancer")
        self.assertEqual(result["biomarkers"][0]["name"], "EGFR")
        self.assertEqual(result["therapy_history"][0]["therapy_name"], "Osimertinib")

    def test_strips_code_fences(self) -> None:
        raw = '```json\n{"cancer_type": "Melanoma", "biomarkers": [], "therapy_history": []}\n```'
        result = validate_extracted_candidates(raw)
        self.assertEqual(result["cancer_type"], "Melanoma")

    def test_junk_and_non_object_fail_closed(self) -> None:
        self.assertEqual(validate_extracted_candidates("I cannot help with that."), {})
        self.assertEqual(validate_extracted_candidates("[1, 2, 3]"), {})
        self.assertEqual(validate_extracted_candidates(""), {})


class ExtractProfileCandidatesAiTests(unittest.TestCase):
    def test_allow_ai_false_returns_local_only_regex(self) -> None:
        result = profile_ai_service.extract_profile_candidates_ai(None, RAW_REPORT, allow_ai=False)
        self.assertEqual(result["ai_status"], "not_requested")
        self.assertEqual(result["cancer_type"], "Non-small cell lung cancer")
        names = {b["name"] for b in result["biomarkers"]}
        self.assertIn("EGFR", names)

    def test_local_only_mode_skips_ai(self) -> None:
        with patch.object(
            profile_ai_service,
            "get_settings",
            return_value=SimpleNamespace(privacy_mode="local_only", deidentified_ai_disclosure_acknowledged=False),
        ):
            result = profile_ai_service.extract_profile_candidates_ai(None, RAW_REPORT, allow_ai=True)
        self.assertEqual(result["ai_status"], "local_only")

    def test_ai_unavailable_when_no_provider(self) -> None:
        with patch.object(
            profile_ai_service,
            "get_settings",
            return_value=SimpleNamespace(privacy_mode="deidentified_ai_assist", deidentified_ai_disclosure_acknowledged=True),
        ), patch.object(profile_ai_service, "get_active_provider", return_value=("openrouter", None)), patch.object(
            profile_ai_service, "get_provider_api_key", return_value=None
        ):
            result = profile_ai_service.extract_profile_candidates_ai(None, RAW_REPORT, allow_ai=True)
        self.assertEqual(result["ai_status"], "ai_unavailable")

    def test_ai_assisted_merges_tagged_additions(self) -> None:
        fake_ai = {
            "cancer_type": None,
            "subtype": None,
            "stage_or_context": None,
            "biomarkers": [{"name": "KRAS", "variant": "G12C", "status": "positive"}],
            "therapy_history": [],
        }
        with patch.object(
            profile_ai_service,
            "get_settings",
            return_value=SimpleNamespace(privacy_mode="deidentified_ai_assist", deidentified_ai_disclosure_acknowledged=True),
        ), patch.object(
            profile_ai_service,
            "get_active_provider",
            return_value=("openrouter", SimpleNamespace(is_configured=True, selected_model="m")),
        ), patch.object(profile_ai_service, "get_provider_api_key", return_value="k"), patch.object(
            profile_ai_service,
            "create_llm_client",
            return_value=SimpleNamespace(extract_profile_candidates=lambda **kw: fake_ai),
        ):
            result = profile_ai_service.extract_profile_candidates_ai(None, RAW_REPORT, allow_ai=True)

        self.assertEqual(result["ai_status"], "ai_assisted")
        kras = [b for b in result["biomarkers"] if b["name"] == "KRAS"]
        self.assertEqual(len(kras), 1)
        self.assertIn("Suggested by AI", kras[0]["notes"])
        # The report-derived EGFR marker is still present and untagged.
        egfr = [b for b in result["biomarkers"] if b["name"] == "EGFR"]
        self.assertEqual(len(egfr), 1)

    def test_ai_no_additions_when_model_returns_known_items(self) -> None:
        fake_ai = {
            "cancer_type": "Non-small cell lung cancer",
            "subtype": None,
            "stage_or_context": None,
            "biomarkers": [{"name": "EGFR", "variant": "Exon 19 deletion", "status": "positive"}],
            "therapy_history": [],
        }
        with patch.object(
            profile_ai_service,
            "get_settings",
            return_value=SimpleNamespace(privacy_mode="deidentified_ai_assist", deidentified_ai_disclosure_acknowledged=True),
        ), patch.object(
            profile_ai_service,
            "get_active_provider",
            return_value=("openrouter", SimpleNamespace(is_configured=True, selected_model="m")),
        ), patch.object(profile_ai_service, "get_provider_api_key", return_value="k"), patch.object(
            profile_ai_service,
            "create_llm_client",
            return_value=SimpleNamespace(extract_profile_candidates=lambda **kw: fake_ai),
        ):
            result = profile_ai_service.extract_profile_candidates_ai(None, RAW_REPORT, allow_ai=True)

        self.assertEqual(result["ai_status"], "ai_no_additions")


if __name__ == "__main__":
    unittest.main()
