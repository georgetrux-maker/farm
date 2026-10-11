"""Các tính năng thêm theo bản thiết kế Demo 1: quản lý người dùng, nhật ký, giao dịch, tổng quan,
người mẫu Nam/Nữ, công tắc AI, liên hệ hỗ trợ, danh sách video và các cảnh trong video."""
import pytest

from backend import config, database
from backend.ai import motion, vton
from backend.ffmpeg_utils import ffmpeg_available
from backend.tests.conftest import DEMO_AUTH, create_product, wait_for_job


@pytest.fixture()
def secret(monkeypatch):
    monkeypatch.setenv("APP_SECRET_KEY", "s" * 40)


def _register(client, email="moi@shop.vn", password="matkhau-dai-123"):
    res = client.post("/api/auth/register", json={"name": "Shop Mới", "email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()


def _audit_actions(client) -> list:
    return [i["action"] for i in client.get("/api/admin/audit", headers=DEMO_AUTH).json()["items"]]


def test_admin_user_endpoints_require_admin(client, shop):
    h = shop["headers"]
    assert client.get("/api/admin/users", headers=h).status_code == 403
    assert client.post(f"/api/admin/users/{shop['id']}/credits", headers=h, json={"delta": 5, "reason": "abc"}).status_code == 403
    assert client.post(f"/api/admin/users/{shop['id']}/lock", headers=h, json={"locked": True}).status_code == 403
    assert client.get("/api/admin/audit", headers=h).status_code == 403
    assert client.post("/api/admin/deposits/TX/cancel", headers=h).status_code == 403


def test_user_list_search_and_counts(client, shop):
    data = client.get("/api/admin/users?q=shop@test", headers=DEMO_AUTH).json()
    assert [u["email"] for u in data["items"]] == ["shop@test.vn"]
    assert data["items"][0]["credits"] == 100 and data["items"][0]["disabled"] is False
    admins = client.get("/api/admin/users?role=admin", headers=DEMO_AUTH).json()
    assert all(u["role"] == "admin" for u in admins["items"]) and admins["total"] >= 1


def test_adjust_credits_records_wallet_and_audit(client, shop):
    url = f"/api/admin/users/{shop['id']}/credits"
    res = client.post(url, headers=DEMO_AUTH, json={"delta": 50, "reason": "Bồi thường video lỗi"})
    assert res.status_code == 200 and res.json()["new_balance"] == 150
    assert client.post(url, headers=DEMO_AUTH, json={"delta": -500, "reason": "Trừ nhầm"}).status_code == 400
    assert client.post(url, headers=DEMO_AUTH, json={"delta": 0, "reason": "abc"}).status_code == 400
    assert client.post("/api/admin/users/khong-co/credits", headers=DEMO_AUTH,
                       json={"delta": 5, "reason": "abc"}).status_code == 404
    history = client.get("/api/wallet/transactions", headers=shop["headers"]).json()
    assert history[0]["transaction_type"] == "adjust" and history[0]["amount_credits"] == 50
    assert "Bồi thường" in history[0]["description"]
    assert "user.credits" in _audit_actions(client)


def test_locked_account_is_logged_out_and_cannot_log_in(client):
    _register(client)
    token = client.post("/api/auth/login", json={"email": "moi@shop.vn", "password": "matkhau-dai-123"}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    target = database.get_user_by_email("moi@shop.vn")
    assert client.post(f"/api/admin/users/{target['id']}/lock", headers=DEMO_AUTH, json={"locked": True}).status_code == 200
    assert client.get("/api/user/profile", headers=headers).status_code == 401           # phiên cũ đã bị xóa
    login = client.post("/api/auth/login", json={"email": "moi@shop.vn", "password": "matkhau-dai-123"})
    assert login.status_code == 403 and "khóa" in login.json()["detail"]
    assert client.get("/api/admin/users?status=locked", headers=DEMO_AUTH).json()["counts"]["locked"] == 1
    client.post(f"/api/admin/users/{target['id']}/lock", headers=DEMO_AUTH, json={"locked": False})
    assert client.post("/api/auth/login", json={"email": "moi@shop.vn", "password": "matkhau-dai-123"}).status_code == 200
    assert client.post(f"/api/admin/users/{database.DEMO_USER_ID}/lock", headers=DEMO_AUTH,
                       json={"locked": True}).status_code == 400                           # không tự khóa mình
    assert {"user.lock", "user.unlock"} <= set(_audit_actions(client))


def test_cancel_deposit_then_late_payment_can_still_be_verified(client, shop):
    dep = client.post("/api/wallet/deposit", headers=shop["headers"], json={"amount_vnd": 50_000}).json()
    tx = dep["transaction_id"]
    assert client.post(f"/api/admin/deposits/{tx}/cancel", headers=DEMO_AUTH).status_code == 200
    assert client.post(f"/api/admin/deposits/{tx}/cancel", headers=DEMO_AUTH).status_code == 409
    listing = client.get("/api/admin/deposits?status=cancelled", headers=DEMO_AUTH).json()
    assert [d["id"] for d in listing["items"]] == [tx] and listing["counts"]["cancelled"] == 1
    # Khách chuyển tiền sau khi đã hủy: vẫn duyệt được
    assert client.post(f"/api/admin/deposits/{tx}/verify", headers=DEMO_AUTH).json()["status"] == "success"
    assert database.get_user(shop["id"])["credits"] == 600
    assert {"deposit.cancel", "deposit.verify"} <= set(_audit_actions(client))


def test_stats_overview_has_comparison_series_and_sources(client, shop):
    conn = database.get_db()
    for tx, vnd, by, age in (("TXA", 200_000, "sepay", "-1 minutes"), ("TXB", 100_000, "admin:x", "-2 minutes"),
                             ("TXC", 70_000, "sepay", "-1 days")):
        conn.execute("INSERT INTO wallet_transactions (id, user_id, amount_credits, amount_vnd, transaction_type, "
                     "status, created_at, confirmed_at, confirmed_by) VALUES (?, ?, ?, ?, 'deposit', 'success', "
                     "datetime('now', ?), datetime('now', ?), ?)", (tx, shop["id"], vnd // 100, vnd, age, age, by))
    conn.commit()
    conn.close()
    data = client.get("/api/admin/stats-overview", headers=DEMO_AUTH).json()
    assert len(data["series"]["dates"]) == 7 == len(data["series"]["revenue_vnd"])
    assert data["series"]["revenue_vnd"][-1] + data["series"]["revenue_vnd"][-2] == 370_000
    assert {"revenue_today", "revenue_month", "new_shops_month", "completed_videos_month"} <= data["previous"].keys()
    assert data["revenue_sources"].get("manual", 0) == 100_000 and data["revenue_sources"]["sepay"] == 270_000
    assert len(client.get("/api/admin/stats-overview?days=30", headers=DEMO_AUTH).json()["series"]["dates"]) == 30


def test_avatar_gender_filterable(client):
    res = client.post("/api/avatars", headers=DEMO_AUTH, json={
        "name": "Quang Huy", "style": "Nam công sở", "height": "1m78", "weight": "68kg", "measurements": "-",
        "avatar_url": "https://example.com/huy.jpg", "gender": "male"})
    assert res.status_code == 200 and res.json()["gender"] == "male"
    avatars = {a["id"]: a for a in client.get("/api/avatars").json()}
    assert avatars["model_01"]["gender"] == "female" and avatars[res.json()["id"]]["gender"] == "male"
    assert client.patch("/api/avatars/model_01", headers=DEMO_AUTH, json={"gender": "robot"}).status_code == 422
    assert "avatar.create" in _audit_actions(client)


def test_provider_switches_turn_ai_off(client, secret, monkeypatch):
    monkeypatch.setenv("FASHN_API_KEY", "fa-key")
    monkeypatch.setenv("REPLICATE_API_TOKEN", "r8-token")
    assert vton.engine_name() == "fashn" and motion.engine_name().startswith("replicate")
    res = client.post("/api/admin/api-keys", headers=DEMO_AUTH, json={"fashn_enabled": False, "replicate_enabled": "0"})
    assert res.status_code == 200, res.text
    assert vton.engine_name() == "placeholder-composite" and motion.engine_name() == "placeholder-ffmpeg-camera"
    settings = {s["key"]: s for s in client.get("/api/admin/api-keys", headers=DEMO_AUTH).json()["settings"]}
    assert settings["fashn_enabled"]["value"] is False and settings["fashn_enabled"]["kind"] == "bool"
    client.post("/api/admin/api-keys", headers=DEMO_AUTH, json={"fashn_enabled": True})
    assert vton.engine_name() == "fashn"
    assert client.post("/api/admin/api-keys", headers=DEMO_AUTH, json={"fashn_enabled": "maybe"}).status_code == 400
    assert client.post("/api/admin/api-keys", headers=DEMO_AUTH, json={"pipeline_cost_credits": True}).status_code == 400
    assert "settings.update" in _audit_actions(client)


def test_support_contacts_and_signup_switch(client, secret):
    assert client.get("/api/support/info").json() == {"hotline": "", "zalo": "", "email": ""}
    res = client.post("/api/admin/api-keys", headers=DEMO_AUTH, json={
        "support_hotline": "0901 234 567", "support_zalo": "https://zalo.me/0901234567", "support_email": "hotro@aura.vn"})
    assert res.status_code == 200, res.text
    assert client.get("/api/support/info").json()["email"] == "hotro@aura.vn"
    assert client.post("/api/admin/api-keys", headers=DEMO_AUTH, json={"support_email": "khong-phai-email"}).status_code == 400
    client.post("/api/admin/api-keys", headers=DEMO_AUTH, json={"allow_signup": False})
    assert not config.allow_signup()
    assert client.post("/api/auth/register", json={"name": "A", "email": "a@b.vn", "password": "matkhau-dai-123"}).status_code == 403


@pytest.mark.skipif(not ffmpeg_available(), reason="Cần ffmpeg")
def test_completed_video_lists_product_info_and_scenes(client, shop):
    product = create_product(client, shop["headers"], title="Đầm voan hoa", price=289000)
    run = client.post("/api/pipeline/run", headers=shop["headers"],
                      json={"product_id": product["id"], "custom_script": "Đầm voan hoa nhí xinh lắm.\nGiá chỉ 289 nghìn."})
    job = wait_for_job(client, run.json()["job_id"], shop["headers"])
    assert job["status"] == "completed", job
    scenes = job["script"]["scenes"]
    assert len(scenes) == 5 and all(s["image_url"].startswith("/media/") for s in scenes)
    assert scenes == sorted(scenes, key=lambda s: s["time"]) and any(s["caption"] for s in scenes)
    assert client.get(scenes[0]["image_url"]).status_code == 200
    assert job["script"]["post_caption"].startswith("Đầm voan hoa") and job["script"]["hashtags"]
    item = client.get("/api/jobs", headers=shop["headers"]).json()["items"][0]
    assert item["product_price"] == 289000 and item["published_platforms"] == []
    stats = client.get("/api/dashboard/stats", headers=shop["headers"]).json()
    assert stats["products_count"] == 1 and stats["completed_renders"] == 1


def test_wallet_summary_totals(client, shop):
    h = shop["headers"]
    dep = client.post("/api/wallet/deposit", headers=h, json={"amount_vnd": 20_000}).json()
    client.post(f"/api/admin/deposits/{dep['transaction_id']}/verify", headers=DEMO_AUTH)
    client.post(f"/api/admin/users/{shop['id']}/credits", headers=DEMO_AUTH, json={"delta": -30, "reason": "Trừ thử"})
    data = client.get("/api/wallet/summary", headers=h).json()
    assert data["deposited_vnd"] == 20_000 and data["deposited_credits"] == 200
    assert data["adjusted_credits"] == -30 and data["used_credits"] == 0
    assert data["balance"] == database.get_user(shop["id"])["credits"] == 270
    assert client.get("/api/wallet/summary").status_code == 401


def test_script_preview_uses_detected_features(client, shop):
    res = client.post("/api/ai/script/preview", headers=shop["headers"], json={
        "title": "Áo sơ mi lụa", "price": 259000, "style": "office", "features": ["cổ đức", "tay bồng"]})
    assert res.status_code == 200, res.text
    assert "cổ đức" in res.json()["full_script"]          # mẫu câu nhắc điểm nổi bật đầu tiên
    too_many = client.post("/api/ai/script/preview", headers=shop["headers"], json={
        "title": "Áo", "price": 1000, "features": ["x"] * 13})
    assert too_many.status_code == 422
