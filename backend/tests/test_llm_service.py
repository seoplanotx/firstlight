from __future__ import annotations

import unittest

from app.services.deidentification_service import DeidentificationError
from app.services.llm_service import OpenRouterClient, validate_clinician_questions


class LlmServicePrivacyTests(unittest.TestCase):
    def test_validate_clinician_questions_rejects_recommendations_and_eligibility_claims(self) -> None:
        validated = validate_clinician_questions(
            [
                "1. You should start osimertinib now.",
                "2. The patient is eligible for NCT00000000.",
                "3. Could the care team review whether this trial is worth formal screening based on the full chart?",
                "4. What is the best treatment to take?",
                "5. Should any biomarker retesting be discussed before the next oncology visit?",
            ]
        )

        self.assertEqual(validated, [])

    def test_validate_clinician_questions_fails_closed_on_subtle_recommendation_language(self) -> None:
        unsafe_examples = [
            "Is osimertinib recommended for this patient?",
            "Would this patient benefit from osimertinib?",
            "Is trial eligibility likely?",
            "Is osimertinib appropriate for this patient?",
            "Is this trial a good fit for this patient?",
            "Which therapy should we choose next?",
            "Can we compare and rank these treatment options?",
            "Is the patient likely to respond to this dose?",
        ]

        for unsafe_question in unsafe_examples:
            with self.subTest(question=unsafe_question):
                validated = validate_clinician_questions(
                    [
                        "Could the care team review whether this trial is worth formal screening based on the full chart?",
                        unsafe_question,
                    ]
                )

                self.assertEqual(validated, [])

    def test_validate_clinician_questions_allows_cautious_review_questions(self) -> None:
        validated = validate_clinician_questions(
            [
                "Could the care team review whether this trial is worth formal screening based on the full chart?",
                "Which missing labs would matter before deciding whether this finding is worth reviewing further?",
            ]
        )

        self.assertEqual(
            validated,
            [
                "Could the care team review whether this trial is worth formal screening based on the full chart?",
                "Which missing labs would matter before deciding whether this finding is worth reviewing further?",
            ],
        )

    def test_clinician_question_generation_rejects_raw_identity_context_before_network_call(self) -> None:
        client = OpenRouterClient(api_key="test-key")

        with self.assertRaises(DeidentificationError):
            client.generate_clinician_questions(
                case_packet={
                    "profile_context": {
                        "cancer_type": "NSCLC",
                        "display_name": "Jane Firstlight",
                    },
                    "findings": [],
                }
            )


if __name__ == "__main__":
    unittest.main()
