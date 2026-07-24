from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.release import PUBLIC_SOURCE_CATEGORIES, PUBLIC_SOURCE_KEYS
from app.core.security import decrypt_secret, encrypt_secret
from app.services.audit_service import record_audit_event
from app.models.settings import ApiProviderConfig, AppSettings, SourceConfig
from app.schemas.settings import (
    ApiProviderConfigUpsert,
    AppSettingsUpdate,
    ProviderTestResponse,
    SourceConfigUpdate,
)
from app.services.deidentification_service import (
    PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST,
    PRIVACY_MODE_LOCAL_ONLY,
)
from app.services.llm_service import FIRST_PARTY_ANTHROPIC_MODELS, create_llm_client
from app.services.scheduler_service import configure_scheduler_from_settings


ALLOWED_AI_PROVIDERS = {
    "openrouter": "OpenRouter",
    "anthropic": "Anthropic (Claude)",
}

# Curated starting set of OpenRouter model IDs, one or more per frontier lab
# (latest as of 2026-07-24). This is only a convenience fallback shown before a
# valid key is available: with a key, `list_provider_models` returns OpenRouter's
# full live catalog, and any model ID can be entered by hand (e.g.
# "moonshotai/kimi-k3"), so this list is never a hard limit.
FALLBACK_MODELS = [
    # Anthropic (Claude)
    "anthropic/claude-sonnet-5",
    "anthropic/claude-fable-5",
    "anthropic/claude-opus-4.6",
    "anthropic/claude-haiku-4.5",
    # OpenAI (GPT)
    "openai/gpt-5.6-sol",
    "openai/gpt-5.6-terra",
    "openai/gpt-5.6-luna",
    "openai/gpt-5.5-pro",
    # Google (Gemini)
    "google/gemini-3.1-pro-preview",
    "google/gemini-3.5-flash",
    # xAI (Grok)
    "x-ai/grok-4.5",
    # DeepSeek
    "deepseek/deepseek-v4-pro",
    "deepseek/deepseek-v4-flash",
    # Moonshot AI (Kimi)
    "moonshotai/kimi-k3",
    # Alibaba (Qwen)
    "qwen/qwen3.7-max",
    # Meta (Llama)
    "meta-llama/llama-4-maverick",
    # Mistral
    "mistralai/mistral-large",
]

FALLBACK_MODELS_BY_PROVIDER = {
    "openrouter": FALLBACK_MODELS,
    "anthropic": FIRST_PARTY_ANTHROPIC_MODELS,
}


def get_settings(session: Session) -> AppSettings:
    settings = session.scalar(select(AppSettings))
    if settings is None:
        settings = AppSettings(
            daily_run_time="08:30",
            default_report_style="clinical",
            default_report_length="daily_summary",
            enabled_source_categories=sorted(PUBLIC_SOURCE_CATEGORIES),
            privacy_mode=PRIVACY_MODE_LOCAL_ONLY,
            deidentified_ai_disclosure_acknowledged=False,
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)
    else:
        settings.enabled_source_categories = [
            category
            for category in settings.enabled_source_categories
            if category in PUBLIC_SOURCE_CATEGORIES
        ] or sorted(PUBLIC_SOURCE_CATEGORIES)
        settings.demo_profile_enabled = False
        if settings.privacy_mode not in {PRIVACY_MODE_LOCAL_ONLY, PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST}:
            settings.privacy_mode = PRIVACY_MODE_LOCAL_ONLY
        if settings.privacy_mode == PRIVACY_MODE_LOCAL_ONLY:
            settings.deidentified_ai_disclosure_acknowledged = False
        session.commit()
    return settings


def update_settings(session: Session, payload: AppSettingsUpdate) -> AppSettings:
    if (
        payload.privacy_mode == PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST
        and not payload.deidentified_ai_disclosure_acknowledged
    ):
        raise ValueError("De-identified AI assist requires disclosure acknowledgement.")

    settings = get_settings(session)
    settings.default_profile_id = payload.default_profile_id
    settings.daily_run_time = payload.daily_run_time
    settings.default_report_style = payload.default_report_style
    settings.default_report_length = payload.default_report_length
    settings.demo_profile_enabled = False
    settings.privacy_mode = payload.privacy_mode
    if payload.active_ai_provider is not None:
        if payload.active_ai_provider not in ALLOWED_AI_PROVIDERS:
            raise ValueError("Unknown AI provider selection.")
        settings.active_ai_provider = payload.active_ai_provider
    settings.deidentified_ai_disclosure_acknowledged = (
        payload.deidentified_ai_disclosure_acknowledged
        if payload.privacy_mode == PRIVACY_MODE_DEIDENTIFIED_AI_ASSIST
        else False
    )
    settings.last_health_check_at = datetime.now(timezone.utc)
    session.commit()
    record_audit_event(
        "privacy_mode_set",
        {
            "privacy_mode": settings.privacy_mode,
            "deidentified_ai_disclosure_acknowledged": settings.deidentified_ai_disclosure_acknowledged,
        },
    )
    configure_scheduler_from_settings(settings.daily_run_time)
    return get_settings(session)


def list_source_configs(session: Session) -> list[SourceConfig]:
    return session.scalars(
        select(SourceConfig)
        .where(SourceConfig.connector_key.in_(tuple(PUBLIC_SOURCE_KEYS)))
        .order_by(SourceConfig.category, SourceConfig.name)
    ).all()


def update_source_config(session: Session, source_id: int, payload: SourceConfigUpdate) -> SourceConfig:
    source = session.get(SourceConfig, source_id)
    if source is None or source.connector_key not in PUBLIC_SOURCE_KEYS:
        raise ValueError("Source config not found")
    source.enabled = payload.enabled
    source.settings_json = payload.settings_json
    session.commit()

    settings = get_settings(session)
    enabled_categories = sorted({config.category for config in list_source_configs(session) if config.enabled})
    settings.enabled_source_categories = enabled_categories
    session.commit()
    return source


def get_provider_config(session: Session, provider_key: str = "openrouter") -> ApiProviderConfig | None:
    return session.scalar(select(ApiProviderConfig).where(ApiProviderConfig.provider_key == provider_key))


def save_provider_config(session: Session, payload: ApiProviderConfigUpsert) -> ApiProviderConfig:
    provider = get_provider_config(session, payload.provider_key)
    if provider is None:
        provider = ApiProviderConfig(provider_key=payload.provider_key, display_name=payload.display_name)
        session.add(provider)

    provider.display_name = payload.display_name
    provider.selected_model = payload.selected_model
    if payload.api_key is not None and payload.api_key.strip():
        provider.encrypted_api_key = encrypt_secret(payload.api_key.strip())
        provider.is_configured = True
    provider.last_tested_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(provider)
    return provider


def get_provider_api_key(provider: ApiProviderConfig | None) -> str | None:
    if provider is None:
        return None
    return decrypt_secret(provider.encrypted_api_key)


def get_active_provider(session: Session) -> tuple[str, ApiProviderConfig | None]:
    """Return the selected provider key plus its stored config (if any)."""

    settings = get_settings(session)
    provider_key = settings.active_ai_provider or "openrouter"
    if provider_key not in ALLOWED_AI_PROVIDERS:
        provider_key = "openrouter"
    return provider_key, get_provider_config(session, provider_key)


def test_provider(session: Session, provider_key: str, api_key: str, model: str | None = None) -> ProviderTestResponse:
    client = create_llm_client(provider_key, api_key=api_key, model=model)
    ok, message, models = client.test_api_key()
    return ProviderTestResponse(ok=ok, message=message, discovered_models=models[:20])


def list_provider_models(session: Session, provider_key: str, api_key: str | None = None) -> list[str]:
    if api_key:
        ok, _, models = create_llm_client(provider_key, api_key=api_key).test_api_key()
        if ok and models:
            return models
    provider = get_provider_config(session, provider_key)
    stored_key = get_provider_api_key(provider)
    if stored_key:
        ok, _, models = create_llm_client(provider_key, api_key=stored_key).test_api_key()
        if ok and models:
            return models
    return FALLBACK_MODELS_BY_PROVIDER.get(provider_key, FALLBACK_MODELS)
