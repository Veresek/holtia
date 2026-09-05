import pytest

from app.services.ai.crypto import (
    DECRYPT_ERROR,
    ENCRYPTION_KEY_ERROR,
    decrypt_api_key,
    encrypt_api_key,
    key_hint,
    parse_encryption_key,
)
from tests.conftest import TEST_AI_ENCRYPTION_KEY

API_KEY = "sk-test-openai-secret-key-value"


def test_encryption_round_trip() -> None:
    key = parse_encryption_key(TEST_AI_ENCRYPTION_KEY)
    ciphertext, nonce = encrypt_api_key(API_KEY, key)

    assert API_KEY.encode() not in ciphertext
    assert decrypt_api_key(ciphertext, nonce, key) == API_KEY
    assert key_hint(API_KEY) == "alue"


def test_tampered_ciphertext_cannot_be_read() -> None:
    key = parse_encryption_key(TEST_AI_ENCRYPTION_KEY)
    ciphertext, nonce = encrypt_api_key(API_KEY, key)
    tampered = bytes([ciphertext[0] ^ 1]) + ciphertext[1:]

    with pytest.raises(ValueError, match=DECRYPT_ERROR):
        decrypt_api_key(tampered, nonce, key)


def test_wrong_encryption_key_cannot_decrypt() -> None:
    key = parse_encryption_key(TEST_AI_ENCRYPTION_KEY)
    ciphertext, nonce = encrypt_api_key(API_KEY, key)
    other = parse_encryption_key("1" * 64)

    with pytest.raises(ValueError, match=DECRYPT_ERROR):
        decrypt_api_key(ciphertext, nonce, other)


def test_hex_encryption_key_is_accepted() -> None:
    key = parse_encryption_key("ab" * 32)

    assert len(key) == 32


@pytest.mark.parametrize("value", ["", "too-short", "===="])
def test_invalid_encryption_keys_are_rejected(value: str) -> None:
    with pytest.raises(ValueError, match=ENCRYPTION_KEY_ERROR):
        parse_encryption_key(value)
