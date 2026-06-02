from __future__ import annotations

from datetime import date

from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from app.core.security import decrypt_value, encrypt_value


class EncryptedString(TypeDecorator):
    """A Text column whose value is Fernet-encrypted at rest.

    Encryption/decryption is transparent to application code: the ORM stores
    ciphertext on disk but hands back plaintext on load, so matching, display,
    and reporting are unaffected. Note that encrypted columns cannot be used in
    SQL equality/LIKE predicates on their plaintext value.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt_value(str(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt_value(value)


class EncryptedDate(TypeDecorator):
    """A date stored as a Fernet-encrypted ISO-8601 string."""

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, date):
            return encrypt_value(value.isoformat())
        return encrypt_value(str(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        decrypted = decrypt_value(value)
        if not decrypted:
            return None
        try:
            return date.fromisoformat(decrypted)
        except ValueError:
            return None
