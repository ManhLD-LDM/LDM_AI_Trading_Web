"""
backend/exchange/key_manager.py

Mã hóa/giải mã Binance API keys bằng Fernet (AES-128-CBC + HMAC-SHA256).
ENCRYPTION_KEY phải được set trong environment variables.

Generate key:
  python -c "import secrets; print(secrets.token_hex(32))"
"""
import os
import base64
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from logger import setup_logger

logger = setup_logger("ldm.keymanager")

# Fixed salt — KHÔNG thay đổi sau khi đã có data trong DB
_SALT = b"ldm_trading_fernet_v1"


def _get_fernet() -> Fernet:
    """
    Derive a Fernet key từ ENCRYPTION_KEY env var bằng PBKDF2-SHA256.
    Raise RuntimeError nếu ENCRYPTION_KEY không được set.
    """
    raw_key = os.getenv("ENCRYPTION_KEY", "").strip()
    if not raw_key:
        raise RuntimeError(
            "ENCRYPTION_KEY must be set to store Binance API keys!\n"
            "Generate: python -c \"import secrets; print(secrets.token_hex(32))\"\n"
            "Then add to backend/.env: ENCRYPTION_KEY=<generated_value>"
        )
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_SALT,
        iterations=100_000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(raw_key.encode()))
    return Fernet(key)


def encrypt_key(plain_text: str) -> str:
    """Mã hóa API key/secret trước khi lưu vào DB."""
    if not plain_text or len(plain_text) < 5:
        raise ValueError("API key too short to encrypt")
    encrypted = _get_fernet().encrypt(plain_text.encode()).decode()
    logger.debug("API key encrypted successfully")
    return encrypted


def decrypt_key(encrypted: str) -> str:
    """
    Giải mã API key/secret khi cần dùng.
    Raise ValueError nếu token bị hỏng hoặc sai key.
    """
    try:
        return _get_fernet().decrypt(encrypted.encode()).decode()
    except InvalidToken as e:
        logger.error("Failed to decrypt API key — wrong ENCRYPTION_KEY or corrupted data")
        raise ValueError("Cannot decrypt API key. Verify ENCRYPTION_KEY has not changed.") from e


def verify_key_pair(api_key: str, api_secret: str) -> bool:
    """Basic sanity check trước khi encrypt — Binance keys đều có format nhất định."""
    return (
        len(api_key) >= 40 and api_key.isalnum() and
        len(api_secret) >= 40 and api_secret.isalnum()
    )
