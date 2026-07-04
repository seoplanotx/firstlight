from fastapi import APIRouter

from app.api.routes import (
    bootstrap,
    clinician_summary,
    data,
    dashboard,
    findings,
    health,
    mcp_gateway,
    onboarding,
    profiles,
    reports,
    runs,
    settings,
    sources,
)

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(bootstrap.router, prefix="/bootstrap", tags=["bootstrap"])
api_router.include_router(onboarding.router, prefix="/onboarding", tags=["onboarding"])
api_router.include_router(profiles.router, prefix="/profiles", tags=["profiles"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(sources.router, prefix="/sources", tags=["sources"])
api_router.include_router(findings.router, prefix="/findings", tags=["findings"])
api_router.include_router(runs.router, prefix="/runs", tags=["runs"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(
    clinician_summary.router, prefix="/clinician-summary", tags=["clinician-summary"]
)
api_router.include_router(data.router, prefix="/data", tags=["data"])
api_router.include_router(mcp_gateway.router, prefix="/mcp", tags=["mcp"])
