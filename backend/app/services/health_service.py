from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.connectors.registry import connector_registry
from app.core.paths import get_app_paths
from app.schemas.health import HealthCheckItem, HealthCheckResponse
from app.services.report_service import can_render_test_pdf
from app.services.llm_service import create_llm_client
from app.services.settings_service import (
    ALLOWED_AI_PROVIDERS,
    get_active_provider,
    get_provider_api_key,
    list_source_configs,
)


def run_health_check(session: Session) -> HealthCheckResponse:
    items: list[HealthCheckItem] = []
    overall_ok = True

    paths = get_app_paths()
    storage_ok = paths.data_dir.exists() and paths.reports_dir.exists() and paths.logs_dir.exists()
    items.append(
        HealthCheckItem(
            key="storage",
            label="Local storage",
            ok=storage_ok,
            message=f"Data dir: {paths.data_dir}",
            severity="blocking",
            blocking=True,
        )
    )
    overall_ok &= storage_ok

    try:
        session.execute(text("SELECT 1"))
        db_ok = True
        db_message = f"SQLite ready at {paths.db_path}"
    except Exception as exc:
        db_ok = False
        db_message = f"SQLite failed: {exc}"
    items.append(
        HealthCheckItem(
            key="database",
            label="Database",
            ok=db_ok,
            message=db_message,
            severity="blocking",
            blocking=True,
        )
    )
    overall_ok &= db_ok

    try:
        integrity_result = session.execute(text("PRAGMA quick_check")).scalar()
        integrity_ok = integrity_result == "ok"
        integrity_message = (
            "SQLite integrity check passed."
            if integrity_ok
            else f"SQLite integrity check reported a problem: {integrity_result}"
        )
    except Exception as exc:
        integrity_ok = False
        integrity_message = f"SQLite integrity check failed: {exc}"
    items.append(
        HealthCheckItem(
            key="database_integrity",
            label="Database integrity",
            ok=integrity_ok,
            message=integrity_message,
            severity="ok" if integrity_ok else "blocking",
            blocking=True,
        )
    )
    overall_ok &= integrity_ok

    pdf_ok, pdf_message = can_render_test_pdf()
    items.append(
        HealthCheckItem(
            key="reports",
            label="Report generation",
            ok=pdf_ok,
            message=pdf_message,
            severity="blocking",
            blocking=True,
        )
    )
    overall_ok &= pdf_ok

    connectors = connector_registry()
    for source in [source for source in list_source_configs(session) if source.enabled]:
        connector = connectors.get(source.connector_key)
        if connector is None:
            items.append(
                HealthCheckItem(
                    key=source.connector_key,
                    label=source.name,
                    ok=False,
                    message="Connector is not registered in this build.",
                    severity="blocking",
                    blocking=True,
                )
            )
            overall_ok = False
            continue
        ok, message = connector.healthcheck()
        items.append(
            HealthCheckItem(
                key=source.connector_key,
                label=source.name,
                ok=ok,
                message=message,
                severity="ok" if ok else "warning",
                blocking=False,
            )
        )

    provider_key, provider = get_active_provider(session)
    api_key = get_provider_api_key(provider)
    if api_key and provider and provider.selected_model:
        ok, message, _ = create_llm_client(
            provider_key, api_key=api_key, model=provider.selected_model
        ).test_api_key()
        items.append(
            HealthCheckItem(
                key="ai_provider",
                label=ALLOWED_AI_PROVIDERS.get(provider_key, provider_key),
                ok=ok,
                message=message,
                severity="warning",
                blocking=False,
            )
        )

    return HealthCheckResponse(
        checked_at=datetime.now(timezone.utc),
        overall_ok=overall_ok,
        items=items,
    )
