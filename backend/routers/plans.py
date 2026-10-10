"""Gói tháng: bảng giá, mua/gia hạn bằng VietQR, quản trị viên sửa gói và xem các gói đã bán."""
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.auth import get_current_user, optional_user, require_admin_role
from backend.database import get_db
from backend.services import audit, plans
from backend.services.wallet import WalletError

router = APIRouter()


def _summary(status: dict) -> dict:
    """Thông tin gói gọn cho hồ sơ người dùng (banner nhắc gia hạn, menu)."""
    current = status["current"]
    return {
        "plan_id": current["plan_id"] if current else None,
        "plan_name": current["plan_name"] if current else None,
        "cycle": current["cycle"] if current else None,
        "credits_per_month": current["credits_per_month"] if current else None,
        "next_credit_at": current["next_credit_at"] if current else None,
        "active_until": status["active_until"],
        "days_left": status["days_left"],
        "renew_reminder": status["renew_reminder"],
        "has_upcoming": bool(status["upcoming"]),
    }


def plan_summary(user_id: str) -> dict:
    return _summary(plans.sync_user_plan(user_id))


@router.get("/api/plans")
def api_plans(user: Optional[dict] = Depends(optional_user)):
    """Bảng giá gói tháng (ai cũng xem được). Đã đăng nhập thì kèm gói đang dùng."""
    out = {"plans": plans.public_plans(), "yearly_discount": plans.yearly_discount(), "remind_days": plans.REMIND_DAYS}
    if user:
        status = plans.sync_user_plan(user["id"])
        out["status"] = {k: v for k, v in status.items() if k != "granted"}
    return out


class SubscribeRequest(BaseModel):
    plan_id: str = Field(max_length=20)
    cycle: Literal["monthly", "yearly"] = "monthly"


@router.post("/api/plans/subscribe")
def api_subscribe(req: SubscribeRequest, user: dict = Depends(get_current_user)):
    """Tạo mã VietQR mua hoặc gia hạn gói. Đang có gói thì kỳ mới bắt đầu khi kỳ hiện tại hết hạn."""
    try:
        return plans.create_subscription_payment(user["id"], req.plan_id, req.cycle)
    except (plans.PlanError, WalletError) as e:
        raise HTTPException(status_code=400, detail=str(e))


# ------------------------------------------------------------------ quản trị
class PlanConfig(BaseModel):
    id: str = Field(max_length=20)
    name: str = Field(max_length=40)
    price_vnd: int
    credits_per_month: int
    private_models: int
    description: str = Field(default="", max_length=120)
    highlight: bool = False
    active: bool = True


class PlansUpdate(BaseModel):
    plans: List[PlanConfig] = Field(min_length=3, max_length=3)
    yearly_discount: int


@router.get("/api/admin/plans")
def api_admin_plans(user: dict = Depends(require_admin_role)):
    """Cấu hình gói + số shop đang dùng mỗi gói và doanh thu gói theo tháng hiện tại (giờ UTC)."""
    conn = get_db()
    try:
        counts = dict(conn.execute("SELECT plan_id, COUNT(DISTINCT user_id) FROM subscriptions WHERE status = 'active' "
                                   "AND starts_at <= CURRENT_TIMESTAMP AND expires_at > CURRENT_TIMESTAMP "
                                   "GROUP BY plan_id").fetchall())
        revenue = conn.execute("SELECT COALESCE(SUM(amount_vnd), 0) FROM wallet_transactions WHERE "
                               "transaction_type = 'subscription' AND status = 'success' AND "
                               "COALESCE(confirmed_at, created_at) >= strftime('%Y-%m-01', 'now')").fetchone()[0]
    finally:
        conn.close()
    return {"plans": plans.get_plans(), "yearly_discount": plans.yearly_discount(), "active_shops": counts,
            "revenue_month_vnd": revenue}


@router.put("/api/admin/plans")
def api_admin_save_plans(req: PlansUpdate, user: dict = Depends(require_admin_role)):
    try:
        res = plans.save_plans([p.model_dump() for p in req.plans], req.yearly_discount)
    except plans.PlanError as e:
        raise HTTPException(status_code=400, detail=str(e))
    audit.record(user, "plans.update", None,
                 ", ".join(f"{p['name']} {p['price_vnd']:,}đ/{p['credits_per_month']:,} credit".replace(",", ".")
                           for p in res["plans"]) + f", năm -{res['yearly_discount']}%")
    return res


@router.get("/api/admin/subscriptions")
def api_admin_subscriptions(status: Literal["active", "pending", "expired", "all"] = "active",
                            page: int = Query(1, ge=1, le=10_000), page_size: int = Query(20, ge=1, le=100),
                            user: dict = Depends(require_admin_role)):
    where, args = "", []
    if status != "all":
        where, args = "WHERE s.status = ?", [status]
    conn = get_db()
    try:
        total = conn.execute(f"SELECT COUNT(*) FROM subscriptions s {where}", args).fetchone()[0]
        rows = conn.execute(
            f"SELECT s.id, s.user_id, u.name AS user_name, u.email AS user_email, s.plan_id, s.plan_name, s.cycle, "
            f"s.price_vnd, s.credits_per_month, s.status, s.starts_at, s.expires_at, s.grants_done, s.months, "
            f"s.transaction_id, s.created_at FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id {where} "
            f"ORDER BY COALESCE(s.activated_at, s.created_at) DESC LIMIT ? OFFSET ?",
            args + [page_size, (page - 1) * page_size]).fetchall()
    finally:
        conn.close()
    return {"items": [dict(r) for r in rows], "total": total, "page": page, "page_size": page_size,
            "has_more": page * page_size < total}
