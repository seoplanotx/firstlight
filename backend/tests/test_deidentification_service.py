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
            "display_name": "Jane Firstlight",
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
        self.assertEqual(packet["profile_context"]["stage_group"], "Stage IV")
        self.assertEqual(packet["profile_context"]["general_location"], "NC")
        self.assertEqual(packet["profile_context"]["biomarkers"][0]["name"], "EGFR")
        self.assertNotIn("stage_or_context", packet["profile_context"])
        self.assertNotIn("current_therapy_status", packet["profile_context"])
        self.assertNotIn("would_consider", packet["profile_context"])
        self.assertNotIn("would_not_consider", packet["profile_context"])
        self.assertNotIn("therapy_history", packet["profile_context"])
        self.assertNotIn("Progressed after osimertinib", serialized)
        self.assertNotIn("long-distance travel", serialized)
        self.assertNotIn("Jane", serialized)
        self.assertNotIn("Firstlight", serialized)
        self.assertNotIn("1958", serialized)
        self.assertNotIn("Dr. Smith", serialized)
        self.assertNotIn("Example Hospital", serialized)
        self.assertNotIn("555-111-2222", serialized)
        self.assertNotIn("file_path", serialized)
        self.assertNotIn("profile_id", serialized)
        for disallowed_key in (
            "source_url",
            "published_at",
            "raw_summary",
            "normalized_summary",
            "matching_gaps",
        ):
            self.assertNotIn(disallowed_key, packet["findings"][0])
        assert_deidentified_packet(packet)

    def test_build_packet_omits_profile_derived_rationale_location_details(self) -> None:
        profile = {
            "cancer_type": "Non-small cell lung cancer",
            "location_label": "Jacksonville, NC 28546",
            "travel_radius_miles": 100,
        }
        findings = [
            {
                "title": "EGFR trial with nearby locations",
                "type": "clinical_trials",
                "source_name": "ClinicalTrials.gov",
                "source_url": "https://clinicaltrials.gov/study/NCT00000001",
                "external_identifier": "NCT00000001",
                "raw_summary": "Public trial summary",
                "normalized_summary": "Trial summary normalized for review",
                "why_it_surfaced": "The listed locations overlap with the entered travel area: Jacksonville, NC 28546.",
                "why_it_may_not_fit": "Travel from Jacksonville may still be difficult.",
                "matching_gaps": ["ECOG status not entered"],
            }
        ]

        packet = build_deidentified_case_packet(profile=profile, findings=findings, task="clinician_questions")
        serialized = repr(packet)

        self.assertNotIn("why_it_surfaced", packet["findings"][0])
        self.assertNotIn("why_it_may_not_fit", packet["findings"][0])
        self.assertNotIn("Jacksonville", serialized)
        self.assertNotIn("28546", serialized)
        self.assertEqual(packet["profile_context"]["general_location"], "NC")

    def test_build_packet_redacts_high_risk_profile_free_text_before_ai(self) -> None:
        packet = build_deidentified_case_packet(
            profile={
                "cancer_type": "NSCLC",
                "stage_or_context": "Stage IV at Duke in Raleigh on 4/12/58",
                "current_therapy_status": "treated at Duke in Raleigh on 4/12/58",
                "would_consider": ["clinical trials near Raleigh"],
                "would_not_consider": ["travel to Duke"],
                "therapy_history": [
                    {
                        "therapy_name": "osimertinib at Duke",
                        "therapy_type": "targeted therapy",
                        "line_of_therapy": "1L",
                        "status": "prior on 4/12/58",
                    }
                ],
            },
            findings=[],
            task="clinician_questions",
        )

        serialized = repr(packet)
        self.assertEqual(packet["profile_context"].get("stage_group"), "Stage IV")
        self.assertNotIn("stage_or_context", packet["profile_context"])
        self.assertNotIn("current_therapy_status", packet["profile_context"])
        self.assertNotIn("would_consider", packet["profile_context"])
        self.assertNotIn("would_not_consider", packet["profile_context"])
        self.assertNotIn("therapy_history", packet["profile_context"])
        self.assertNotIn("Duke", serialized)
        self.assertNotIn("Raleigh", serialized)
        self.assertNotIn("4/12/58", serialized)

    def test_assert_deidentified_packet_rejects_city_state_short_dates_and_facility_names(self) -> None:
        unsafe_packet = {
            "privacy_mode": "deidentified_ai_assist",
            "task": "clinician_questions",
            "profile_context": {"cancer_type": "NSCLC treated at Duke in Raleigh, NC on 4/12/58"},
            "findings": [],
            "safety_instructions": [],
        }

        with self.assertRaises(DeidentificationError):
            assert_deidentified_packet(unsafe_packet)

    def test_assert_deidentified_packet_rejects_legacy_high_risk_profile_keys(self) -> None:
        unsafe_packet = {
            "privacy_mode": "deidentified_ai_assist",
            "task": "clinician_questions",
            "profile_context": {"cancer_type": "NSCLC", "current_therapy_status": "Progressed after osimertinib"},
            "findings": [],
            "safety_instructions": [],
        }

        with self.assertRaises(DeidentificationError):
            assert_deidentified_packet(unsafe_packet)

    def test_assert_deidentified_packet_rejects_identity_keys_and_contact_patterns(self) -> None:
        unsafe_packet = {
            "profile_context": {
                "cancer_type": "NSCLC",
                "display_name": "Jane Firstlight",
                "contact": "jane@example.com",
            }
        }

        with self.assertRaises(DeidentificationError):
            assert_deidentified_packet(unsafe_packet)

    def test_assert_deidentified_packet_rejects_unknown_keys_and_identity_free_text(self) -> None:
        unsafe_packet = {
            "privacy_mode": "deidentified_ai_assist",
            "task": "Generate questions for Jane Firstlight treated by Dr. Smith at Example Hospital",
            "profile_context": {"cancer_type": "NSCLC", "patient": "Jane Firstlight"},
            "findings": [],
            "safety_instructions": [],
        }

        with self.assertRaises(DeidentificationError):
            assert_deidentified_packet(unsafe_packet)

    def test_assert_deidentified_packet_rejects_birth_years_and_all_caps_names(self) -> None:
        unsafe_values = [
            "NSCLC; patient born in 1958",
            "NSCLC for JANE COFFEY",
        ]
        for value in unsafe_values:
            with self.subTest(value=value):
                unsafe_packet = {
                    "privacy_mode": "deidentified_ai_assist",
                    "task": "clinician_questions",
                    "profile_context": {"cancer_type": value},
                    "findings": [],
                    "safety_instructions": [],
                }

                with self.assertRaises(DeidentificationError):
                    assert_deidentified_packet(unsafe_packet)

    def test_build_packet_rejects_identity_in_allowed_oncology_fields(self) -> None:
        unsafe_profile = {
            "cancer_type": "NSCLC for JANE COFFEY",
            "biomarkers": [{"name": "EGFR", "variant": "born 1958", "status": "positive"}],
        }

        with self.assertRaises(DeidentificationError):
            build_deidentified_case_packet(
                profile=unsafe_profile,
                findings=[],
                task="clinician_questions",
            )

    def test_build_packet_omits_identity_in_profile_free_text(self) -> None:
        packet = build_deidentified_case_packet(
            profile={
                "display_name": "Jane Firstlight",
                "cancer_type": "NSCLC",
                "stage_or_context": "Jane Firstlight was diagnosed on 1958-04-12",
            },
            findings=[],
            task="clinician_questions",
        )

        serialized = repr(packet)
        self.assertNotIn("stage_or_context", packet["profile_context"])
        self.assertNotIn("Jane", serialized)
        self.assertNotIn("1958-04-12", serialized)

    def test_assert_deidentified_packet_rejects_exact_dates_and_names_in_profile_context(self) -> None:
        unsafe_packet = {
            "privacy_mode": "deidentified_ai_assist",
            "task": "clinician_questions",
            "profile_context": {
                "cancer_type": "NSCLC",
                "stage_or_context": "Jane Firstlight was diagnosed on 1958-04-12",
                "current_therapy_status": "Next appointment is April 12, 2026",
            },
            "findings": [],
            "safety_instructions": [],
        }

        with self.assertRaises(DeidentificationError):
            assert_deidentified_packet(unsafe_packet)

    def test_assert_deidentified_packet_rejects_identity_patterns_anywhere_in_allowed_shape(self) -> None:
        unsafe_packet = {
            "privacy_mode": "deidentified_ai_assist",
            "task": "clinician_questions",
            "profile_context": {"cancer_type": "NSCLC"},
            "findings": [
                {
                    "type": "clinical_trials",
                    "title": "Jane Firstlight study at Example Hospital on 2026-04-12",
                    "source_name": "ClinicalTrials.gov",
                    "external_identifier": "NCT00000000",
                    "structured_tags": ["Jacksonville, NC 28546"],
                }
            ],
            "safety_instructions": [],
        }

        with self.assertRaises(DeidentificationError):
            assert_deidentified_packet(unsafe_packet)

    def test_build_packet_omits_therapy_history(self) -> None:
        packet = build_deidentified_case_packet(
            profile={
                "cancer_type": "NSCLC",
                "therapy_history": [
                    {
                        "therapy_name": "Jane Firstlight protocol",
                        "therapy_type": "targeted therapy",
                        "line_of_therapy": "1L",
                        "status": "prior",
                    }
                ],
            },
            findings=[],
            task="clinician_questions",
        )

        serialized = repr(packet)
        self.assertNotIn("therapy_history", packet["profile_context"])
        self.assertNotIn("Jane", serialized)
        self.assertNotIn("protocol", serialized)

    def test_build_packet_rejects_identity_in_task_text(self) -> None:
        with self.assertRaises(DeidentificationError):
            build_deidentified_case_packet(
                profile={"cancer_type": "NSCLC"},
                findings=[],
                task="Generate questions for Jane Firstlight at Example Hospital",
            )

    def test_build_packet_rejects_identity_fragments_in_allowed_cloud_fields(self) -> None:
        profile = {
            "display_name": "Jane Firstlight",
            "cancer_type": "Jane-associated NSCLC",
            "biomarkers": [{"name": "EGFR", "variant": "Firstlight-positive", "status": "positive"}],
        }
        findings = [
            {
                "title": "Firstlight's EGFR trial",
                "type": "clinical_trials",
                "source_name": "ClinicalTrials.gov",
                "external_identifier": "NCT00000000",
                "structured_tags": ["Jane review"],
            }
        ]

        with self.assertRaises(DeidentificationError):
            build_deidentified_case_packet(profile=profile, findings=findings, task="clinician_questions")

    def test_assert_deidentified_packet_rejects_initial_surname_identity_pattern(self) -> None:
        unsafe_packet = {
            "privacy_mode": "deidentified_ai_assist",
            "task": "clinician_questions",
            "profile_context": {"cancer_type": "NSCLC"},
            "findings": [
                {
                    "type": "clinical_trials",
                    "title": "J. Firstlight EGFR trial",
                    "source_name": "ClinicalTrials.gov",
                    "external_identifier": "NCT00000000",
                    "structured_tags": ["EGFR"],
                }
            ],
            "safety_instructions": [],
        }

        with self.assertRaises(DeidentificationError):
            assert_deidentified_packet(unsafe_packet)

    def test_assert_deidentified_packet_rejects_nested_non_string_structured_tags(self) -> None:
        unsafe_packet = {
            "privacy_mode": "deidentified_ai_assist",
            "task": "clinician_questions",
            "profile_context": {"cancer_type": "NSCLC"},
            "findings": [
                {
                    "type": "clinical_trials",
                    "title": "EGFR trial",
                    "source_name": "ClinicalTrials.gov",
                    "external_identifier": "NCT00000000",
                    "structured_tags": [{"city": "Jacksonville"}],
                }
            ],
            "safety_instructions": [],
        }

        with self.assertRaises(DeidentificationError):
            assert_deidentified_packet(unsafe_packet)

    def test_generalize_location_label_keeps_only_region_level_location(self) -> None:
        self.assertEqual(generalize_location_label("Jacksonville, NC 28546"), "NC")
        self.assertEqual(generalize_location_label("Rochester, Minnesota"), "Minnesota")
        self.assertIsNone(generalize_location_label("912 Greenway Dr Jacksonville NC"))


if __name__ == "__main__":
    unittest.main()
