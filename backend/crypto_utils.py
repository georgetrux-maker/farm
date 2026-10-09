"""Băm mật khẩu, mã hóa token lưu trong DB, ký dữ liệu OAuth state."""
import base64
import hashlib
import hmac
import json
import secrets
import time

from cryptography.fernet import Fernet, InvalidToken

from backend import config

_SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1, "dklen": 32}


class SecretKeyMissing(RuntimeError):
    pass


# ----------------------------------------------------------------- mật khẩu
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, salt_b64, digest_b64 = stored.split("$")
    except (ValueError, AttributeError):
        return False
    if algo != "scrypt":
        return False
    digest = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64), **_SCRYPT)
    return hmac.compare_digest(digest, base64.b64decode(digest_b64))


# ----------------------------------------------------------------- mã hóa token
def _secret() -> bytes:
    key = config.app_secret_key()
    if len(key) < 32:
        raise SecretKeyMissing("Chưa đặt APP_SECRET_KEY (ít nhất 32 ký tự) trong backend/.env")
    return key.encode()


def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(b"token-encryption|" + _secret()).digest()))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode() if value else ""


def decrypt(value: str) -> str:
    if not value:
        return ""
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as e:
        raise SecretKeyMissing("Không giải mã được token (APP_SECRET_KEY đã bị đổi?)") from e


# ----------------------------------------------------------------- ký dữ liệu
def sign(payload: dict, ttl_sec: int = 600) -> str:
    """Đóng gói payload thành chuỗi có chữ ký và hạn dùng (dùng cho OAuth state)."""
    body = dict(payload, exp=int(time.time()) + ttl_sec, nonce=secrets.token_hex(8))
    raw = base64.urlsafe_b64encode(json.dumps(body, separators=(",", ":")).encode()).decode().rstrip("=")
    mac = hmac.new(hashlib.sha256(b"state|" + _secret()).digest(), raw.encode(), hashlib.sha256).hexdigest()
    return f"{raw}.{mac}"


def unsign(token: str):
    """Trả payload nếu chữ ký đúng và chưa hết hạn, ngược lại None."""
    try:
        raw, mac = token.rsplit(".", 1)
        expected = hmac.new(hashlib.sha256(b"state|" + _secret()).digest(), raw.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(mac, expected):
            return None
        body = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
    except (ValueError, json.JSONDecodeError):
        return None
    if body.get("exp", 0) < time.time():
        return None
    return body
