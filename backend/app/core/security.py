from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

import keyring
from cryptography.fernet import Fernet, InvalidToken
from keyring.errors import KeyringError

from app.core.paths import get_app_paths

logger = logging.getLogger(__name__)

# Identifiers for the master key entry in the OS keychain (macOS Keychain /
# Windows Credential Manager via the `keyring` library).
KEYRING_SERVICE = "OncoWatch"
KEYRING_USERNAME = "local-data-key"


def _key_from_keyring() -> bytes | None:
    try:
        stored = keyring.get_password(KEYRING_SERVICE, KEYRING_USERNAME)
    except KeyringError as exc:
        logger.warning("OS keychain unavailable, falling back to key file: %s", exc)
        return None
    if not stored:
        return None
    return stored.encode("utf-8")


def _store_key_in_keyring(key: bytes) -> bool:
    try:
        keyring.set_password(KEYRING_SERVICE, KEYRING_USERNAME, key.decode("utf-8"))
        return True
    except KeyringError as exc:
        logger.warning("Could not store master key in OS keychain: %s", exc)
        return False


def _key_from_file() -> bytes | None:
    key_path: Path = get_app_paths().secret_key_path
    if key_path.exists():
        return key_path.read_bytes()
    return None


def _write_key_file(key: bytes) -> None:
    key_path: Path = get_app_paths().secret_key_path
    key_path.write_bytes(key)
    try:
        key_path.chmod(0o600)
    except OSError:
        pass


def _load_or_create_key() -> bytes:
    """Resolve the local data-encryption key.

    Preference order:
      1. The OS keychain (most secure; key never touches the filesystem).
      2. A legacy/local key file, which is migrated into the keychain when one
         is available.
      3. A freshly generated key, stored in the keychain when possible and
         otherwise written to the protected key file.

    The key file is retained as a fallback so a keychain that later becomes
    unavailable (e.g. a locked session) cannot lock the user out of their own
    local data.
    """
    keyring_key = _key_from_keyring()
    if keyring_key is not None:
        return keyring_key

    file_key = _key_from_file()
    if file_key is not None:
        _store_key_in_keyring(file_key)
        return file_key

    key = Fernet.generate_key()
    stored_in_keyring = _store_key_in_keyring(key)
    if not stored_in_keyring:
        _write_key_file(key)
    return key


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    return Fernet(_load_or_create_key())


def reset_key_cache() -> None:
    """Clear the cached cipher. Intended for tests and key-rotation flows."""
    _fernet.cache_clear()


def encrypt_value(value: str | None) -> str | None:
    if value is None:
        return None
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_value(value: str | None) -> str | None:
    """Decrypt a token, tolerating legacy plaintext stored before encryption.

    Local databases created before at-rest encryption hold plaintext values;
    returning them unchanged on an InvalidToken keeps those installs readable
    instead of crashing on every load.
    """
    if value is None:
        return None
    try:
        return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return value


# Backwards-compatible aliases for existing secret-storage call sites.
encrypt_secret = encrypt_value
decrypt_secret = decrypt_value
