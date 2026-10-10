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


def _admin(name: str) -> str:
    """Giá trị quản trị viên đã lưu trong trang Admin (ưu tiên hơn backend/.env)."""
    from backend import admin_config

    return admin_config.get(name)


def _admin_flag(name: str, default: bool = True) -> bool:
    raw = _admin(name)
    return default if raw == "" else raw == "1"


def _admin_int(name: str, env_name: str, default: int) -> int:
    raw = _admin(name)
    return int(raw) if raw.isdigit() else _env_int(env_name, default)


def rate_limit_per_minute() -> int:
    return _env_int("RATE_LIMIT_PER_MINUTE", 120)


def pipeline_cost_credits() -> int:
    return _admin_int("pipeline_cost_credits", "PIPELINE_COST_CREDITS", 30)


def max_upload_bytes() -> int:
    return _env_int("MAX_UPLOAD_MB", 10) * 1024 * 1024


def ffmpeg_bin() -> str:
    env_bin = _env("FFMPEG_BIN")
    if env_bin:
        return env_bin
    for candidate in ("/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg", "/usr/local/opt/ffmpeg-full/bin/ffmpeg"):
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return "ffmpeg"


def ffmpeg_timeout_sec() -> int:
    return _env_int("FFMPEG_TIMEOUT_SEC", 180)


def max_workers() -> int:
    return max(1, _env_int("PIPELINE_MAX_WORKERS", 2))


def queue_backend() -> str:
    """'thread' (mặc định): job chạy bằng luồng ngay trong tiến trình web.
    'celery': job được gửi qua Redis cho worker Celery chạy riêng (backend/worker.py)."""
    value = _env("QUEUE_BACKEND", "thread").lower()
    return value if value in ("thread", "celery") else "thread"


def redis_url() -> str:
    return _env("REDIS_URL", "redis://localhost:6379/0")


def stale_job_minutes() -> int:
    """Chế độ celery: job "đang xử lý" quá lâu (worker mất, Redis mất dữ liệu) thì coi là lỗi và hoàn credit."""
    return max(10, _env_int("STALE_JOB_MINUTES", 120))


# --- Nhà cung cấp AI (để trống = dùng engine tạm, không tốn phí) ---
# Model chọn được trong trang Admin (đều hỗ trợ effort, structured output và fallbacks="default")
ANTHROPIC_MODELS = ("claude-opus-5-5", "claude-sonnet-5-5")


def anthropic_api_key() -> str:
    """Key nhập trong trang Admin, nếu không có thì ANTHROPIC_API_KEY trong .env."""
    return _admin("anthropic_api_key") or _env("ANTHROPIC_API_KEY")


def anthropic_switch() -> bool:
    """Công tắc bật/tắt Claude trong trang Admin (mặc định bật)."""
    return _admin_flag("anthropic_enabled")


def anthropic_enabled() -> bool:
    """Công tắc bật và có key, hoặc ANTHROPIC_AUTH_TOKEN mà SDK tự đọc từ môi trường."""
    return anthropic_switch() and bool(anthropic_api_key() or _env("ANTHROPIC_AUTH_TOKEN"))


def anthropic_model() -> str:
    chosen = _admin("anthropic_model")
    return chosen if chosen in ANTHROPIC_MODELS else _env("ANTHROPIC_MODEL", "claude-opus-5-5")


def fashn_api_key() -> str:
    return _admin("fashn_api_key") or _env("FASHN_API_KEY")


def fashn_switch() -> bool:
    return _admin_flag("fashn_enabled")


def fashn_active() -> bool:
    """Dùng FASHN thật: công tắc bật và có key. Tắt thì dùng engine tạm dù vẫn còn key."""
    return fashn_switch() and bool(fashn_api_key())


def fashn_model_name() -> str:
    return _admin("fashn_model_name") or _env("FASHN_MODEL_NAME", "tryon-v1.6")


def fashn_mode() -> str:
    return _admin("fashn_mode") or _env("FASHN_MODE", "balanced")


def replicate_api_token() -> str:
    return _admin("replicate_api_token") or _env("REPLICATE_API_TOKEN")


def replicate_switch() -> bool:
    return _admin_flag("replicate_enabled")


def replicate_active() -> bool:
    return replicate_switch() and bool(replicate_api_token())


def replicate_video_model() -> str:
    return _admin("replicate_video_model") or _env("REPLICATE_VIDEO_MODEL", "kwaivgi/kling-v3-video")


def kling_mode() -> str:
    return _admin("kling_mode") or _env("KLING_MODE", "standard")


def ai_timeout_sec() -> int:
    return _env_int("AI_TIMEOUT_SEC", 600)


def public_base_url() -> str:
    """Địa chỉ công khai của server (vd https://app.example.com) để AI tải ảnh trực tiếp."""
    return _env("PUBLIC_BASE_URL")


def tryon_preview_cost_credits() -> int:
    """Phần credit không hoàn lại khi khách từ chối ảnh thử đồ (đã tốn phí thử đồ)."""
    return _admin_int("tryon_preview_cost_credits", "TRYON_PREVIEW_COST_CREDITS", 5)


# --- Tài khoản & bảo mật ---
def app_secret_key() -> str:
    """Khóa bí mật để mã hóa token mạng xã hội và ký OAuth state. Bắt buộc khi kết nối TikTok/Facebook."""
    return _env("APP_SECRET_KEY")


def session_days() -> int:
    return _env_int("SESSION_DAYS", 30)


def signup_bonus_credits() -> int:
    return _admin_int("signup_bonus_credits", "SIGNUP_BONUS_CREDITS", 0)


def allow_signup() -> bool:
    raw = _admin("allow_signup")
    return raw == "1" if raw else _env_bool("ALLOW_SIGNUP", True)


# --- Liên hệ hỗ trợ (hiện ở trang Hỗ trợ) ---
def support_hotline() -> str:
    return _admin("support_hotline") or _env("SUPPORT_HOTLINE")


def support_zalo() -> str:
    return _admin("support_zalo") or _env("SUPPORT_ZALO")


def support_email() -> str:
    return _admin("support_email") or _env("SUPPORT_EMAIL")


def frontend_url() -> str:
    """Nơi chuyển người dùng về sau khi kết nối TikTok/Facebook."""
    return _env("FRONTEND_URL", "http://localhost:5173").rstrip("/")


# --- Webhook ngân hàng (SePay) ---
def sepay_webhook_key() -> str:
    return _admin("sepay_webhook_key") or _env("SEPAY_WEBHOOK_KEY")


# --- Đăng video lên mạng xã hội ---
def tiktok_client_key() -> str:
    return _admin("tiktok_client_key") or _env("TIKTOK_CLIENT_KEY")


def tiktok_client_secret() -> str:
    return _admin("tiktok_client_secret") or _env("TIKTOK_CLIENT_SECRET")


def tiktok_label_aigc() -> bool:
    """Gắn nhãn 'Nội dung do AI tạo' (trường is_aigc) khi đăng TikTok."""
    return _env_bool("TIKTOK_LABEL_AIGC", True)


def facebook_app_id() -> str:
    return _admin("facebook_app_id") or _env("FACEBOOK_APP_ID")


def facebook_app_secret() -> str:
    return _admin("facebook_app_secret") or _env("FACEBOOK_APP_SECRET")


def facebook_graph_version() -> str:
    return _env("FACEBOOK_GRAPH_VERSION", "v23.0")


def oauth_redirect_uri(platform: str) -> str:
    base = public_base_url() or "http://localhost:3456"
    return f"{base.rstrip('/')}/api/social/{platform}/callback"


# Thông tin nhận tiền VietQR (phải trùng với tài khoản thật của shop)
def bank_id() -> str:
    return _admin("vietqr_bank_id") or _env("VIETQR_BANK_ID", "MB")


def bank_account_no() -> str:
    return _admin("vietqr_account_no") or _env("VIETQR_ACCOUNT_NO")


def bank_account_name() -> str:
    return _admin("vietqr_account_name") or _env("VIETQR_ACCOUNT_NAME", "AURA FASHION AI")


MIN_DEPOSIT_VND = 10_000
MAX_DEPOSIT_VND = 50_000_000
VND_PER_CREDIT = 100
