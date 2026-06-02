from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.services.audit_service import read_audit_events
from app.services.data_service import delete_all_data, export_all_data
from app.utils.dates import utcnow

router = APIRouter()


@router.get("/export")
def export_data(db: Session = Depends(get_db)) -> JSONResponse:
    payload = export_all_data(db)
    filename = f"oncowatch-export-{utcnow().date().isoformat()}.json"
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/delete")
def delete_data(db: Session = Depends(get_db)) -> dict[str, int]:
    return delete_all_data(db)


@router.get("/audit-log")
def audit_log(limit: int = 200) -> dict[str, object]:
    capped = max(1, min(limit, 1000))
    return {"events": read_audit_events(limit=capped)}
