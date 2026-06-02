from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.core.paths import get_app_paths
from app.utils.dates import utcnow

logger = logging.getLogger(__name__)

AUDIT_FILE_NAME = "audit.log"


def _audit_path() -> Path:
    return get_app_paths().logs_dir / AUDIT_FILE_NAME


def record_audit_event(action: str, detail: dict[str, Any] | None = None) -> None:
    """Append a single, timestamped audit entry as one JSON line.

    The audit trail records *that* a data-affecting action happened, not the
    patient content itself: callers must pass only non-identifying detail
    (ids, counts, types, statuses) so the log never becomes a second copy of
    sensitive data. Failures here are logged but never raised, so auditing can
    never break a user-facing action.
    """
    entry = {
        "timestamp": utcnow().isoformat(),
        "action": action,
        "detail": detail or {},
    }
    try:
        with _audit_path().open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, default=str) + "\n")
    except OSError as exc:  # pragma: no cover - depends on disk state
        logger.warning("Could not write audit event %s: %s", action, exc)


def read_audit_events(limit: int = 200) -> list[dict[str, Any]]:
    """Return the most recent audit entries, newest first."""
    path = _audit_path()
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:  # pragma: no cover - depends on disk state
        logger.warning("Could not read audit log: %s", exc)
        return []

    events: list[dict[str, Any]] = []
    for line in lines[-limit:]:
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    events.reverse()
    return events
