from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.paths import get_app_paths
from app.db.base import Base

paths = get_app_paths()
engine = create_engine(
    f"sqlite:///{paths.db_path}",
    connect_args={"check_same_thread": False},
    future=True,
)


@event.listens_for(engine, "connect")
def _configure_sqlite_connection(dbapi_connection, connection_record) -> None:
    """Apply durability and integrity pragmas on every new SQLite connection.

    WAL journaling survives an unclean shutdown far better than the default
    rollback journal, ``synchronous=NORMAL`` keeps that durable without the
    full fsync cost, and ``foreign_keys=ON`` enforces the cascade/SET NULL
    rules declared on the models.
    """
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def check_database_integrity() -> tuple[bool, str]:
    """Run a fast SQLite integrity check against the application database.

    Returns ``(ok, message)`` and never raises, so startup and health checks
    can surface corruption as a clear status instead of crashing the app.
    """
    try:
        with engine.connect() as connection:
            result = connection.execute(text("PRAGMA quick_check")).scalar()
    except Exception as exc:  # pragma: no cover - defensive, depends on disk state
        return False, f"SQLite integrity check could not run: {exc}"
    if result == "ok":
        return True, "SQLite integrity check passed."
    return False, f"SQLite integrity check reported a problem: {result}"


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
