from __future__ import annotations

import unittest

from app.services.deidentification_service import DeidentificationError
from app.services.llm_service import OpenRouterClient


class LlmServicePrivacyTests(unittest.TestCase):
    def test_clinician_question_generation_rejects_raw_identity_context_before_network_call(self) -> None:
        client = OpenRouterClient(api_key="test-key")

        with self.assertRaises(DeidentificationError):
            client.generate_clinician_questions(
                case_packet={
                    "profile_context": {
                        "cancer_type": "NSCLC",
                        "display_name": "Jane Coffey",
                    },
                    "findings": [],
                }
            )


if __name__ == "__main__":
    unittest.main()
