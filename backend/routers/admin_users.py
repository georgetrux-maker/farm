"""Quản trị: người dùng (tìm, cộng/trừ credit, khóa) và nhật ký hệ thống"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.auth import require_admin_role
from backend.database import get_db, get_user
from backend.services import audit
from backend.services.wallet import WalletError, adjust_credits

router = APIRouter()


def _like(q: str) -> str:
    return "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


@router.get("/api/admin/users")
def api_admin_users(q: Optional[str] = Query(None, max_length=100, description="Tìm theo tên hoặc email"),
                    role: Literal["all", "shop", "admin"] = "all",
                    status: Literal["all", "active", "locked"] = "all",
                    page: int = Query(1, ge=1, le=10_000), page_size: int = Query(20, ge=1, le=100),
                    user: dict = Depends(require_admin_role)):
    where, args = [], []
    if q and q.strip():
        where.append("(u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')")
        args += [_like(q)] * 2
    if role == "admin":
        where.append("u.role = 'admin'")
    elif role == "shop":
        where.append("u.role != 'admin'")
    filtered = list(where)
    if status != "all":
        filtered.append("COALESCE(u.disabled, 0) = ?")
    sql_where = ("WHERE " + " AND ".join(filtered)) if filtered else ""
    status_args = args + ([1 if status == "locked" else 0] if status != "all" else [])
    base_where = ("WHERE " + " AND ".join(where)) if where else ""
    conn = get_db()
    try:
        counts = conn.execute(f"SELECT COUNT(*), SUM(COALESCE(u.disabled, 0)) FROM users u {base_where}", args).fetchone()
        total = conn.execute(f"SELECT COUNT(*) FROM users u {sql_where}", status_args).fetchone()[0]
        rows = conn.execute(f'''
            SELECT u.id, u.name, u.email, u.role, u.credits, COALESCE(u.disabled, 0) AS disabled, u.created_at,
                   (SELECT COUNT(*) FROM ai_jobs j WHERE j.user_id = u.id AND j.status = 'completed') AS videos,
                   (SELECT COALESCE(SUM(amount_vnd), 0) FROM wallet_transactions t WHERE t.user_id = u.id
                      AND t.transaction_type = 'deposit' AND t.status = 'success') AS deposited_vnd
            FROM users u {sql_where}
            ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?''',
                            status_args + [page_size, (page - 1) * page_size]).fetchall()
    finally:
        conn.close()
    locked = counts[1] or 0
    return {"items": [{**dict(r), "disabled": bool(r["disabled"])} for r in rows], "total": total, "page": page,
            "page_size": page_size, "has_more": page * page_size < total,
            "counts": {"all": counts[0], "active": counts[0] - locked, "locked": locked}}


class CreditAdjustRequest(BaseModel):
    delta: int = Field(ge=-1_000_000, le=1_000_000, description="Số dương = cộng, số âm = trừ")
    reason: str = Field(min_length=3, max_length=200)


@router.post("/api/admin/users/{user_id}/credits")
def api_admin_adjust_credits(user_id: str, req: CreditAdjustRequest, user: dict = Depends(require_admin_role)):
    """Cộng/trừ credit thủ công (bồi thường, khuyến mãi, sửa sai). Ghi vào lịch sử ví khách và nhật ký."""
    if req.delta == 0:
        raise HTTPException(status_code=400, detail="Số credit điều chỉnh phải khác 0")
    try:
        res = adjust_credits(user_id, req.delta, req.reason.strip())
    except WalletError as e:
        raise HTTPException(status_code=400 if "Số dư" in str(e) else 404, detail=str(e))
    audit.record(user, "user.credits", user_id, f"{req.delta:+d} credit: {req.reason.strip()}")
    return res


class LockRequest(BaseModel):
    locked: bool


@router.post("/api/admin/users/{user_id}/lock")
def api_admin_lock_user(user_id: str, req: LockRequest, user: dict = Depends(require_admin_role)):
    """Khóa: đăng xuất khỏi mọi thiết bị và không đăng nhập/gọi API được nữa. Mở khóa để dùng lại."""
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Không thể tự khóa tài khoản của mình")
    target = get_user(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Tài khoản không tồn tại")
    conn = get_db()
    try:
        conn.execute("UPDATE users SET disabled = ? WHERE id = ?", (1 if req.locked else 0, user_id))
        if req.locked:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()
    audit.record(user, "user.lock" if req.locked else "user.unlock", user_id, target.get("email") or target["name"])
    return {"status": "locked" if req.locked else "active"}


@router.get("/api/admin/audit")
def api_admin_audit(q: Optional[str] = Query(None, max_length=100),
                    action: Optional[str] = Query(None, max_length=40),
                    page: int = Query(1, ge=1, le=10_000), page_size: int = Query(30, ge=1, le=100),
                    user: dict = Depends(require_admin_role)):
    return {**audit.list_logs(page=page, page_size=page_size, action=action, q=q), "actions": audit.ACTION_LABELS}
