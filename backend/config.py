"""Cấu hình tập trung, đọc từ biến môi trường (và file backend/.env nếu có).

Các giá trị được đọc lại mỗi lần gọi để test có thể đổi env mà không phải reload module.
"""
import os

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(BACKEND_DIR)
SAMPLES_DIR = os.path.join(BACKEND_DIR, "samples")

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(BACKEND_DIR, ".env"))
except ImportError:  # python-dotenv là tùy chọn
    pass


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    return _env(name, "1" if default else "0").lower() in ("1", "true", "yes", "on")


def db_path() -> str:
    return _env("AURA_DB_PATH", os.path.join(BACKEND_DIR, "fashion_ai.db"))


def media_dir() -> str:
    path = os.path.abspath(_env("AURA_MEDIA_DIR", os.path.join(BACKEND_DIR, "media")))
    os.makedirs(path, exist_ok=True)
    return path


def allow_demo_user() -> bool:
    """Chỉ bật khi phát triển: request không có token sẽ được coi là user demo."""
    return _env_bool("ALLOW_DEMO_USER", False)


def demo_user_token() -> str:
    return _env("DEMO_USER_TOKEN")


def admin_token() -> str:
    return _env("ADMIN_TOKEN")


def cors_origins() -> list:
    raw = _env("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


def rate_limit_per_minute() -> int:
    return _env_int("RATE_LIMIT_PER_MINUTE", 120)


def pipeline_cost_credits() -> int:
    return _env_int("PIPELINE_COST_CREDITS", 30)


def max_upload_bytes() -> int:
    return _env_int("MAX_UPLOAD_MB", 10) * 1024 * 1024


def ffmpeg_bin() -> str:
    return _env("FFMPEG_BIN", "ffmpeg")


def ffmpeg_timeout_sec() -> int:
    return _env_int("FFMPEG_TIMEOUT_SEC", 180)


def max_workers() -> int:
    return max(1, _env_int("PIPELINE_MAX_WORKERS", 2))


def kling_api_key() -> str:
    return _env("KLING_API_KEY")


# Thông tin nhận tiền VietQR (phải trùng với tài khoản thật của shop)
def bank_id() -> str:
    return _env("VIETQR_BANK_ID", "MB")


def bank_account_no() -> str:
    return _env("VIETQR_ACCOUNT_NO")


def bank_account_name() -> str:
    return _env("VIETQR_ACCOUNT_NAME", "AURA FASHION AI")


MIN_DEPOSIT_VND = 10_000
MAX_DEPOSIT_VND = 50_000_000
VND_PER_CREDIT = 100
