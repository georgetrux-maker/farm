"""Demo 2 phần 3: gói tháng Starter / Professional / Business."""
from datetime import timedelta

import pytest

from backend import database
from backend.services import plans
from backend.tests.conftest import DEMO_AUTH

SEPAY = {"Authorization": "Apikey sepay-secret"}


@pytest.fixture(autouse=True)
def plans_env(monkeypatch):
    monkeypatch.setenv("SEPAY_WEBHOOK_KEY", "sepay-secret")


def _event(content, amount, event_id):
    return {"id": event_id, "gateway": "MBBank", "accountNumber": "0123456789", "content": f"CT DEN {content}",
            "transferType": "in", "transferAmount": amount, "referenceCode": "FT1", "description": ""}


def _balance(client, headers):
    return client.get("/api/user/profile", headers=headers).json()["credits"]


def _buy(client, shop, plan_id="starter", cycle="monthly", event_id=1):
    res = client.post("/api/plans/subscribe", headers=shop["headers"], json={"plan_id": plan_id, "cycle": cycle})
    assert res.status_code == 200, res.text
    pay = res.json()
    assert pay["transfer_content"].startswith("GOI TX")
    hook = client.post("/api/webhooks/sepay", headers=SEPAY,
                       json=_event(pay["transfer_content"].replace(" ", "").lower(), pay["amount_vnd"], event_id))
    assert hook.json()["result"] == "plan_activated", hook.text
    return pay


def _sub(user_id):
    conn = database.get_db()
    try:
        return [dict(r) for r in conn.execute("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at, rowid",
                                              (user_id,)).fetchall()]
    finally:
        conn.close()


def test_price_list_monthly_and_yearly(client):
    data = client.get("/api/plans").json()
    assert [(p["name"], p["price_vnd"]) for p in data["plans"]] == [
        ("Starter", 299_000), ("Professional", 799_000), ("Business", 1_499_000)]
    assert data["yearly_discount"] == 20 and "status" not in data
    starter = data["plans"][0]
    assert starter["yearly_price_vnd"] == 2_870_000                # 299k x 12 x 80%, làm tròn nghìn
    assert starter["bonus_percent"] == 10 and starter["videos_per_month"] == 3_300 // 30


def test_monthly_plan_paid_by_sepay(client, shop):
    pay = _buy(client, shop)
    assert pay["amount_vnd"] == 299_000
    profile = client.get("/api/user/profile", headers=shop["headers"]).json()
    assert profile["credits"] == 100 + 3_300
    assert profile["plan"]["plan_name"] == "Starter" and profile["plan"]["days_left"] >= 27
    assert profile["plan"]["renew_reminder"] is False and profile["plan"]["next_credit_at"] is None
    history = client.get("/api/wallet/transactions", headers=shop["headers"]).json()
    assert {t["transaction_type"] for t in history} >= {"subscription", "plan_credit"}
    summary = client.get("/api/wallet/summary", headers=shop["headers"]).json()
    assert summary["plan_credits"] == 3_300 and summary["plan_paid_vnd"] == 299_000 and summary["deposited_vnd"] == 0
    # Gửi lại cùng sự kiện: không cộng thêm
    again = client.post("/api/webhooks/sepay", headers=SEPAY,
                        json=_event(pay["transfer_content"], pay["amount_vnd"], 2))
    assert again.json()["result"] == "already_credited"
    assert _balance(client, shop["headers"]) == 3_400


def test_underpaid_plan_is_not_activated(client, shop):
    pay = client.post("/api/plans/subscribe", headers=shop["headers"], json={"plan_id": "pro"}).json()
    res = client.post("/api/webhooks/sepay", headers=SEPAY, json=_event(pay["transfer_content"], 500_000, 3))
    assert res.json()["result"] == "amount_too_low"
    assert client.get("/api/plans", headers=shop["headers"]).json()["status"]["current"] is None


def test_yearly_plan_grants_credit_each_month_once(client, shop):
    _buy(client, shop, "pro", "yearly")
    sub = _sub(shop["id"])[0]
    assert sub["months"] == 12 and sub["price_vnd"] == 7_670_000 and sub["grants_done"] == 1
    start = plans._parse(sub["starts_at"])
    assert _balance(client, shop["headers"]) == 100 + 9_500
    plans.sync_user_plan(shop["id"], now=plans.add_months(start, 1) + timedelta(seconds=1))
    plans.sync_user_plan(shop["id"], now=plans.add_months(start, 1) + timedelta(seconds=2))   # không cộng trùng
    assert database.get_user(shop["id"])["credits"] == 100 + 2 * 9_500
    plans.sync_user_plan(shop["id"], now=plans.add_months(start, 12) + timedelta(seconds=1))
    assert database.get_user(shop["id"])["credits"] == 100 + 12 * 9_500
    assert _sub(shop["id"])[0]["status"] == "expired"


def test_renewal_and_switch_start_after_current_period(client, shop):
    _buy(client, shop, "starter", event_id=10)
    _buy(client, shop, "business", event_id=11)                     # đổi gói: nối tiếp, không mất tháng đã trả
    first, second = _sub(shop["id"])
    assert second["starts_at"] == first["expires_at"]
    status = client.get("/api/plans", headers=shop["headers"]).json()["status"]
    assert status["current"]["plan_id"] == "starter" and [u["plan_id"] for u in status["upcoming"]] == ["business"]
    assert status["active_until"] == second["expires_at"]
    assert _balance(client, shop["headers"]) == 100 + 3_300          # credit Business cộng khi kỳ đó bắt đầu
    later = plans._parse(first["expires_at"]) + timedelta(seconds=1)
    after = plans.sync_user_plan(shop["id"], now=later)
    assert after["granted"] == 19_000 and after["current"]["plan_id"] == "business"
    # Nhắc gia hạn trong 3 ngày cuối
    near_end = plans._parse(second["expires_at"]) - timedelta(days=2)
    assert plans.plan_status(shop["id"], now=near_end)["renew_reminder"] is True
    assert plans.plan_status(shop["id"], now=near_end - timedelta(days=5))["renew_reminder"] is False


def test_plan_raises_private_model_limit(client, shop, monkeypatch):
    monkeypatch.setenv("PRIVATE_MODELS_LIMIT", "1")
    assert client.get("/api/my/avatars/quota", headers=shop["headers"]).json()["limit"] == 1
    _buy(client, shop, "pro")
    assert client.get("/api/my/avatars/quota", headers=shop["headers"]).json()["limit"] == 10
    monkeypatch.setenv("PRIVATE_MODELS_LIMIT", "0")                 # quản trị viên tắt tính năng
    assert client.get("/api/my/avatars/quota", headers=shop["headers"]).json()["limit"] == 0


def test_admin_edits_plans_and_verifies_payment(client, shop):
    h = shop["headers"]
    assert client.get("/api/admin/plans", headers=h).status_code == 403
    cfg = client.get("/api/admin/plans", headers=DEMO_AUTH).json()
    edited = [{**p, "price_vnd": 349_000, "credits_per_month": 4_000} if p["id"] == "starter" else p for p in cfg["plans"]]
    bad = [{**p, "price_vnd": 349_500} if p["id"] == "starter" else p for p in cfg["plans"]]
    assert client.put("/api/admin/plans", headers=DEMO_AUTH, json={"plans": bad, "yearly_discount": 20}).status_code == 400
    assert client.put("/api/admin/plans", headers=DEMO_AUTH, json={"plans": edited, "yearly_discount": 60}).status_code == 400
    res = client.put("/api/admin/plans", headers=DEMO_AUTH, json={"plans": edited, "yearly_discount": 25})
    assert res.status_code == 200, res.text
    starter = client.get("/api/plans").json()["plans"][0]
    assert starter["price_vnd"] == 349_000 and starter["yearly_price_vnd"] == 3_141_000

    pay = client.post("/api/plans/subscribe", headers=h, json={"plan_id": "starter"}).json()
    pending = client.get("/api/admin/deposits?status=pending", headers=DEMO_AUTH).json()["items"]
    assert pending[0]["transaction_type"] == "subscription" and pending[0]["amount_vnd"] == 349_000
    ok = client.post(f"/api/admin/deposits/{pay['transaction_id']}/verify", headers=DEMO_AUTH).json()
    assert ok["status"] == "success" and ok["plan_name"] == "Starter"
    assert _balance(client, h) == 100 + 4_000
    subs = client.get("/api/admin/subscriptions", headers=DEMO_AUTH).json()["items"]
    assert subs[0]["user_email"] == "shop@test.vn" and subs[0]["status"] == "active"
    overview = client.get("/api/admin/stats-overview", headers=DEMO_AUTH).json()
    assert overview["revenue_products"] == {"plan": 349_000} and overview["revenue_sources"] == {"manual": 349_000}
    assert overview["summary"]["revenue_vnd"]["total"] == 349_000
    assert client.get("/api/admin/plans", headers=DEMO_AUTH).json()["active_shops"] == {"starter": 1}
    actions = [a["action"] for a in client.get("/api/admin/audit", headers=DEMO_AUTH).json()["items"]]
    assert "plans.update" in actions and "plan.verify" in actions

    # Hủy lệnh mua gói còn treo
    pay2 = client.post("/api/plans/subscribe", headers=h, json={"plan_id": "pro", "cycle": "yearly"}).json()
    assert client.post(f"/api/admin/deposits/{pay2['transaction_id']}/cancel", headers=DEMO_AUTH).json()["status"] == "cancelled"


def test_subscribe_rejects_unknown_or_paused_plan(client, shop):
    assert client.post("/api/plans/subscribe", headers=shop["headers"], json={"plan_id": "vip"}).status_code == 400
    assert client.post("/api/plans/subscribe", headers=shop["headers"],
                       json={"plan_id": "pro", "cycle": "weekly"}).status_code == 422
    cfg = client.get("/api/admin/plans", headers=DEMO_AUTH).json()
    paused = [{**p, "active": p["id"] != "business"} for p in cfg["plans"]]
    assert client.put("/api/admin/plans", headers=DEMO_AUTH, json={"plans": paused, "yearly_discount": 20}).status_code == 200
    assert [p["id"] for p in client.get("/api/plans").json()["plans"]] == ["starter", "pro"]
    assert client.post("/api/plans/subscribe", headers=shop["headers"], json={"plan_id": "business"}).status_code == 400
