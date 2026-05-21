from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings
from app.services.deidentification_service import assert_deidentified_packet


class OpenRouterClient:
    def __init__(self, api_key: str, model: str | None = None) -> None:
        self.api_key = api_key
        self.model = model or "openai/gpt-4.1-mini"
        self.base_url = settings.openrouter_base_url

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": settings.app_referer_header,
            "X-OpenRouter-Title": settings.app_title_header,
        }

    def test_api_key(self) -> tuple[bool, str, list[str]]:
        try:
            with httpx.Client(timeout=20.0) as client:
                response = client.get(f"{self.base_url}/models", headers=self._headers)
                response.raise_for_status()
                payload = response.json()
                data = payload.get("data", [])
                models = [item["id"] for item in data if item.get("id")]
                return True, "API key looks valid.", models
        except Exception as exc:
            return False, f"Could not validate the API key: {exc}", []

    def generate_clinician_questions(self, *, case_packet: dict[str, Any]) -> list[str]:
        assert_deidentified_packet(case_packet)
        messages = [
            {
                "role": "system",
                "content": (
                    "You are generating cautious clinician-discussion questions for a local oncology monitoring app. "
                    "Use only the de-identified case context provided. Do not infer identity. "
                    "Do not give treatment advice. Do not claim eligibility. Keep each question plain, short, and respectful."
                ),
            },
            {
                "role": "user",
                "content": {
                    "deidentified_case_packet": case_packet,
                    "instruction": "Generate 5 short questions the patient or clinician could review at an oncology visit.",
                },
            },
        ]
        try:
            with httpx.Client(timeout=45.0) as client:
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers,
                    json={
                        "model": self.model,
                        "messages": messages,
                        "temperature": 0.2,
                    },
                )
                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"]
                lines = [line.strip("-• ").strip() for line in str(content).splitlines() if line.strip()]
                return [line for line in lines if len(line) > 5][:5]
        except Exception:
            return []
