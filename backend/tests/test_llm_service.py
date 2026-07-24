from __future__ import annotations

from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import httpx

from app.services import llm_service
from app.services.deidentification_service import DeidentificationError
from app.services.llm_service import (
    AnthropicClient,
    OpenRouterClient,
    create_llm_client,
    validate_clinician_questions,
)

VALID_DEIDENTIFIED_PACKET = {
    "privacy_mode": "deidentified_ai_assist",
    "task": "clinician_questions",
    "profile_context": {"cancer_type": "NSCLC", "stage_group": "Stage IV", "biomarkers": []},
    "findings": [],
    "safety_instructions": ["Do not give treatment advice."],
}


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


class AnthropicClientTests(unittest.TestCase):
    def test_deidentification_gate_fires_before_any_network_call(self) -> None:
        client = AnthropicClient(api_key="sk-ant-test")

        with patch.object(llm_service.anthropic, "Anthropic") as mock_sdk:
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
            mock_sdk.assert_not_called()

    def test_request_shape_uses_messages_api_without_sampling_params(self) -> None:
        safe_question = (
            "Could the care team review whether this trial is worth formal screening based on the full chart?"
        )
        mock_instance = MagicMock()
        mock_instance.messages.create.return_value = SimpleNamespace(
            content=[SimpleNamespace(type="text", text=safe_question)]
        )

        with patch.object(llm_service.anthropic, "Anthropic", return_value=mock_instance):
            client = AnthropicClient(api_key="sk-ant-test")
            questions = client.generate_clinician_questions(case_packet=dict(VALID_DEIDENTIFIED_PACKET))

        self.assertEqual(questions, [safe_question])
        kwargs = mock_instance.messages.create.call_args.kwargs
        self.assertEqual(kwargs["model"], "claude-sonnet-4-6")
        self.assertEqual(kwargs["max_tokens"], 1024)
        self.assertIn("de-identified case context", kwargs["system"])
        self.assertEqual(kwargs["messages"][0]["role"], "user")
        self.assertIn("deidentified_case_packet", kwargs["messages"][0]["content"])
        self.assertNotIn("temperature", kwargs)

    def test_unsafe_model_output_fails_closed_to_empty_list(self) -> None:
        mock_instance = MagicMock()
        mock_instance.messages.create.return_value = SimpleNamespace(
            content=[SimpleNamespace(type="text", text="You should start osimertinib now.")]
        )

        with patch.object(llm_service.anthropic, "Anthropic", return_value=mock_instance):
            client = AnthropicClient(api_key="sk-ant-test")
            questions = client.generate_clinician_questions(case_packet=dict(VALID_DEIDENTIFIED_PACKET))

        self.assertEqual(questions, [])

    def test_network_errors_fail_closed_to_empty_results(self) -> None:
        mock_instance = MagicMock()
        mock_instance.messages.create.side_effect = RuntimeError("boom")

        with patch.object(llm_service.anthropic, "Anthropic", return_value=mock_instance):
            client = AnthropicClient(api_key="sk-ant-test")
            self.assertEqual(
                client.generate_clinician_questions(case_packet=dict(VALID_DEIDENTIFIED_PACKET)), []
            )
            self.assertEqual(client.generate_case_framing(case_packet=dict(VALID_DEIDENTIFIED_PACKET)), "")

    def test_test_api_key_reports_invalid_keys_gently(self) -> None:
        auth_error = llm_service.anthropic.AuthenticationError(
            "invalid x-api-key",
            response=httpx.Response(401, request=httpx.Request("GET", "https://api.anthropic.com/v1/models")),
            body=None,
        )
        mock_instance = MagicMock()
        mock_instance.models.list.side_effect = auth_error

        with patch.object(llm_service.anthropic, "Anthropic", return_value=mock_instance):
            ok, message, models = AnthropicClient(api_key="sk-ant-bad").test_api_key()

        self.assertFalse(ok)
        self.assertIn("console.anthropic.com", message)
        self.assertEqual(models, [])


class CreateLlmClientTests(unittest.TestCase):
    def test_factory_returns_provider_specific_clients(self) -> None:
        self.assertIsInstance(create_llm_client("openrouter", api_key="k"), OpenRouterClient)
        self.assertIsInstance(create_llm_client("anthropic", api_key="k"), AnthropicClient)

    def test_factory_rejects_unknown_providers(self) -> None:
        with self.assertRaises(ValueError):
            create_llm_client("mystery", api_key="k")

    def test_default_models_per_provider(self) -> None:
        self.assertEqual(create_llm_client("openrouter", api_key="k").model, "anthropic/claude-sonnet-5")
        self.assertEqual(create_llm_client("anthropic", api_key="k").model, "claude-sonnet-4-6")


if __name__ == "__main__":
    unittest.main()
