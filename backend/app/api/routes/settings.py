from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.mcp import McpAccessStatus, McpEnableResponse
from app.schemas.settings import (
    AIProvider,
    ApiProviderConfigRead,
    ApiProviderConfigUpsert,
    AppSettingsRead,
    AppSettingsUpdate,
    ProviderTestRequest,
    ProviderTestResponse,
)
from app.services.mcp_gateway_service import (
    disable_mcp_access,
    enable_mcp_access,
    mcp_access_status,
)
from app.services.settings_service import (
    ALLOWED_AI_PROVIDERS,
    get_provider_config,
    get_settings,
    list_provider_models,
    save_provider_config,
    test_provider,
    update_settings,
)

router = APIRouter()


@router.get("", response_model=AppSettingsRead)
def read_settings(db: Session = Depends(get_db)) -> AppSettingsRead:
    return get_settings(db)


@router.put("", response_model=AppSettingsRead)
def write_settings(payload: AppSettingsUpdate, db: Session = Depends(get_db)) -> AppSettingsRead:
    try:
        return update_settings(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# Provider routes are parametrized; the original /provider/openrouter/* URLs
# keep resolving unchanged. Unknown providers fail Literal validation with 422.


@router.get("/provider/{provider_key}", response_model=ApiProviderConfigRead | None)
def read_provider(provider_key: AIProvider, db: Session = Depends(get_db)) -> ApiProviderConfigRead | None:
    return get_provider_config(db, provider_key)


@router.post("/provider/{provider_key}/save", response_model=ApiProviderConfigRead)
def save_provider(
    provider_key: AIProvider,
    payload: ApiProviderConfigUpsert,
    db: Session = Depends(get_db),
) -> ApiProviderConfigRead:
    # The path segment is authoritative; the body cannot save under another key.
    effective = payload.model_copy(
        update={"provider_key": provider_key, "display_name": ALLOWED_AI_PROVIDERS[provider_key]}
    )
    return save_provider_config(db, effective)


@router.post("/provider/{provider_key}/test", response_model=ProviderTestResponse)
def test_provider_key(
    provider_key: AIProvider,
    payload: ProviderTestRequest,
    db: Session = Depends(get_db),
) -> ProviderTestResponse:
    return test_provider(db, provider_key, payload.api_key, payload.model)


@router.get("/provider/{provider_key}/models", response_model=list[str])
def get_provider_models(provider_key: AIProvider, db: Session = Depends(get_db)) -> list[str]:
    return list_provider_models(db, provider_key)


@router.get("/mcp", response_model=McpAccessStatus)
def read_mcp_access(db: Session = Depends(get_db)) -> McpAccessStatus:
    return McpAccessStatus(**mcp_access_status(db))


@router.post("/mcp/enable", response_model=McpEnableResponse)
def enable_mcp(db: Session = Depends(get_db)) -> McpEnableResponse:
    token = enable_mcp_access(db)
    return McpEnableResponse(enabled=True, connection_code=token)


@router.post("/mcp/disable", response_model=McpAccessStatus)
def disable_mcp(db: Session = Depends(get_db)) -> McpAccessStatus:
    disable_mcp_access(db)
    return McpAccessStatus(**mcp_access_status(db))
