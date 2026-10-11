"""Cấu hình quản trị viên lưu trong DB (bảng admin_api_configs, mã hóa Fernet).

Giá trị trong DB được ưu tiên hơn backend/.env. Đọc cả bảng một lần rồi giữ trong bộ nhớ vài giây
để không mở DB và giải mã ở mỗi lần gọi config; tiến trình khác (worker Celery) thấy thay đổi sau
tối đa CACHE_TTL_SEC giây.
"""
import logging
import sqlite3
import threading
import time

log = logging.getLogger(__name__)

CACHE_TTL_SEC = 5.0

_lock = threading.Lock()
_cache = {"at": 0.0, "db": None, "values": {}}
_warned: set = set()


def _load(db_path: str) -> dict:
    from backend import crypto_utils

    try:
        conn = sqlite3.connect(db_path, timeout=2)
        try:
            rows = conn.execute("SELECT key, value_enc FROM admin_api_configs").fetchall()
        finally:
            conn.close()
    except sqlite3.Error:
        return {}  # bảng chưa được tạo (trước init_db)

    values = {}
    for key, enc in rows:
        try:
            value = crypto_utils.decrypt(enc).strip()
        except crypto_utils.SecretKeyMissing:
            if key not in _warned:
                _warned.add(key)
                log.warning("Không giải mã được cấu hình %s (APP_SECRET_KEY thiếu hoặc đã đổi), dùng giá trị trong .env", key)
            continue
        if value:
            values[key] = value
    return values


def get(name: str) -> str:
    """Giá trị quản trị viên đã lưu, hoặc "" nếu chưa lưu."""
    from backend import config

    db = config.db_path()
    now = time.monotonic()
    with _lock:
        if _cache["db"] != db or now - _cache["at"] > CACHE_TTL_SEC:
            _cache.update(db=db, at=now, values=_load(db))
        return _cache["values"].get(name, "")


def invalidate() -> None:
    with _lock:
        _cache["at"] = 0.0
