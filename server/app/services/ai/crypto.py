import base64
import binascii
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ENCRYPTION_KEY_ERROR = (
    "AI_ENCRYPTION_KEY must be 32 bytes, encoded as standard base64 or hex."
)
DECRYPT_ERROR = "The stored API key could not be read. Save it again."
NONCE_SIZE = 12
KEY_SIZE = 32


def parse_encryption_key(value: str) -> bytes:
    raw = value.strip()
    if not raw:
        raise ValueError(ENCRYPTION_KEY_ERROR)
    if len(raw) == KEY_SIZE * 2:
        decoded = _decode_hex(raw)
        if decoded is not None:
            return decoded
    decoded = _decode_base64(raw)
    if decoded is not None and len(decoded) == KEY_SIZE:
        return decoded
    raise ValueError(ENCRYPTION_KEY_ERROR)


def _decode_base64(value: str) -> bytes | None:
    try:
        decoded = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        return None
    return decoded


def _decode_hex(value: str) -> bytes | None:
    if len(value) != KEY_SIZE * 2:
        return None
    try:
        return bytes.fromhex(value)
    except ValueError:
        return None


def encrypt_api_key(plaintext: str, key: bytes) -> tuple[bytes, bytes]:
    nonce = os.urandom(NONCE_SIZE)
    ciphertext = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    return ciphertext, nonce


def decrypt_api_key(ciphertext: bytes, nonce: bytes, key: bytes) -> str:
    try:
        return AESGCM(key).decrypt(nonce, ciphertext, None).decode("utf-8")
    except (InvalidTag, ValueError, UnicodeDecodeError) as exc:
        raise ValueError(DECRYPT_ERROR) from exc


def key_hint(api_key: str) -> str:
    compact = "".join(character for character in api_key if character.isalnum())
    return compact[-4:]
