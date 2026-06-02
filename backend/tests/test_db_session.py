from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, text

import app.db.session as db_session


class DatabaseIntegrityTests(unittest.TestCase):
    def test_healthy_database_passes_integrity_check(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "oncowatch.db"
            engine = create_engine(f"sqlite:///{db_path}", future=True)
            try:
                # Touch the database so the file exists and is a valid SQLite db.
                with engine.connect() as connection:
                    connection.execute(text("CREATE TABLE probe (id INTEGER PRIMARY KEY)"))
                    connection.commit()
                with patch.object(db_session, "engine", engine):
                    ok, message = db_session.check_database_integrity()
            finally:
                engine.dispose()

        self.assertTrue(ok)
        self.assertIn("passed", message)

    def test_corrupt_database_fails_integrity_check(self) -> None:
        with TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "corrupt.db"
            # Write bytes that are not a valid SQLite database file.
            db_path.write_bytes(b"this is definitely not a sqlite database header" * 4)
            engine = create_engine(f"sqlite:///{db_path}", future=True)
            try:
                with patch.object(db_session, "engine", engine):
                    ok, message = db_session.check_database_integrity()
            finally:
                engine.dispose()

        self.assertFalse(ok)
        self.assertTrue(message)


if __name__ == "__main__":
    unittest.main()
