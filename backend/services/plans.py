"""Gói tháng (Starter / Professional / Business).

- Giá, credit mỗi tháng, số người mẫu riêng và mô tả do quản trị viên sửa trong Admin (lưu ở system_settings).
- Thanh toán bằng VietQR như nạp tiền, nội dung "GOI TX...". SePay hoặc quản trị viên xác nhận thì gói được kích hoạt.
- Mỗi lần thanh toán là một kỳ (1 hoặc 12 tháng). Đang có gói mà mua tiếp (gia hạn hoặc đổi gói) thì kỳ mới
  bắt đầu ngay khi kỳ đang dùng hết hạn, nên tháng đã trả tiền không bao giờ bị mất.
- Credit của mỗi tháng được cộng vào đầu tháng đó (cộng "lười": lần đầu người dùng mở app sau mốc là được cộng).
- Khách tự gia hạn; app nhắc từ 3 ngày trước khi hết hạn.
"""
import calendar
import json
import math
import urllib.parse
import uuid
from datetime import datetime, timezone
from typing import Optional

from backend import config
from backend.database import get_db
from backend.services.wallet import WalletError, verify_and_credit_transaction

PLANS_KEY = "plans_json"
DISCOUNT_KEY = "plans_yearly_discount"
DEFAULT_YEARLY_DISCOUNT = 20
REMIND_DAYS = 3
TS = "%Y-%m-%d %H:%M:%S"  # cùng định dạng CURRENT_TIMESTAMP của SQLite (giờ UTC)

DEFAULT_PLANS = [
    {"id": "starter", "name": "Starter", "price_vnd": 299_000, "credits_per_month": 3_300, "private_models": 3,
     "description": "Cho shop mới bắt đầu làm video", "highlight": False, "active": True},
    {"id": "pro", "name": "Professional", "price_vnd": 799_000, "credits_per_month": 9_500, "private_models": 10,
     "description": "Cho shop đăng video mỗi ngày", "highlight": True, "active": True},
    {"id": "business", "name": "Business", "price_vnd": 1_499_000, "credits_per_month": 19_000, "private_models": 30,
     "description": "Cho shop nhiều sản phẩm, nhiều nhân viên", "highlight": False, "active": True},
]
PLAN_IDS = [p["id"] for p in DEFAULT_PLANS]


class PlanError(ValueError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def _ts(dt: datetime) -> str:
    return dt.strftime(TS)


def _parse(value: str) -> datetime:
    return datetime.strptime(value[:19], TS)


def add_months(dt: datetime, months: int) -> datetime:
    """Cộng tháng theo lịch (31/1 + 1 tháng = 28 hoặc 29/2)."""
    month = dt.month - 1 + months
    year, month = dt.year + month // 12, month % 12 + 1
    return dt.replace(year=year, month=month, day=min(dt.day, calendar.monthrange(year, month)[1]))


# ------------------------------------------------------------------ cấu hình gói (Admin sửa được)
def _stored(key: str) -> Optional[str]:
    conn = get_db()
    try:
        row = conn.execute("SELECT value FROM system_settings WHERE key = ?", (key,)).fetchone()
    finally:
        conn.close()
    return row[0] if row else None


def yearly_discount() -> int:
    raw = _stored(DISCOUNT_KEY)
    return int(raw) if raw and raw.isdigit() else DEFAULT_YEARLY_DISCOUNT


def get_plans() -> list:
    """3 gói theo thứ tự cố định; giá trị quản trị viên đã lưu đè lên mặc định."""
    saved = {}
    raw = _stored(PLANS_KEY)
    if raw:
        try:
            saved = {p["id"]: p for p in json.loads(raw) if isinstance(p, dict) and p.get("id") in PLAN_IDS}
        except (ValueError, TypeError):
            saved = {}
    return [{**plan, **saved.get(plan["id"], {})} for plan in DEFAULT_PLANS]


def _clean_plan(plan: dict) -> dict:
    def number(key, low, high):
        value = plan.get(key)
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise PlanError(f"{key} của gói {plan.get('id')} phải là số nguyên từ {low} đến {high:,}".replace(",", "."))
        return value

    name = str(plan.get("name") or "").strip()
    if not 1 <= len(name) <= 40:
        raise PlanError("Tên gói từ 1 đến 40 ký tự")
    price = number("price_vnd", 10_000, 100_000_000)
    if price % 1000:
        raise PlanError("Giá gói phải là bội số của 1.000đ")
    return {
        "id": plan["id"], "name": name, "price_vnd": price,
        "credits_per_month": number("credits_per_month", 1, 10_000_000),
        "private_models": number("private_models", 0, 200),
        "description": str(plan.get("description") or "").strip()[:120],
        "highlight": bool(plan.get("highlight")), "active": bool(plan.get("active", True)),
    }


def save_plans(plans: list, discount: int) -> dict:
    by_id = {p.get("id"): p for p in plans if isinstance(p, dict)}
    if set(by_id) != set(PLAN_IDS):
        raise PlanError(f"Cần đủ 3 gói: {', '.join(PLAN_IDS)}")
    if isinstance(discount, bool) or not isinstance(discount, int) or not 0 <= discount <= 50:
        raise PlanError("Giảm giá trả theo năm từ 0 đến 50%")
    cleaned = [_clean_plan(by_id[i]) for i in PLAN_IDS]
    conn = get_db()
    try:
        conn.execute("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)",
                     (PLANS_KEY, json.dumps(cleaned, ensure_ascii=False)))
        conn.execute("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)", (DISCOUNT_KEY, str(discount)))
        conn.commit()
    finally:
        conn.close()
    return {"plans": get_plans(), "yearly_discount": yearly_discount()}


def price_for(plan: dict, cycle: str, discount: Optional[int] = None) -> int:
    """Giá một kỳ. Trả theo năm = 12 tháng trừ % giảm, làm tròn tới nghìn đồng."""
    if cycle == "monthly":
        return plan["price_vnd"]
    discount = yearly_discount() if discount is None else discount
    return int(round(plan["price_vnd"] * 12 * (100 - discount) / 100 / 1000)) * 1000


def public_plans() -> list:
    """Kèm giá năm, giá quy ra mỗi tháng, % credit tặng so với nạp lẻ và số video ước tính."""
    discount = yearly_discount()
    video_cost = max(1, config.pipeline_cost_credits())
    out = []
    for plan in get_plans():
        if not plan["active"]:
            continue
        yearly = price_for(plan, "yearly", discount)
        base_credits = plan["price_vnd"] // config.VND_PER_CREDIT
        out.append({**plan, "yearly_price_vnd": yearly, "yearly_monthly_vnd": round(yearly / 12 / 1000) * 1000,
                    "bonus_percent": max(0, round((plan["credits_per_month"] / base_credits - 1) * 100)),
                    "videos_per_month": plan["credits_per_month"] // video_cost})
    return out


# ------------------------------------------------------------------ mua gói
def create_subscription_payment(user_id: str, plan_id: str, cycle: str) -> dict:
    if cycle not in ("monthly", "yearly"):
        raise PlanError("Chu kỳ phải là monthly hoặc yearly")
    plan = next((p for p in get_plans() if p["id"] == plan_id and p["active"]), None)
    if plan is None:
        raise PlanError("Gói không tồn tại hoặc đang tạm ngừng bán")
    account_no = config.bank_account_no()
    if not account_no:
        raise WalletError("Máy chủ chưa cấu hình tài khoản nhận tiền (VIETQR_ACCOUNT_NO)")
    months = 1 if cycle == "monthly" else 12
    amount = price_for(plan, cycle)
    tx_id = f"TX{uuid.uuid4().hex[:10].upper()}"
    description = f"GOI {tx_id}"
    query = urllib.parse.urlencode({"amount": amount, "addInfo": description, "accountName": config.bank_account_name()})
    qr_url = f"https://img.vietqr.io/image/{config.bank_id()}-{account_no}-compact2.png?{query}"
    label = f"Gói {plan['name']} {'1 tháng' if months == 1 else '12 tháng'}"
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute('''
        INSERT INTO wallet_transactions (id, user_id, amount_credits, amount_vnd, transaction_type, description, qr_code_ref, status)
        VALUES (?, ?, 0, ?, 'subscription', ?, ?, 'pending')
        ''', (tx_id, user_id, amount, f"{description} · {label}", qr_url))
        conn.execute('''
        INSERT INTO subscriptions (id, user_id, plan_id, plan_name, cycle, months, price_vnd, credits_per_month,
                                   private_models, transaction_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        ''', (f"SUB{uuid.uuid4().hex[:10].upper()}", user_id, plan["id"], plan["name"], cycle, months, amount,
              plan["credits_per_month"], plan["private_models"], tx_id))
        conn.commit()
    finally:
        conn.close()
    return {
        "status": "pending", "transaction_id": tx_id, "amount_vnd": amount, "plan_id": plan["id"],
        "plan_name": plan["name"], "cycle": cycle, "months": months, "credits_per_month": plan["credits_per_month"],
        "qr_code_url": qr_url, "bank_id": config.bank_id(), "account_number": account_no,
        "account_holder": config.bank_account_name(), "transfer_content": description,
    }


def activate_subscription(transaction_id: str, confirmed_by: str) -> dict:
    """Đã nhận tiền mua gói: kích hoạt kỳ mới (nối tiếp sau kỳ đang dùng nếu có) rồi cộng credit tới hạn."""
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        sub = conn.execute("SELECT * FROM subscriptions WHERE transaction_id = ?", (transaction_id,)).fetchone()
        if sub is None:
            conn.rollback()
            return {"status": "error", "message": "Giao dịch không tồn tại"}
        cur = conn.execute("UPDATE wallet_transactions SET status = 'success', confirmed_at = CURRENT_TIMESTAMP, "
                           "confirmed_by = ? WHERE id = ? AND transaction_type = 'subscription' "
                           "AND status IN ('pending', 'cancelled')", (confirmed_by[:64], transaction_id))
        if cur.rowcount == 0:
            conn.rollback()
            return {"status": "already_processed", "message": "Giao dịch đã được ghi nhận trước đó"}
        now = _now()
        last = conn.execute("SELECT MAX(expires_at) FROM subscriptions WHERE user_id = ? AND status = 'active' "
                            "AND expires_at > ?", (sub["user_id"], _ts(now))).fetchone()[0]
        starts = max(now, _parse(last)) if last else now
        conn.execute("UPDATE subscriptions SET status = 'active', starts_at = ?, expires_at = ?, "
                     "activated_at = CURRENT_TIMESTAMP WHERE id = ?",
                     (_ts(starts), _ts(add_months(starts, sub["months"])), sub["id"]))
        conn.commit()
    finally:
        conn.close()
    granted = sync_user_plan(sub["user_id"])["granted"]
    return {"status": "success", "transaction_id": transaction_id, "subscription_id": sub["id"],
            "plan_name": sub["plan_name"], "starts_at": _ts(starts), "credits_added": granted}


def confirm_payment(transaction_id: str, confirmed_by: str) -> dict:
    """Xác nhận một lệnh chuyển khoản: nạp credit hoặc mua gói (SePay và duyệt tay dùng chung)."""
    conn = get_db()
    try:
        row = conn.execute("SELECT transaction_type FROM wallet_transactions WHERE id = ?", (transaction_id,)).fetchone()
    finally:
        conn.close()
    if row and row[0] == "subscription":
        return activate_subscription(transaction_id, confirmed_by)
    return verify_and_credit_transaction(transaction_id, confirmed_by)


def cancel_subscription_payment(transaction_id: str, admin_id: str) -> bool:
    conn = get_db()
    try:
        cur = conn.execute("UPDATE wallet_transactions SET status = 'cancelled', confirmed_at = CURRENT_TIMESTAMP, "
                           "confirmed_by = ? WHERE id = ? AND transaction_type = 'subscription' AND status = 'pending'",
                           (f"admin:{admin_id}"[:64], transaction_id))
        conn.commit()
        return cur.rowcount == 1
    finally:
        conn.close()


# ------------------------------------------------------------------ cộng credit hằng tháng, hết hạn
def sync_user_plan(user_id: str, now: Optional[datetime] = None) -> dict:
    """Cộng credit các tháng đã tới mốc và đánh dấu kỳ đã hết hạn. Gọi nhiều lần không cộng trùng."""
    now = now or _now()
    granted = 0
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        rows = conn.execute("SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' "
                            "ORDER BY starts_at", (user_id,)).fetchall()
        for sub in rows:
            starts, done = _parse(sub["starts_at"]), sub["grants_done"]
            due = [k for k in range(done, sub["months"]) if add_months(starts, k) <= now]
            for k in due:
                tx_id = f"TX{uuid.uuid4().hex[:10].upper()}"
                note = f"Credit gói {sub['plan_name']}" + (f" tháng {k + 1}/{sub['months']}" if sub["months"] > 1 else "")
                conn.execute("INSERT INTO wallet_transactions (id, user_id, amount_credits, transaction_type, description, "
                             "status) VALUES (?, ?, ?, 'plan_credit', ?, 'success')",
                             (tx_id, user_id, sub["credits_per_month"], note))
                granted += sub["credits_per_month"]
            if due:
                conn.execute("UPDATE users SET credits = credits + ? WHERE id = ?",
                             (sub["credits_per_month"] * len(due), user_id))
                conn.execute("UPDATE subscriptions SET grants_done = ? WHERE id = ?", (done + len(due), sub["id"]))
            if _parse(sub["expires_at"]) <= now:
                conn.execute("UPDATE subscriptions SET status = 'expired' WHERE id = ?", (sub["id"],))
        conn.commit()
    finally:
        conn.close()
    return {"granted": granted, **plan_status(user_id, now)}


def plan_status(user_id: str, now: Optional[datetime] = None) -> dict:
    """Gói đang dùng, kỳ đã mua nối tiếp (nếu có), ngày hết hạn cuối cùng và có cần nhắc gia hạn không."""
    now = now or _now()
    conn = get_db()
    try:
        rows = [dict(r) for r in conn.execute(
            "SELECT id, plan_id, plan_name, cycle, months, price_vnd, credits_per_month, private_models, starts_at, "
            "expires_at, grants_done FROM subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > ? "
            "ORDER BY starts_at", (user_id, _ts(now))).fetchall()]
        pending = conn.execute("SELECT COUNT(*) FROM subscriptions s JOIN wallet_transactions t ON t.id = s.transaction_id "
                               "WHERE s.user_id = ? AND s.status = 'pending' AND t.status = 'pending' "
                               "AND t.created_at >= datetime('now', '-1 day')", (user_id,)).fetchone()[0]
    finally:
        conn.close()
    current = next((r for r in rows if _parse(r["starts_at"]) <= now), None)
    upcoming = [r for r in rows if r is not current]
    if current:
        k = current["grants_done"]
        current["next_credit_at"] = (_ts(add_months(_parse(current["starts_at"]), k))
                                     if k < current["months"] else None)
    until = rows[-1]["expires_at"] if rows else None
    days_left = (_parse(until) - now).total_seconds() / 86400 if until else None
    return {"current": current, "upcoming": upcoming, "active_until": until,
            "days_left": None if days_left is None else max(0, math.ceil(days_left)),
            "renew_reminder": days_left is not None and days_left <= REMIND_DAYS,
            "pending_payments": pending}


def private_models_limit(user_id: str) -> int:
    """Số người mẫu riêng tối đa: theo gói đang dùng, không thấp hơn mức chung trong Admin."""
    base = config.private_models_limit()
    if base == 0:  # quản trị viên tắt tính năng mẫu riêng
        return 0
    current = plan_status(user_id)["current"]
    return max(base, current["private_models"]) if current else base
