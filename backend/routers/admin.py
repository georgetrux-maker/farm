"""Quản trị: người mẫu AI, cấu hình hệ thống, kiểm tra sức khỏe máy chủ"""

import logging
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Dict, Literal, Optional, Union

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field, StrictBool, StrictInt

from backend import config
from backend.ai import motion as motion_engine, script as script_engine, segmentation as seg_engine, vton as vton_engine
from backend.auth import require_admin_role
from backend.database import (
    add_brand_avatar_entry, get_brand_avatars_list, get_db, get_system_settings, save_system_settings,
    set_default_brand_avatar, update_brand_avatar,
)
from backend.ffmpeg_utils import ffmpeg_available, ffmpeg_has_filter
from backend.media_paths import media_url, resolve_media_ref
from backend.services import admin_settings, audit, provider_check, task_queue
from backend.services.wallet import cancel_deposit, verify_and_credit_transaction

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
    gender: Literal["female", "male"] = "female"


@router.post("/api/avatars")
def api_add_avatar(req: AddAvatarRequest, user: dict = Depends(require_admin_role)):
    url = _avatar_image_url(req.avatar_url)
    res = add_brand_avatar_entry(
        name=req.name, style=req.style, height=req.height, weight=req.weight,
        measurements=req.measurements, avatar_url=url, badge=req.badge or "Tùy Chỉnh", gender=req.gender,
    )
    audit.record(user, "avatar.create", res["id"], req.name)
    return res


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
    gender: Optional[Literal["female", "male"]] = None


@router.patch("/api/avatars/{avatar_id}")
def api_update_avatar(avatar_id: str, req: UpdateAvatarRequest, user: dict = Depends(require_admin_role)):
    """Đổi ảnh hoặc thông tin người mẫu AI"""
    fields = req.model_dump(exclude_none=True)
    if "avatar_url" in fields:
        fields["avatar_url"] = _avatar_image_url(fields["avatar_url"])
    res = update_brand_avatar(avatar_id, **fields)
    if res is None:
        raise HTTPException(status_code=404, detail="Người mẫu không tồn tại")
    audit.record(user, "avatar.update", avatar_id, ", ".join(sorted(fields)))
    return res


class SetDefaultAvatarRequest(BaseModel):
    avatar_id: str


@router.post("/api/avatars/set-default")
def api_set_default_avatar(req: SetDefaultAvatarRequest, user: dict = Depends(require_admin_role)):
    res = set_default_brand_avatar(req.avatar_id)
    if res is None:
        raise HTTPException(status_code=404, detail="Người mẫu không tồn tại")
    audit.record(user, "avatar.default", req.avatar_id)
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
def api_save_admin_api_keys(req: Dict[str, Union[StrictBool, StrictInt, str, None]] = Body(...),
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
    if saved:
        audit.record(user, "settings.update", detail=", ".join(saved))
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


def _utc(local: datetime) -> str:
    return (local - VN_TZ).strftime("%Y-%m-%d %H:%M:%S")


def _period_starts(now_utc: datetime = None) -> dict:
    """Mốc đầu ngày / tuần (thứ Hai) / tháng theo giờ Việt Nam, đổi về UTC để so với CURRENT_TIMESTAMP."""
    local = (now_utc or datetime.now(timezone.utc).replace(tzinfo=None)) + VN_TZ
    day = local.replace(hour=0, minute=0, second=0, microsecond=0)
    starts = {"today": day, "week": day - timedelta(days=day.weekday()), "month": day.replace(day=1)}
    return {k: _utc(v) for k, v in starts.items()}


def _compare_windows(now_utc: datetime = None) -> dict:
    """Khoảng kỳ trước để so sánh công bằng: hôm qua tới cùng giờ, tháng trước tới cùng thời điểm."""
    now = (now_utc or datetime.now(timezone.utc).replace(tzinfo=None)) + VN_TZ
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month = day.replace(day=1)
    prev_month = (month - timedelta(days=1)).replace(day=1)
    return {
        "yesterday": (_utc(day - timedelta(days=1)), _utc(now - timedelta(days=1))),
        "prev_month": (_utc(prev_month), _utc(min(prev_month + (now - month), month))),
    }


def _daily_series(conn, sql: str, time_col: str, days: int, now_utc: datetime = None) -> list:
    """Giá trị theo từng ngày (giờ Việt Nam) trong `days` ngày gần nhất, ngày không có dữ liệu = 0."""
    now = (now_utc or datetime.now(timezone.utc).replace(tzinfo=None)) + VN_TZ
    first = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    rows = conn.execute(f"SELECT date(datetime({time_col}, '+7 hours')) AS d, {sql} AND {time_col} >= ? GROUP BY d",
                        (_utc(first),)).fetchall()
    found = {r[0]: r[1] or 0 for r in rows}
    return [found.get((first + timedelta(days=i)).strftime("%Y-%m-%d"), 0) for i in range(days)]


@router.get("/api/admin/stats-overview")
def api_admin_stats_overview(days: int = Query(7, ge=7, le=30), user: dict = Depends(require_admin_role)):
    starts, windows = _period_starts(), _compare_windows()
    now_local = datetime.now(timezone.utc).replace(tzinfo=None) + VN_TZ
    series_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    paid_at = "COALESCE(confirmed_at, created_at)"
    revenue_sql = "SELECT SUM(amount_vnd) FROM wallet_transactions WHERE transaction_type = 'deposit' AND status = 'success'"
    shops_sql = "SELECT COUNT(*) FROM users WHERE role != 'admin'"
    videos_sql = "SELECT COUNT(*) FROM ai_jobs WHERE status = 'completed'"
    done_at = "COALESCE(completed_at, created_at)"
    conn = get_db()
    try:
        def periods(sql: str, time_col: str) -> dict:
            """Tổng toàn thời gian và từ đầu hôm nay / tuần này / tháng này (giờ Việt Nam)."""
            out = {"total": conn.execute(sql).fetchone()[0] or 0}
            for name, since in starts.items():
                out[name] = conn.execute(f"{sql} AND {time_col} >= ?", (since,)).fetchone()[0] or 0
            return out

        def between(sql: str, time_col: str, window: tuple) -> int:
            return conn.execute(f"{sql} AND {time_col} >= ? AND {time_col} < ?", window).fetchone()[0] or 0

        summary = {
            "revenue_vnd": periods(revenue_sql, paid_at),
            "new_shops": periods(shops_sql, "created_at"),
            "completed_videos": periods(videos_sql, done_at),
            "total_jobs": conn.execute("SELECT COUNT(*) FROM ai_jobs").fetchone()[0],
            "credits_in_wallets": conn.execute("SELECT COALESCE(SUM(credits), 0) FROM users "
                                               "WHERE role != 'admin'").fetchone()[0],
            "pending_deposits": conn.execute("SELECT COUNT(*) FROM wallet_transactions WHERE "
                                             "transaction_type = 'deposit' AND status = 'pending'").fetchone()[0],
        }
        previous = {
            "revenue_today": between(revenue_sql, paid_at, windows["yesterday"]),
            "revenue_month": between(revenue_sql, paid_at, windows["prev_month"]),
            "new_shops_month": between(shops_sql, "created_at", windows["prev_month"]),
            "completed_videos_month": between(videos_sql, done_at, windows["prev_month"]),
        }
        series = {
            "revenue_vnd": _daily_series(conn, "SUM(amount_vnd) FROM wallet_transactions WHERE "
                                               "transaction_type = 'deposit' AND status = 'success'", paid_at, days),
            "completed_videos": _daily_series(conn, "COUNT(*) FROM ai_jobs WHERE status = 'completed'", done_at, days),
        }
        sources = conn.execute(
            "SELECT CASE WHEN confirmed_by = 'sepay' THEN 'sepay' WHEN confirmed_by LIKE 'admin%' THEN 'manual' "
            "ELSE 'other' END AS source, SUM(amount_vnd) FROM wallet_transactions WHERE transaction_type = 'deposit' "
            f"AND status = 'success' AND {paid_at} >= ? GROUP BY source", (_utc(series_start),)).fetchall()
        recent_users = conn.execute("SELECT id, name, email, role, credits, created_at FROM users "
                                    "ORDER BY created_at DESC LIMIT 10").fetchall()
    finally:
        conn.close()
    first_day = series_start.date()
    return {
        "summary": summary,
        "previous": previous,
        "series": {"dates": [(first_day + timedelta(days=i)).isoformat() for i in range(days)], **series},
        # Cùng khoảng ngày với biểu đồ doanh thu
        "revenue_sources": {r[0]: r[1] or 0 for r in sources},
        "recent_users": [dict(r) for r in recent_users],
    }


# ----------------------------------------------------------------- lịch sử nạp tiền & duyệt tay
@router.get("/api/admin/deposits")
def api_admin_deposits(status: Literal["pending", "success", "cancelled", "all"] = "pending",
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
        where.append("(t.description LIKE ? ESCAPE '\\' OR t.id LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' "
                     "OR u.name LIKE ? ESCAPE '\\')")
        args += [like] * 4
    sql_where = " AND ".join(where)
    conn = get_db()
    try:
        counts = dict(conn.execute("SELECT status, COUNT(*) FROM wallet_transactions WHERE transaction_type = 'deposit' "
                                   "GROUP BY status").fetchall())
        counts["all"] = sum(counts.values())
        total = conn.execute(f"SELECT COUNT(*) FROM wallet_transactions t LEFT JOIN users u ON u.id = t.user_id "
                             f"WHERE {sql_where}", args).fetchone()[0]
        rows = conn.execute(
            f"SELECT t.id, t.user_id, u.name AS user_name, u.email AS user_email, t.amount_vnd, t.amount_credits, "
            f"t.description AS transfer_content, t.status, t.created_at, t.confirmed_at, t.confirmed_by "
            f"FROM wallet_transactions t LEFT JOIN users u ON u.id = t.user_id WHERE {sql_where} "
            f"ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
            args + [page_size, (page - 1) * page_size]).fetchall()
    finally:
        conn.close()
    return {"items": [dict(r) for r in rows], "total": total, "page": page, "page_size": page_size,
            "has_more": page * page_size < total, "counts": counts}


@router.post("/api/admin/deposits/{transaction_id}/verify")
def api_admin_verify_deposit(transaction_id: str, user: dict = Depends(require_admin_role)):
    """Duyệt tay khi khách chuyển sai nội dung (sau khi đã kiểm tra sao kê ngân hàng)."""
    res = verify_and_credit_transaction(transaction_id, confirmed_by=f"admin:{user['id']}")
    if res["status"] == "error":
        raise HTTPException(status_code=404, detail=res["message"])
    log.info("Quản trị viên %s duyệt tay giao dịch nạp %s: %s", user["id"], transaction_id, res["status"])
    if res["status"] == "success":
        audit.record(user, "deposit.verify", transaction_id, f"+{res['credits_added']} credit")
    return res


@router.post("/api/admin/deposits/{transaction_id}/cancel")
def api_admin_cancel_deposit(transaction_id: str, user: dict = Depends(require_admin_role)):
    """Hủy lệnh nạp chưa thanh toán (mã QR bỏ dở, nạp nhầm). Tiền về sau đó vẫn duyệt lại được."""
    if not cancel_deposit(transaction_id, user["id"]):
        raise HTTPException(status_code=409, detail="Lệnh nạp không còn ở trạng thái chờ")
    audit.record(user, "deposit.cancel", transaction_id)
    return {"status": "cancelled"}
