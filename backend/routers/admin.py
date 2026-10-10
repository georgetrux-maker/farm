"""Quản trị: người mẫu AI, cấu hình hệ thống, kiểm tra sức khỏe máy chủ"""

import logging
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Dict, Literal, Optional, Union

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field, StrictInt

from backend import config
from backend.ai import motion as motion_engine, script as script_engine, segmentation as seg_engine, vton as vton_engine
from backend.auth import require_admin_role
from backend.database import (
    add_brand_avatar_entry, get_brand_avatars_list, get_db, get_system_settings, save_system_settings,
    set_default_brand_avatar, update_brand_avatar,
)
from backend.ffmpeg_utils import ffmpeg_available, ffmpeg_has_filter
from backend.media_paths import media_url, resolve_media_ref
from backend.services import admin_settings, provider_check, task_queue
from backend.services.wallet import verify_and_credit_transaction

log = logging.getLogger("aura")
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
    url = _avatar_image_url(req.avatar_url)
    return add_brand_avatar_entry(
        name=req.name, style=req.style, height=req.height, weight=req.weight,
        measurements=req.measurements, avatar_url=url, badge=req.badge or "Tùy Chỉnh",
    )


def _avatar_image_url(url: str) -> str:
    url = url.strip()
    return url if url.startswith("https://") else media_url(resolve_media_ref(url))


class UpdateAvatarRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    style: Optional[str] = Field(default=None, min_length=1, max_length=120)
    height: Optional[str] = Field(default=None, max_length=20)
    weight: Optional[str] = Field(default=None, max_length=20)
    measurements: Optional[str] = Field(default=None, max_length=40)
    avatar_url: Optional[str] = Field(default=None, max_length=1000, description="URL https hoặc /media/... đã upload")
    badge: Optional[str] = Field(default=None, max_length=40)


@router.patch("/api/avatars/{avatar_id}")
def api_update_avatar(avatar_id: str, req: UpdateAvatarRequest, user: dict = Depends(require_admin_role)):
    """Đổi ảnh hoặc thông tin người mẫu AI"""
    fields = req.model_dump(exclude_none=True)
    if "avatar_url" in fields:
        fields["avatar_url"] = _avatar_image_url(fields["avatar_url"])
    res = update_brand_avatar(avatar_id, **fields)
    if res is None:
        raise HTTPException(status_code=404, detail="Người mẫu không tồn tại")
    return res


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
    if ffmpeg_available():
        has_ass = ffmpeg_has_filter("ass")
        add("Phụ đề in trong video (libass)", "PASSED" if has_ass else "WARNING", "ai/render.py",
            "" if has_ass else "FFmpeg thiếu libass: video vẫn tạo được nhưng không có phụ đề. "
                               "Cài bản ffmpeg đầy đủ (vd brew install ffmpeg-full) rồi khởi động lại")
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


# ----------------------------------------------------------------- cài đặt API & hệ thống
@router.get("/api/admin/api-keys")
def api_get_admin_api_keys(user: dict = Depends(require_admin_role)):
    """Cấu hình đang có hiệu lực. Key bí mật chỉ trả về dạng đã che; source cho biết lấy từ Admin hay .env."""
    return {"secret_key_ready": admin_settings.secret_key_ready(), "settings": admin_settings.describe()}


@router.post("/api/admin/api-keys")
def api_save_admin_api_keys(req: Dict[str, Union[StrictInt, str, None]] = Body(...),
                            user: dict = Depends(require_admin_role)):
    """Chỉ gửi các ô đã sửa. Giá trị rỗng/null = xóa khỏi Admin, quay về dùng backend/.env."""
    if not admin_settings.secret_key_ready():
        raise HTTPException(status_code=400, detail="Chưa đặt APP_SECRET_KEY (ít nhất 32 ký tự) trong backend/.env "
                                                    "nên chưa thể mã hóa và lưu cấu hình. Đặt biến này rồi khởi động lại máy chủ.")
    try:
        saved = admin_settings.update(req)
    except admin_settings.SettingError as e:
        raise HTTPException(status_code=400, detail=str(e))
    log.info("Quản trị viên %s đã đổi cấu hình: %s", user["id"], ", ".join(saved) or "(không có)")
    return {"status": "success", "saved": saved,
            "message": "Đã lưu cấu hình" if saved else "Không có thay đổi nào để lưu",
            "settings": admin_settings.describe()}


class ProviderTestRequest(BaseModel):
    provider: Literal["anthropic", "fashn", "replicate", "sepay", "tiktok", "facebook"]
    values: Dict[str, str] = Field(default_factory=dict, description="Các ô vừa gõ (chưa lưu) để thử trước khi lưu")


@router.post("/api/admin/api-keys/test")
def api_test_admin_api_key(req: ProviderTestRequest, user: dict = Depends(require_admin_role)):
    return provider_check.run(req.provider, req.values)


# ----------------------------------------------------------------- tổng quan doanh thu & người dùng
VN_TZ = timedelta(hours=7)


def _period_starts(now_utc: datetime = None) -> dict:
    """Mốc đầu ngày / tuần (thứ Hai) / tháng theo giờ Việt Nam, đổi về UTC để so với CURRENT_TIMESTAMP."""
    local = (now_utc or datetime.now(timezone.utc).replace(tzinfo=None)) + VN_TZ
    day = local.replace(hour=0, minute=0, second=0, microsecond=0)
    starts = {"today": day, "week": day - timedelta(days=day.weekday()), "month": day.replace(day=1)}
    return {k: (v - VN_TZ).strftime("%Y-%m-%d %H:%M:%S") for k, v in starts.items()}


@router.get("/api/admin/stats-overview")
def api_admin_stats_overview(user: dict = Depends(require_admin_role)):
    starts = _period_starts()
    conn = get_db()
    try:
        def periods(sql: str, time_col: str) -> dict:
            """Tổng toàn thời gian và từ đầu hôm nay / tuần này / tháng này (giờ Việt Nam)."""
            out = {"total": conn.execute(sql).fetchone()[0] or 0}
            for name, since in starts.items():
                out[name] = conn.execute(f"{sql} AND {time_col} >= ?", (since,)).fetchone()[0] or 0
            return out

        revenue = periods("SELECT SUM(amount_vnd) FROM wallet_transactions WHERE transaction_type = 'deposit' "
                          "AND status = 'success'", "COALESCE(confirmed_at, created_at)")
        shops = periods("SELECT COUNT(*) FROM users WHERE role != 'admin'", "created_at")
        videos = periods("SELECT COUNT(*) FROM ai_jobs WHERE status = 'completed'", "COALESCE(completed_at, created_at)")
        summary = {
            "revenue_vnd": revenue, "new_shops": shops, "completed_videos": videos,
            "total_jobs": conn.execute("SELECT COUNT(*) FROM ai_jobs").fetchone()[0],
            "credits_in_wallets": conn.execute("SELECT COALESCE(SUM(credits), 0) FROM users "
                                               "WHERE role != 'admin'").fetchone()[0],
            "pending_deposits": conn.execute("SELECT COUNT(*) FROM wallet_transactions WHERE "
                                             "transaction_type = 'deposit' AND status = 'pending'").fetchone()[0],
        }
        recent_users = conn.execute("SELECT id, name, email, role, credits, created_at FROM users "
                                    "ORDER BY created_at DESC LIMIT 10").fetchall()
    finally:
        conn.close()
    return {"summary": summary, "recent_users": [dict(r) for r in recent_users]}


# ----------------------------------------------------------------- lịch sử nạp tiền & duyệt tay
@router.get("/api/admin/deposits")
def api_admin_deposits(status: Literal["pending", "success", "all"] = "pending",
                       q: Optional[str] = Query(None, max_length=100, description="Tìm theo mã nạp, tên hoặc email"),
                       page: int = Query(1, ge=1, le=10_000), page_size: int = Query(20, ge=1, le=100),
                       user: dict = Depends(require_admin_role)):
    """Chỉ các lệnh nạp tiền (không lẫn giao dịch trừ/hoàn credit khi tạo video)."""
    where, args = ["t.transaction_type = 'deposit'"], []
    if status != "all":
        where.append("t.status = ?")
        args.append(status)
    if q and q.strip():
        like = "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append("(t.qr_code_ref LIKE ? ESCAPE '\\' OR t.id LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' "
                     "OR u.name LIKE ? ESCAPE '\\')")
        args += [like] * 4
    sql_where = " AND ".join(where)
    conn = get_db()
    try:
        total = conn.execute(f"SELECT COUNT(*) FROM wallet_transactions t LEFT JOIN users u ON u.id = t.user_id "
                             f"WHERE {sql_where}", args).fetchone()[0]
        rows = conn.execute(
            f"SELECT t.id, t.user_id, u.name AS user_name, u.email AS user_email, t.amount_vnd, t.amount_credits, "
            f"t.qr_code_ref, t.status, t.created_at, t.confirmed_at, t.confirmed_by "
            f"FROM wallet_transactions t LEFT JOIN users u ON u.id = t.user_id WHERE {sql_where} "
            f"ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
            args + [page_size, (page - 1) * page_size]).fetchall()
    finally:
        conn.close()
    return {"items": [dict(r) for r in rows], "total": total, "page": page, "page_size": page_size,
            "has_more": page * page_size < total}


@router.post("/api/admin/deposits/{transaction_id}/verify")
def api_admin_verify_deposit(transaction_id: str, user: dict = Depends(require_admin_role)):
    """Duyệt tay khi khách chuyển sai nội dung (sau khi đã kiểm tra sao kê ngân hàng)."""
    res = verify_and_credit_transaction(transaction_id, confirmed_by=f"admin:{user['id']}")
    if res["status"] == "error":
        raise HTTPException(status_code=404, detail=res["message"])
    log.info("Quản trị viên %s duyệt tay giao dịch nạp %s: %s", user["id"], transaction_id, res["status"])
    return res
