"""Quản trị: người mẫu AI, cấu hình hệ thống, kiểm tra sức khỏe máy chủ"""

import os
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend import config
from backend.ai import motion as motion_engine, script as script_engine, segmentation as seg_engine, vton as vton_engine
from backend.auth import require_admin_role
from backend.database import (
    add_brand_avatar_entry, get_brand_avatars_list, get_db, get_system_settings, save_system_settings, set_default_brand_avatar,
)
from backend.ffmpeg_utils import ffmpeg_available
from backend.media_paths import media_url, resolve_media_ref

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
