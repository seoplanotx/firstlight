from __future__ import annotations

import unittest
from unittest.mock import patch

from cryptography.fernet import Fernet

import app.core.security as security


class SecurityTests(unittest.TestCase):
    def tearDown(self) -> None:
        # Ensure later tests fall back to the on-disk/process key cleanly.
        security.reset_key_cache()

    def test_encrypt_decrypt_round_trip(self) -> None:
        token = security.encrypt_value("Jane Patient Smith")
        self.assertNotEqual(token, "Jane Patient Smith")
        self.assertEqual(security.decrypt_value(token), "Jane Patient Smith")

    def test_none_passes_through(self) -> None:
        self.assertIsNone(security.encrypt_value(None))
        self.assertIsNone(security.decrypt_value(None))

    def test_decrypt_tolerates_legacy_plaintext(self) -> None:
        # Values written before at-rest encryption are not valid Fernet tokens
        # and must be returned unchanged rather than raising.
        self.assertEqual(security.decrypt_value("legacy plaintext value"), "legacy plaintext value")

    def test_prefers_os_keychain_when_available(self) -> None:
        key = Fernet.generate_key().decode("utf-8")
        with patch.object(security.keyring, "get_password", return_value=key):
            security.reset_key_cache()
            token = security.encrypt_value("secret")
            self.assertEqual(security.decrypt_value(token), "secret")
            # The cipher in use must be the keychain-provided key.
            self.assertEqual(Fernet(key.encode("utf-8")).decrypt(token.encode("utf-8")).decode("utf-8"), "secret")


if __name__ == "__main__":
    unittest.main()
