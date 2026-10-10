"""Danh mục cấu hình chỉnh được trong trang Admin: nhãn, kiểu, cách kiểm tra, biến .env tương ứng.

Mỗi giá trị lưu trong DB được mã hóa (database.save_admin_api_configs) và ưu tiên hơn backend/.env.
Để trống một ô và lưu = xóa giá trị trong DB, hệ thống quay về dùng .env.
"""
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Callable, Optional

from backend import admin_config, config
from backend.database import save_admin_api_configs


class SettingError(ValueError):
    pass


@dataclass(frozen=True)
class Setting:
    key: str
    provider: str          # nhóm hiển thị: anthropic, fashn, replicate, vietqr, sepay, tiktok, facebook, pricing
    label: str
    kind: str              # secret | text | choice | int | bool
    env: str
    current: Callable[[], object]   # giá trị đang có hiệu lực (Admin > .env > mặc định)
    options: tuple = ()
    minimum: Optional[int] = None
    maximum: Optional[int] = None
    pattern: Optional[str] = None
    default: Optional[int] = None   # giá trị khi cả Admin lẫn .env đều trống (chỉ cho kiểu int)
    hint: str = ""
    placeholder: str = ""
    normalize: Callable[[str], str] = field(default=lambda v: v.strip())


def _upper_ascii(value: str) -> str:
    """Tên chủ tài khoản VietQR: in hoa, không dấu (giống trên app ngân hàng)."""
    value = value.replace("đ", "d").replace("Đ", "D")
    value = "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn")
    return " ".join(value.upper().split())


SETTINGS = (
    Setting("anthropic_enabled", "anthropic", "Bật Claude", "bool", "", config.anthropic_switch,
            hint="Tắt thì viết kịch bản bằng mẫu câu, không tốn phí AI"),
    Setting("anthropic_api_key", "anthropic", "API key", "secret", "ANTHROPIC_API_KEY", config.anthropic_api_key,
            placeholder="sk-ant-api03-...", hint="Lấy tại platform.claude.com"),
    Setting("anthropic_model", "anthropic", "Model", "choice", "ANTHROPIC_MODEL", config.anthropic_model,
            options=config.ANTHROPIC_MODELS, hint="Opus chất lượng cao nhất; Sonnet rẻ bằng một nửa"),
    Setting("fashn_enabled", "fashn", "Bật FASHN", "bool", "", config.fashn_switch,
            hint="Tắt thì chỉ đặt sản phẩm lên phông nền, không có người mẫu mặc đồ"),
    Setting("fashn_api_key", "fashn", "API key", "secret", "FASHN_API_KEY", config.fashn_api_key,
            placeholder="fa-...", hint="Lấy tại app.fashn.ai"),
    Setting("fashn_mode", "fashn", "Chế độ", "choice", "FASHN_MODE", config.fashn_mode,
            options=("performance", "balanced", "quality"), hint="performance nhanh, quality nét nhất"),
    Setting("fashn_model_name", "fashn", "Model", "text", "FASHN_MODEL_NAME", config.fashn_model_name,
            pattern=r"[a-z0-9][a-z0-9.\-]{1,39}", placeholder="tryon-v1.6"),
    Setting("replicate_enabled", "replicate", "Bật Replicate (Kling)", "bool", "", config.replicate_switch,
            hint="Tắt thì dùng chuyển động máy quay bằng FFmpeg, không tốn phí"),
    Setting("replicate_api_token", "replicate", "API token", "secret", "REPLICATE_API_TOKEN", config.replicate_api_token,
            placeholder="r8_...", hint="Lấy tại replicate.com/account/api-tokens"),
    Setting("replicate_video_model", "replicate", "Model video", "text", "REPLICATE_VIDEO_MODEL",
            config.replicate_video_model, pattern=r"[a-z0-9][a-z0-9_.\-]*/[a-z0-9][a-z0-9_.\-]*",
            placeholder="kwaivgi/kling-v3-video"),
    Setting("kling_mode", "replicate", "Chế độ Kling", "choice", "KLING_MODE", config.kling_mode,
            options=("standard", "pro"), hint="pro nét hơn, giá khoảng gấp đôi"),
    Setting("vietqr_bank_id", "vietqr", "Ngân hàng", "choice", "VIETQR_BANK_ID", config.bank_id,
            options=("MB", "VCB", "TCB", "ACB", "TPB", "VPB", "BIDV", "ICB", "VBA", "STB", "HDB", "OCB", "MSB", "VIB", "SHB"),
            normalize=lambda v: v.strip().upper()),
    Setting("vietqr_account_no", "vietqr", "Số tài khoản nhận tiền", "text", "VIETQR_ACCOUNT_NO", config.bank_account_no,
            pattern=r"\d{6,20}", placeholder="0123456789", normalize=lambda v: re.sub(r"\s", "", v)),
    Setting("vietqr_account_name", "vietqr", "Tên chủ tài khoản", "text", "VIETQR_ACCOUNT_NAME", config.bank_account_name,
            pattern=r"[A-Z0-9 .]{3,50}", placeholder="NGUYEN VAN A", normalize=_upper_ascii,
            hint="In hoa, không dấu, đúng như trên app ngân hàng"),
    Setting("sepay_webhook_key", "sepay", "Webhook API key", "secret", "SEPAY_WEBHOOK_KEY", config.sepay_webhook_key,
            hint="Đặt cùng key này ở my.sepay.vn → Webhooks, kiểu xác thực API Key"),
    Setting("tiktok_client_key", "tiktok", "Client key", "text", "TIKTOK_CLIENT_KEY", config.tiktok_client_key,
            pattern=r"[A-Za-z0-9_\-]{8,64}", hint="developers.tiktok.com → app → Login Kit + Content Posting API"),
    Setting("tiktok_client_secret", "tiktok", "Client secret", "secret", "TIKTOK_CLIENT_SECRET", config.tiktok_client_secret),
    Setting("facebook_app_id", "facebook", "App ID", "text", "FACEBOOK_APP_ID", config.facebook_app_id,
            pattern=r"\d{5,20}", hint="developers.facebook.com → app → Cài đặt → Thông tin cơ bản"),
    Setting("facebook_app_secret", "facebook", "App secret", "secret", "FACEBOOK_APP_SECRET", config.facebook_app_secret),
    Setting("pipeline_cost_credits", "pricing", "Giá mỗi video (credit)", "int", "PIPELINE_COST_CREDITS",
            config.pipeline_cost_credits, minimum=1, maximum=100_000, default=30, hint="1 credit = 100đ"),
    Setting("extra_scene_cost_credits", "pricing", "Pro Studio: phí mỗi cảnh thêm (credit)", "int",
            "EXTRA_SCENE_COST_CREDITS", config.extra_scene_cost_credits, minimum=0, maximum=100_000, default=20,
            hint="Cảnh đầu tiên đã nằm trong giá mỗi video; mỗi cảnh sau là một lần tạo chuyển động AI"),
    Setting("tryon_preview_cost_credits", "pricing", "Phí thử đồ giữ lại khi từ chối (credit)", "int",
            "TRYON_PREVIEW_COST_CREDITS", config.tryon_preview_cost_credits, minimum=0, maximum=100_000, default=5,
            hint="Không lớn hơn giá mỗi video"),
    Setting("private_models_limit", "pricing", "Người mẫu riêng tối đa mỗi shop", "int", "PRIVATE_MODELS_LIMIT",
            config.private_models_limit, minimum=0, maximum=50, default=3,
            hint="Mức chung khi chưa mua gói (gói tháng có thể cho nhiều hơn); 0 = tắt tính năng"),
    Setting("signup_bonus_credits", "pricing", "Credit tặng khi đăng ký", "int", "SIGNUP_BONUS_CREDITS",
            config.signup_bonus_credits, minimum=0, maximum=10_000, default=0,
            hint="Chưa có xác minh email nên để 0 nếu sợ bị tạo tài khoản ảo"),
    Setting("allow_signup", "other", "Cho phép tự đăng ký tài khoản", "bool", "ALLOW_SIGNUP", config.allow_signup,
            hint="Tắt thì chỉ quản trị viên tạo được tài khoản (python -m backend.manage create-user)"),
    Setting("support_hotline", "support", "Hotline", "text", "SUPPORT_HOTLINE", config.support_hotline,
            pattern=r"[0-9+ .]{8,20}", placeholder="0901 234 567"),
    Setting("support_zalo", "support", "Zalo", "text", "SUPPORT_ZALO", config.support_zalo,
            pattern=r"https://zalo\.me/[\w./-]+|[0-9+ .]{8,20}", placeholder="https://zalo.me/0901234567",
            hint="Số điện thoại hoặc link zalo.me"),
    Setting("support_email", "support", "Email hỗ trợ", "text", "SUPPORT_EMAIL", config.support_email,
            pattern=r"[^@\s]+@[^@\s]+\.[^@\s]+", placeholder="hotro@cuaban.vn"),
)
BY_KEY = {s.key: s for s in SETTINGS}


def mask(value: str) -> str:
    """Chỉ để lộ vài ký tự đầu/cuối để nhận ra key nào đang dùng."""
    if not value:
        return ""
    if len(value) <= 12:
        return "•" * 6
    return f"{value[:6]}•••{value[-4:]}"


def secret_key_ready() -> bool:
    return len(config.app_secret_key()) >= 32


def describe() -> list:
    """Danh sách cấu hình cho trang Admin. Key bí mật chỉ trả về dạng đã che."""
    out = []
    for s in SETTINGS:
        value = s.current()
        if admin_config.get(s.key):
            source = "admin"
        elif s.env and config._env(s.env):
            source = "env"
        else:
            source = "default" if value not in ("", None) else "none"
        item = {"key": s.key, "provider": s.provider, "label": s.label, "kind": s.kind, "source": source,
                "configured": value not in ("", None), "hint": s.hint, "placeholder": s.placeholder}
        if s.kind == "secret":
            item["value"] = mask(str(value or ""))
        elif s.kind == "bool":
            item["value"] = bool(value)
            item["configured"] = True
        else:
            item["value"] = value
        if s.options:
            item["options"] = list(s.options)
        if s.minimum is not None:
            item.update(min=s.minimum, max=s.maximum)
        out.append(item)
    return out


def _validate(s: Setting, raw) -> str:
    value = s.normalize(str(raw))
    if s.kind == "bool":
        if str(raw).lower() not in ("1", "0", "true", "false"):
            raise SettingError(f"{s.label}: chọn bật hoặc tắt")
        return "1" if str(raw).lower() in ("1", "true") else "0"
    if s.kind == "int":
        if not re.fullmatch(r"\d+", value):
            raise SettingError(f"{s.label}: phải là số nguyên không âm")
        number = int(value)
        if not s.minimum <= number <= s.maximum:
            raise SettingError(f"{s.label}: phải từ {s.minimum:,} đến {s.maximum:,}".replace(",", "."))
        return str(number)
    if s.kind == "choice" and value not in s.options:
        raise SettingError(f"{s.label}: chọn một trong {', '.join(s.options)}")
    if s.pattern and not re.fullmatch(s.pattern, value):
        raise SettingError(f"{s.label}: giá trị không hợp lệ")
    if len(value) > 500:
        raise SettingError(f"{s.label}: quá dài")
    return value


def update(changes: dict) -> list:
    """Kiểm tra rồi lưu các ô đã sửa. None hoặc "" = xóa giá trị trong Admin, dùng lại .env."""
    unknown = [k for k in changes if k not in BY_KEY]
    if unknown:
        raise SettingError(f"Không có mục cấu hình: {', '.join(unknown)}")
    cleaned = {}
    for key, raw in changes.items():
        s = BY_KEY[key]
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            cleaned[key] = None
        elif isinstance(raw, bool) and s.kind != "bool":
            raise SettingError(f"{s.label}: giá trị không hợp lệ")
        elif s.kind == "secret" and "•" in str(raw):
            continue  # ô key bí mật chưa sửa (vẫn là bản đã che)
        else:
            cleaned[key] = _validate(s, raw)

    # Phí thử đồ không được lớn hơn giá video (tính theo giá trị sẽ có hiệu lực sau khi lưu)
    def effective(key):
        s = BY_KEY[key]
        if key not in cleaned:
            return int(s.current())
        return int(cleaned[key]) if cleaned[key] is not None else config._env_int(s.env, s.default)
    if {"pipeline_cost_credits", "tryon_preview_cost_credits"} & cleaned.keys():
        if effective("tryon_preview_cost_credits") > effective("pipeline_cost_credits"):
            raise SettingError("Phí thử đồ giữ lại không được lớn hơn giá mỗi video")

    if cleaned:
        save_admin_api_configs(cleaned)
    return sorted(cleaned)
