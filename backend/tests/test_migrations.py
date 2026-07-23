from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from sqlalchemy import create_engine, inspect, text

from alembic import command

from app.db.base import Base
from app.db.migrations import build_alembic_config, ensure_schema_up_to_date
from app import models  # noqa: F401


class MigrationTests(unittest.TestCase):
    def test_upgrade_creates_schema_for_new_database(self) -> None:
        with TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "oncowatch.sqlite3"
            ensure_schema_up_to_date(f"sqlite:///{db_path}")

            engine = create_engine(f"sqlite:///{db_path}", future=True)
            try:
                tables = set(inspect(engine).get_table_names())
                self.assertIn("patient_profiles", tables)
                self.assertIn("alembic_version", tables)
            finally:
                engine.dispose()

    def test_existing_unversioned_database_is_stamped(self) -> None:
        with TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "oncowatch.sqlite3"
            engine = create_engine(f"sqlite:///{db_path}", future=True)
            try:
                Base.metadata.create_all(bind=engine)
            finally:
                engine.dispose()

            ensure_schema_up_to_date(f"sqlite:///{db_path}")

            engine = create_engine(f"sqlite:///{db_path}", future=True)
            try:
                tables = set(inspect(engine).get_table_names())
                with engine.connect() as connection:
                    version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                self.assertIn("alembic_version", tables)
                self.assertEqual(version, "20260722_0006")
            finally:
                engine.dispose()

    def test_old_unversioned_database_gets_privacy_mode_columns_before_head_stamp(self) -> None:
        with TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "oncowatch.sqlite3"
            db_url = f"sqlite:///{db_path}"
            config = build_alembic_config(db_url)
            command.upgrade(config, "20260403_0001")

            engine = create_engine(db_url, future=True)
            try:
                with engine.begin() as connection:
                    connection.execute(text("DROP TABLE alembic_version"))
            finally:
                engine.dispose()

            ensure_schema_up_to_date(db_url)

            engine = create_engine(db_url, future=True)
            try:
                inspector = inspect(engine)
                app_settings_columns = {column["name"] for column in inspector.get_columns("app_settings")}
                self.assertIn("privacy_mode", app_settings_columns)
                self.assertIn("deidentified_ai_disclosure_acknowledged", app_settings_columns)
                self.assertIn("mcp_access_enabled", app_settings_columns)
                self.assertIn("mcp_access_token_encrypted", app_settings_columns)
                self.assertIn("active_ai_provider", app_settings_columns)
                findings_columns = {column["name"] for column in inspector.get_columns("findings")}
                self.assertIn("user_action", findings_columns)
                self.assertIn("plain_language_summary", findings_columns)
                self.assertIn("plain_language_generated_at", findings_columns)
                with engine.connect() as connection:
                    version = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
                self.assertEqual(version, "20260722_0006")
            finally:
                engine.dispose()
