from __future__ import annotations

import logging
from threading import Lock

from apscheduler.schedulers.background import BackgroundScheduler

from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None
_scheduler_lock = Lock()
JOB_ID = "daily-monitoring"


def get_scheduler() -> BackgroundScheduler:
    global _scheduler
    with _scheduler_lock:
        if _scheduler is None:
            _scheduler = BackgroundScheduler()
        return _scheduler


def start_scheduler() -> None:
    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.start()
        logger.info("Scheduler started.")


def shutdown_scheduler() -> None:
    scheduler = get_scheduler()
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped.")


def _run_scheduled_job() -> None:
    from app.services.monitoring_service import RunConflictError, run_monitoring

    with SessionLocal() as session:
        try:
            run_monitoring(session, triggered_by="heartbeat")
        except RunConflictError:
            logger.info("Skipped scheduled run because monitoring is already in progress.")


DEFAULT_RUN_TIME = (8, 30)


def parse_run_time(value: str | None) -> tuple[int, int] | None:
    """Parse "HH:MM" (24-hour) into ``(hour, minute)``; ``None`` if malformed."""
    if not isinstance(value, str):
        return None
    parts = value.strip().split(":")
    if len(parts) != 2 or not all(part.isdigit() for part in parts):
        return None
    hour, minute = int(parts[0]), int(parts[1])
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return hour, minute


def configure_scheduler_from_settings(daily_run_time: str) -> None:
    scheduler = get_scheduler()
    parsed = parse_run_time(daily_run_time)
    if parsed is None:
        # A bad stored value must never stop the app from starting.
        logger.warning("Invalid daily run time %r; using %02d:%02d.", daily_run_time, *DEFAULT_RUN_TIME)
        parsed = DEFAULT_RUN_TIME
    hour, minute = parsed
    scheduler.add_job(
        _run_scheduled_job,
        trigger="cron",
        id=JOB_ID,
        replace_existing=True,
        hour=hour,
        minute=minute,
        coalesce=True,
        # No grace limit: if the computer was asleep at the scheduled time,
        # run once when it wakes instead of silently skipping the day.
        misfire_grace_time=None,
    )
    logger.info("Daily monitoring job scheduled for %02d:%02d", hour, minute)


def next_run_time_iso() -> str | None:
    scheduler = get_scheduler()
    job = scheduler.get_job(JOB_ID)
    if not job or not job.next_run_time:
        return None
    return job.next_run_time.isoformat()
