from __future__ import annotations

import unittest

from app.services.deidentification_service import (
    DeidentificationError,
    assert_deidentified_packet,
    build_deidentified_case_packet,
    generalize_location_label,
)


class DeidentificationServiceTests(unittest.TestCase):
    def test_build_packet_omits_local_identity_fields(self) -> None:
        profile = {
            "id": 42,
            "profile_name": "Mom",
            "display_name": "Jane Coffey",
            "date_of_birth": "1958-04-12",
            "cancer_type": "Non-small cell lung cancer",
            "subtype": "adenocarcinoma",
            "stage_or_context": "Stage IV",
            "current_therapy_status": "Progressed after osimertinib",
            "location_label": "Jacksonville, NC 28546",
            "travel_radius_miles": 150,
            "notes": "Patient sees Dr. Smith at Example Hospital. Call 555-111-2222.",
            "biomarkers": [
                {"id": 1, "name": "EGFR", "variant": "exon 19 deletion", "status": "positive", "notes": "local note"}
            ],
            "therapy_history": [
                {
                    "id": 5,
                    "therapy_name": "osimertinib",
                    "therapy_type": "targeted therapy",
                    "line_of_therapy": "1L",
                    "status": "prior",
                    "start_date": "2024-01-01",
                    "end_date": "2025-01-01",
                    "notes": "handled by Dr. Smith",
                }
            ],
            "would_consider": ["clinical trials"],
            "would_not_consider": ["long-distance travel"],
        }
        findings = [
            {
                "id": 99,
                "profile_id": 42,
                "title": "EGFR NSCLC trial",
                "type": "clinical_trial",
                "source_name": "ClinicalTrials.gov",
                "source_url": "https://clinicaltrials.gov/study/NCT00000000",
                "external_identifier": "NCT00000000",
                "raw_summary": "Public trial summary",
                "normalized_summary": "Trial summary normalized for review",
                "why_it_surfaced": "EGFR and NSCLC overlap",
                "why_it_may_not_fit": "Eligibility not assessed",
                "matching_gaps": ["ECOG status not entered"],
                "structured_tags": ["EGFR", "NSCLC"],
                "file_path": "/Users/example/private/report.pdf",
            }
        ]

        packet = build_deidentified_case_packet(profile=profile, findings=findings, task="questions")
        serialized = repr(packet)

        self.assertEqual(packet["privacy_mode"], "deidentified_ai_assist")
        self.assertEqual(packet["profile_context"]["cancer_type"], "Non-small cell lung cancer")
        self.assertEqual(packet["profile_context"]["general_location"], "NC")
        self.assertEqual(packet["profile_context"]["biomarkers"][0]["name"], "EGFR")
        self.assertNotIn("Jane", serialized)
        self.assertNotIn("Coffey", serialized)
        self.assertNotIn("1958", serialized)
        self.assertNotIn("Dr. Smith", serialized)
        self.assertNotIn("Example Hospital", serialized)
        self.assertNotIn("555-111-2222", serialized)
        self.assertNotIn("file_path", serialized)
        self.assertNotIn("profile_id", serialized)
        assert_deidentified_packet(packet)

    def test_assert_deidentified_packet_rejects_identity_keys_and_contact_patterns(self) -> None:
        unsafe_packet = {
            "profile_context": {
                "cancer_type": "NSCLC",
                "display_name": "Jane Coffey",
                "contact": "jane@example.com",
            }
        }

        with self.assertRaises(DeidentificationError):
            assert_deidentified_packet(unsafe_packet)

    def test_assert_deidentified_packet_rejects_unknown_keys_and_identity_free_text(self) -> None:
        unsafe_packet = {
            "privacy_mode": "deidentified_ai_assist",
            "task": "Generate questions for Jane Coffey treated by Dr. Smith at Example Hospital",
            "profile_context": {"cancer_type": "NSCLC", "patient": "Jane Coffey"},
            "findings": [],
            "safety_instructions": [],
        }

        with self.assertRaises(DeidentificationError):
            assert_deidentified_packet(unsafe_packet)

    def test_build_packet_rejects_identity_in_task_text(self) -> None:
        with self.assertRaises(DeidentificationError):
            build_deidentified_case_packet(
                profile={"cancer_type": "NSCLC"},
                findings=[],
                task="Generate questions for Jane Coffey at Example Hospital",
            )

    def test_generalize_location_label_keeps_only_region_level_location(self) -> None:
        self.assertEqual(generalize_location_label("Jacksonville, NC 28546"), "NC")
        self.assertEqual(generalize_location_label("Rochester, Minnesota"), "Minnesota")
        self.assertIsNone(generalize_location_label("912 Greenway Dr Jacksonville NC"))


if __name__ == "__main__":
    unittest.main()
