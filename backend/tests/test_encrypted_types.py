from __future__ import annotations

from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.profile import PatientProfile


class EncryptedColumnTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        db_path = Path(self._tmp.name) / "encrypted.db"
        self.engine = create_engine(f"sqlite:///{db_path}", future=True)
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine, expire_on_commit=False)

    def tearDown(self) -> None:
        self.engine.dispose()
        self._tmp.cleanup()

    def test_identifying_fields_are_ciphertext_on_disk_but_plaintext_via_orm(self) -> None:
        with self.session_factory() as session:
            profile = PatientProfile(
                profile_name="Jane Patient Smith",
                display_name="J.S.",
                date_of_birth=date(1962, 7, 14),
                cancer_type="Non-small cell lung cancer",
                location_label="Dallas-Fort Worth, Texas",
                notes="Lives near the Baylor campus; prefers morning appointments.",
                would_consider=[],
                would_not_consider=[],
            )
            session.add(profile)
            session.commit()
            profile_id = profile.id

        # Raw SQL bypasses the TypeDecorator and sees what is actually stored.
        with self.engine.connect() as connection:
            row = connection.execute(
                text(
                    "SELECT profile_name, display_name, date_of_birth, cancer_type, "
                    "location_label, notes FROM patient_profiles WHERE id = :id"
                ),
                {"id": profile_id},
            ).one()

        raw_name, raw_display, raw_dob, raw_cancer, raw_location, raw_notes = row
        # Identifying fields are encrypted (not equal to plaintext, Fernet token shape).
        self.assertNotEqual(raw_name, "Jane Patient Smith")
        self.assertTrue(raw_name.startswith("gAAAA"))
        self.assertNotIn("J.S.", raw_display)
        self.assertNotIn("1962", raw_dob)
        self.assertNotIn("Baylor", raw_notes)
        self.assertNotIn("Dallas", raw_location)
        # Clinical, non-identifying fields stay plaintext for querying/matching.
        self.assertEqual(raw_cancer, "Non-small cell lung cancer")

        # The ORM transparently decrypts on load.
        with self.session_factory() as session:
            loaded = session.get(PatientProfile, profile_id)
            self.assertEqual(loaded.profile_name, "Jane Patient Smith")
            self.assertEqual(loaded.display_name, "J.S.")
            self.assertEqual(loaded.date_of_birth, date(1962, 7, 14))
            self.assertEqual(loaded.location_label, "Dallas-Fort Worth, Texas")
            self.assertIn("Baylor", loaded.notes)


if __name__ == "__main__":
    unittest.main()
