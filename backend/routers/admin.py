"""Quản trị: người mẫu AI, cấu hình hệ thống, kiểm tra sức khỏe máy chủ"""

import os
import sqlite3
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend import config
from backend.ai import motion as motion_engine, script as script_engine, segmentation as seg_engine, vton as vton_engine
from backend.auth import require_admin_role
from backend.database import (
    add_brand_avatar_entry, get_brand_avatars_list, get_db, get_system_settings, save_admin_api_config, save_system_settings,
    set_default_brand_avatar,
)
from backend.ffmpeg_utils import ffmpeg_available
from backend.media_paths import media_url, resolve_media_ref
from backend.services import task_queue

router = APIRouter()


@router.get("/api/avatars")
def api_get_avatars():
    """Task 14: Kho người mẫu AI"""
    return get_brand_avatars_list()


class AddAvatarRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    style: str = Field(min_length=1, max_length=120)
    height: str = Field(max_length=20)
    weight: str = Field(max_length=20)
    measurements: str = Field(max_length=40)
    avatar_url: str = Field(max_length=1000, description="URL https hoặc /media/... (ảnh toàn thân đã upload)")
    badge: Optional[str] = Field(default="Tùy Chỉnh", max_length=40)


@router.post("/api/avatars")
def api_add_avatar(req: AddAvatarRequest, user: dict = Depends(require_admin_role)):
    url = req.avatar_url.strip()
    if not url.startswith("https://"):
        url = media_url(resolve_media_ref(url))
    return add_brand_avatar_entry(
        name=req.name, style=req.style, height=req.height, weight=req.weight,
        measurements=req.measurements, avatar_url=url, badge=req.badge or "Tùy Chỉnh",
    )


class SetDefaultAvatarRequest(BaseModel):
    avatar_id: str


@router.post("/api/avatars/set-default")
def api_set_default_avatar(req: SetDefaultAvatarRequest, user: dict = Depends(require_admin_role)):
    res = set_default_brand_avatar(req.avatar_id)
    if res is None:
        raise HTTPException(status_code=404, detail="Người mẫu không tồn tại")
    return res


@router.get("/api/settings")
def api_get_settings(user: dict = Depends(require_admin_role)):
    """Cấu hình hệ thống (API key không lưu ở đây mà trong backend/.env)"""
    return get_system_settings()


@router.post("/api/settings")
def api_save_settings(req: dict, user: dict = Depends(require_admin_role)):
    return save_system_settings(req)


def _health_report() -> list:
    checks = []

    def add(name, status, module, note=""):
        checks.append({"task": len(checks) + 1, "name": name, "status": status, "module": module, "note": note})

    try:
        get_db().execute("SELECT 1").fetchone()
        add("Cơ sở dữ liệu", "PASSED", "database.py")
    except sqlite3.Error as e:
        add("Cơ sở dữ liệu", "FAILED", "database.py", str(e))
    add("FFmpeg", "PASSED" if ffmpeg_available() else "FAILED", "ffmpeg_utils.py",
        "" if ffmpeg_available() else "Chưa cài ffmpeg, không tạo được video")
    try:
        import edge_tts  # noqa: F401
        add("Lồng tiếng edge-tts", "PASSED", "ai/tts.py", "Cần internet để gọi dịch vụ")
    except ImportError:
        add("Lồng tiếng edge-tts", "WARNING", "ai/tts.py", "Chưa cài edge-tts, sẽ dùng phương án dự phòng")
    queue_status, queue_note = task_queue.health()
    add("Hàng đợi tạo video", queue_status, "services/task_queue.py", queue_note)
    media_ok = os.access(config.media_dir(), os.W_OK)
    add("Thư mục media", "PASSED" if media_ok else "FAILED", config.media_dir())
    add("Tài khoản nhận tiền VietQR", "PASSED" if config.bank_account_no() else "WARNING", "services/wallet.py",
        "" if config.bank_account_no() else "Chưa đặt VIETQR_ACCOUNT_NO")
    for name, module, engine, how in (
        ("Phân tích ảnh & viết kịch bản (Claude)", "ai/claude_client.py", script_engine.engine_name(),
         "đặt ANTHROPIC_API_KEY"),
        ("Tách nền trang phục", "ai/segmentation.py", seg_engine.engine_name(),
         "cài backend/requirements-ai.txt"),
        ("Thử đồ lên người mẫu (FASHN)", "ai/vton.py", vton_engine.engine_name(), "đặt FASHN_API_KEY"),
        ("Tạo video AI (Kling qua Replicate)", "ai/motion.py", motion_engine.engine_name(),
         "đặt REPLICATE_API_TOKEN"),
    ):
        real = not engine.startswith(("placeholder", "template"))
        add(name, "PASSED" if real else "WARNING", module,
            f"Đang dùng: {engine}" if real else f"Đang dùng engine tạm '{engine}'; để dùng AI thật: {how}")
    return checks


@router.get("/api/health")
def api_health():
    return {"status": "ok"}


@router.get("/api/system/audit-25-tasks")
def api_system_audit(user: dict = Depends(require_admin_role)):
    """Tình trạng cấu hình máy chủ: chỉ quản trị viên xem được"""
    report = _health_report()
    passed = sum(1 for r in report if r["status"] == "PASSED")
    failed = any(r["status"] == "FAILED" for r in report)
    return {
        "status": "DEGRADED" if failed else ("OK_WITH_WARNINGS" if passed < len(report) else "ALL_SYSTEMS_OPERATIONAL"),
        "passed_tasks": passed,
        "total_tasks": len(report),
        "accuracy_rate": f"{round(passed * 100 / len(report))}%",
        "report": report,
    }


def mask_key(val: str) -> str:
    if not val:
        return ""
    if len(val) <= 8:
        return "***"
    return f"{val[:6]}***{val[-4:]}"


@router.get("/api/admin/api-keys")
def api_get_admin_api_keys(user: dict = Depends(require_admin_role)):
    return {
        "anthropic": {
            "is_configured": bool(config.anthropic_api_key()),
            "masked_key": mask_key(config.anthropic_api_key()),
            "model": config.anthropic_model(),
        },
        "fashn": {
            "is_configured": bool(config.fashn_api_key()),
            "masked_key": mask_key(config.fashn_api_key()),
            "model_name": config.fashn_model_name(),
            "mode": config.fashn_mode(),
        },
        "replicate": {
            "is_configured": bool(config.replicate_api_token()),
            "masked_key": mask_key(config.replicate_api_token()),
            "video_model": config.replicate_video_model(),
            "kling_mode": config.kling_mode(),
        },
        "vietqr": {
            "bank_id": config.bank_id(),
            "account_no": config.bank_account_no(),
            "account_name": config.bank_account_name(),
            "is_configured": bool(config.bank_account_no()),
        },
        "sepay": {
            "is_configured": bool(config.sepay_webhook_key()),
            "masked_key": mask_key(config.sepay_webhook_key()),
        },
        "tiktok": {
            "is_configured": bool(config.tiktok_client_key()),
            "client_key": mask_key(config.tiktok_client_key()),
            "has_secret": bool(config.tiktok_client_secret()),
        },
        "facebook": {
            "is_configured": bool(config.facebook_app_id()),
            "app_id": mask_key(config.facebook_app_id()),
            "has_secret": bool(config.facebook_app_secret()),
        },
        "pricing": {
            "pipeline_cost_credits": config.pipeline_cost_credits(),
            "tryon_preview_cost_credits": config.tryon_preview_cost_credits(),
            "signup_bonus_credits": config.signup_bonus_credits(),
        }
    }


@router.post("/api/admin/api-keys")
def api_save_admin_api_keys(req: dict, user: dict = Depends(require_admin_role)):
    for k, v in req.items():
        if v is not None:
            if isinstance(v, str) and "***" in v:
                continue
            save_admin_api_config(k, str(v).strip())
    return {"status": "success", "message": "Đã lưu cấu hình API thành công"}


@router.post("/api/admin/api-keys/test")
def api_test_admin_api_key(req: dict, user: dict = Depends(require_admin_role)):
    provider = req.get("provider", "").lower()
    if provider == "anthropic":
        key = config.anthropic_api_key()
        if not key:
            return {"ok": False, "message": "Chưa điền Anthropic API Key"}
        try:
            import anthropic
            c = anthropic.Anthropic(api_key=key, timeout=8.0)
            c.models.list(limit=1)
            return {"ok": True, "message": "Kết nối Claude Anthropic thành công!"}
        except Exception as e:
            return {"ok": False, "message": f"Lỗi Anthropic: {str(e)[:150]}"}
    elif provider == "fashn":
        key = config.fashn_api_key()
        if not key:
            return {"ok": False, "message": "Chưa điền FASHN API Key"}
        try:
            res = httpx.get("https://api.fashn.ai/v1/models", headers={"Authorization": f"Bearer {key}"}, timeout=8.0)
            if res.status_code == 200:
                return {"ok": True, "message": "Kết nối FASHN.ai thành công!"}
            return {"ok": False, "message": f"FASHN báo lỗi xác thực (HTTP {res.status_code})"}
        except Exception as e:
            return {"ok": False, "message": f"Không kết nối được FASHN: {str(e)[:150]}"}
    elif provider == "replicate":
        token = config.replicate_api_token()
        if not token:
            return {"ok": False, "message": "Chưa điền Replicate API Token"}
        try:
            res = httpx.get("https://api.replicate.com/v1/account", headers={"Authorization": f"Bearer {token}"}, timeout=8.0)
            if res.status_code == 200:
                user_info = res.json().get("username", "")
                return {"ok": True, "message": f"Kết nối Replicate thành công! Tài khoản: {user_info}"}
            return {"ok": False, "message": f"Replicate báo lỗi token (HTTP {res.status_code})"}
        except Exception as e:
            return {"ok": False, "message": f"Không kết nối được Replicate: {str(e)[:150]}"}
    elif provider == "sepay":
        key = config.sepay_webhook_key()
        if not key:
            return {"ok": False, "message": "Chưa điền SePay Webhook Key"}
        return {"ok": True, "message": "SePay Webhook Key sẵn sàng"}
    return {"ok": False, "message": f"Nhà cung cấp không xác định: {provider}"}


@router.get("/api/admin/stats-overview")
def api_admin_stats_overview(user: dict = Depends(require_admin_role)):
    conn = get_db()
    total_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    total_credits = conn.execute("SELECT SUM(credits) FROM users").fetchone()[0] or 0
    total_revenue_vnd = conn.execute(
        "SELECT SUM(amount_vnd) FROM wallet_transactions WHERE status = 'success' AND transaction_type = 'deposit'"
    ).fetchone()[0] or 0

    total_jobs = conn.execute("SELECT COUNT(*) FROM ai_jobs").fetchone()[0]
    completed_jobs = conn.execute("SELECT COUNT(*) FROM ai_jobs WHERE status = 'completed'").fetchone()[0]

    recent_users = conn.execute("SELECT id, name, email, role, credits, created_at FROM users ORDER BY created_at DESC LIMIT 10").fetchall()
    recent_transactions = conn.execute(
        "SELECT t.*, u.name as user_name, u.email as user_email FROM wallet_transactions t "
        "LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT 20"
    ).fetchall()
    conn.close()

    return {
        "summary": {
            "total_users": total_users,
            "total_credits_in_circulation": total_credits,
            "total_revenue_vnd": total_revenue_vnd,
            "total_jobs": total_jobs,
            "completed_jobs": completed_jobs,
        },
        "recent_users": [dict(r) for r in recent_users],
        "recent_transactions": [dict(r) for r in recent_transactions],
    }
