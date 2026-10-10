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


def _admin_config(name: str) -> str:
    try:
        import sqlite3
        conn = sqlite3.connect(db_path(), timeout=1)
        row = conn.execute("SELECT value_enc FROM admin_api_configs WHERE key = ?", (name,)).fetchone()
        conn.close()
        if row and row[0]:
            from backend import crypto_utils
            return crypto_utils.decrypt(row[0]).strip()
    except Exception:
        pass
    return ""


def rate_limit_per_minute() -> int:
    return _env_int("RATE_LIMIT_PER_MINUTE", 120)


def pipeline_cost_credits() -> int:
    cfg = _admin_config("pipeline_cost_credits")
    if cfg and cfg.isdigit():
        return int(cfg)
    return _env_int("PIPELINE_COST_CREDITS", 30)


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


# --- Nhà cung cấp AI (để trống = dùng engine tạm, không tốn phí) ---
def anthropic_api_key() -> str:
    return _admin_config("anthropic_api_key") or _env("ANTHROPIC_API_KEY") or _env("ANTHROPIC_AUTH_TOKEN")


def anthropic_enabled() -> bool:
    """SDK Anthropic tự đọc ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN từ môi trường."""
    return bool(anthropic_api_key())


def anthropic_model() -> str:
    return _admin_config("anthropic_model") or _env("ANTHROPIC_MODEL", "claude-opus-5-5")


def fashn_api_key() -> str:
    return _admin_config("fashn_api_key") or _env("FASHN_API_KEY")


def fashn_model_name() -> str:
    return _admin_config("fashn_model_name") or _env("FASHN_MODEL_NAME", "tryon-v1.6")


def fashn_mode() -> str:
    return _admin_config("fashn_mode") or _env("FASHN_MODE", "balanced")


def replicate_api_token() -> str:
    return _admin_config("replicate_api_token") or _env("REPLICATE_API_TOKEN")


def replicate_video_model() -> str:
    return _admin_config("replicate_video_model") or _env("REPLICATE_VIDEO_MODEL", "kwaivgi/kling-v3-video")


def kling_mode() -> str:
    return _admin_config("kling_mode") or _env("KLING_MODE", "standard")


def ai_timeout_sec() -> int:
    return _env_int("AI_TIMEOUT_SEC", 600)



def public_base_url() -> str:
    """Địa chỉ công khai của server (vd https://app.example.com) để AI tải ảnh trực tiếp."""
    return _env("PUBLIC_BASE_URL")


def tryon_preview_cost_credits() -> int:
    """Phần credit không hoàn lại khi khách từ chối ảnh thử đồ (đã tốn phí thử đồ)."""
    cfg = _admin_config("tryon_preview_cost_credits")
    if cfg and cfg.isdigit():
        return int(cfg)
    return _env_int("TRYON_PREVIEW_COST_CREDITS", 5)


# --- Tài khoản & bảo mật ---
def app_secret_key() -> str:
    """Khóa bí mật để mã hóa token mạng xã hội và ký OAuth state. Bắt buộc khi kết nối TikTok/Facebook."""
    return _env("APP_SECRET_KEY")


def session_days() -> int:
    return _env_int("SESSION_DAYS", 30)


def signup_bonus_credits() -> int:
    cfg = _admin_config("signup_bonus_credits")
    if cfg and cfg.isdigit():
        return int(cfg)
    return _env_int("SIGNUP_BONUS_CREDITS", 0)


def allow_signup() -> bool:
    return _env_bool("ALLOW_SIGNUP", True)


def frontend_url() -> str:
    """Nơi chuyển người dùng về sau khi kết nối TikTok/Facebook."""
    return _env("FRONTEND_URL", "http://localhost:5173").rstrip("/")


# --- Webhook ngân hàng (SePay) ---
def sepay_webhook_key() -> str:
    return _admin_config("sepay_webhook_key") or _env("SEPAY_WEBHOOK_KEY")


# --- Đăng video lên mạng xã hội ---
def tiktok_client_key() -> str:
    return _admin_config("tiktok_client_key") or _env("TIKTOK_CLIENT_KEY")


def tiktok_client_secret() -> str:
    return _admin_config("tiktok_client_secret") or _env("TIKTOK_CLIENT_SECRET")


def tiktok_label_aigc() -> bool:
    """Gắn nhãn 'Nội dung do AI tạo' (trường is_aigc) khi đăng TikTok."""
    return _env_bool("TIKTOK_LABEL_AIGC", True)


def facebook_app_id() -> str:
    return _admin_config("facebook_app_id") or _env("FACEBOOK_APP_ID")


def facebook_app_secret() -> str:
    return _admin_config("facebook_app_secret") or _env("FACEBOOK_APP_SECRET")


def facebook_graph_version() -> str:
    return _env("FACEBOOK_GRAPH_VERSION", "v23.0")


def oauth_redirect_uri(platform: str) -> str:
    base = public_base_url() or "http://localhost:3456"
    return f"{base.rstrip('/')}/api/social/{platform}/callback"


# Thông tin nhận tiền VietQR (phải trùng với tài khoản thật của shop)
def bank_id() -> str:
    return _admin_config("vietqr_bank_id") or _env("VIETQR_BANK_ID", "MB")


def bank_account_no() -> str:
    return _admin_config("vietqr_account_no") or _env("VIETQR_ACCOUNT_NO")


def bank_account_name() -> str:
    return _admin_config("vietqr_account_name") or _env("VIETQR_ACCOUNT_NAME", "AURA FASHION AI")



MIN_DEPOSIT_VND = 10_000
MAX_DEPOSIT_VND = 50_000_000
VND_PER_CREDIT = 100
