"""Đợt 3: đăng nhập, webhook SePay, kết nối & đăng TikTok/Facebook (giả lập, không gọi mạng)."""
import json
import urllib.parse

import httpx
import pytest

from backend import database
from backend.ai import http_utils
from backend.crypto_utils import decrypt, sign
from backend.ffmpeg_utils import ffmpeg_available
from backend.services import queue_manager, social
from backend.tests.conftest import DEMO_AUTH, create_product, wait_for_job

SEPAY = {"Authorization": "Apikey sepay-secret"}


@pytest.fixture(autouse=True)
def round3_env(monkeypatch):
    monkeypatch.setenv("APP_SECRET_KEY", "x" * 40)
    monkeypatch.setenv("SEPAY_WEBHOOK_KEY", "sepay-secret")
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.vn")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://api.example.vn")


# =============================================================== Đăng ký / đăng nhập
def _register(client, email="shop@hoa.vn", password="matkhau123"):
    return client.post("/api/auth/register", json={"name": "Shop Hoa", "email": email, "password": password})


def test_register_login_logout(client, monkeypatch):
    monkeypatch.setenv("SIGNUP_BONUS_CREDITS", "60")
    res = _register(client)
    assert res.status_code == 200
    token = res.json()["token"]
    assert res.json()["user"]["credits"] == 60
    assert "password_hash" not in res.json()["user"]

    me = client.get("/api/user/profile", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["email"] == "shop@hoa.vn" and me["role"] == "shop"
    assert "password_hash" not in me

    login = client.post("/api/auth/login", json={"email": "SHOP@hoa.vn", "password": "matkhau123"})
    assert login.status_code == 200
    token2 = login.json()["token"]
    client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token2}"})
    assert client.get("/api/user/profile", headers={"Authorization": f"Bearer {token2}"}).status_code == 401
    # Phiên khác vẫn còn hiệu lực
    assert client.get("/api/user/profile", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_password_is_hashed_and_wrong_password_rejected(client):
    _register(client)
    stored = database.get_user_by_email("shop@hoa.vn")["password_hash"]
    assert stored.startswith("scrypt$") and "matkhau123" not in stored
    assert client.post("/api/auth/login", json={"email": "shop@hoa.vn", "password": "sai"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "khong@co.vn", "password": "x"}).status_code == 401


def test_duplicate_email_and_weak_password(client):
    _register(client)
    assert _register(client, email="Shop@Hoa.vn").status_code == 409
    assert _register(client, email="b@hoa.vn", password="ngan").status_code == 422
    assert _register(client, email="khong-phai-email").status_code == 422


def test_login_bruteforce_is_limited(client):
    _register(client)
    codes = [client.post("/api/auth/login", json={"email": "shop@hoa.vn", "password": f"sai{i}"}).status_code
             for i in range(12)]
    assert 429 in codes


def test_signup_can_be_disabled(client, monkeypatch):
    monkeypatch.setenv("ALLOW_SIGNUP", "0")
    assert _register(client).status_code == 403


def test_expired_session_rejected(client):
    token = _register(client).json()["token"]
    conn = database.get_db()
    conn.execute("UPDATE sessions SET expires_at = datetime('now', '-1 minute')")
    conn.commit()
    conn.close()
    assert client.get("/api/user/profile", headers={"Authorization": f"Bearer {token}"}).status_code == 401


# =============================================================== Webhook SePay
def _deposit(client, amount=200000):
    return client.post("/api/wallet/deposit", headers=DEMO_AUTH, json={"amount_vnd": amount}).json()


def _balance(client, headers=DEMO_AUTH):
    return client.get("/api/user/profile", headers=headers).json()["credits"]


def _sepay_event(tx_code, amount, event_id=1001, **extra):
    return {"id": event_id, "gateway": "MBBank", "transactionDate": "2026-10-09 10:00:00",
            "accountNumber": "0123456789", "code": None, "content": f"CT DEN 123 {tx_code} chuyen tien",
            "transferType": "in", "transferAmount": amount, "accumulated": 0, "subAccount": None,
            "referenceCode": "FT123", "description": "", **extra}


def test_sepay_webhook_credits_once(client):
    tx = _deposit(client)
    before = _balance(client)
    # Ngân hàng hay bỏ dấu cách và đổi chữ thường
    code = tx["transfer_content"].replace(" ", "").lower()
    res = client.post("/api/webhooks/sepay", headers=SEPAY, json=_sepay_event(code, 200000))
    assert res.status_code == 200
    assert res.json()["success"] is True and res.json()["result"] == "credited"
    assert _balance(client) == before + 2000
    tx_status = client.get(f"/api/wallet/transactions/{tx['transaction_id']}", headers=DEMO_AUTH).json()
    assert tx_status["status"] == "success"

    again = client.post("/api/webhooks/sepay", headers=SEPAY, json=_sepay_event(code, 200000))
    assert again.json()["result"] == "duplicate"
    other_event = client.post("/api/webhooks/sepay", headers=SEPAY, json=_sepay_event(code, 200000, event_id=1002))
    assert other_event.json()["result"] == "already_credited"
    assert _balance(client) == before + 2000


def test_sepay_webhook_requires_api_key(client):
    tx = _deposit(client)
    before = _balance(client)
    for headers in ({}, {"Authorization": "Apikey sai"}, {"Authorization": "Bearer sepay-secret"}):
        res = client.post("/api/webhooks/sepay", headers=headers, json=_sepay_event(tx["transfer_content"], 200000))
        assert res.status_code == 401
    assert _balance(client) == before


def test_sepay_webhook_rejects_underpayment_and_other_cases(client):
    tx = _deposit(client)
    before = _balance(client)
    cases = [
        (_sepay_event(tx["transfer_content"], 150000, event_id=1), "amount_too_low"),
        (_sepay_event(tx["transfer_content"], 200000, event_id=2, transferType="out"), "ignored_outgoing"),
        (_sepay_event(tx["transfer_content"], 200000, event_id=3, accountNumber="999"), "ignored_other_account"),
        (_sepay_event("chuyen tien an trua", 200000, event_id=4), "no_matching_code"),
        (_sepay_event("NAPTIEN TX0000000000", 200000, event_id=5), "unknown_transaction"),
    ]
    for payload, expected in cases:
        assert client.post("/api/webhooks/sepay", headers=SEPAY, json=payload).json()["result"] == expected
    assert _balance(client) == before
    conn = database.get_db()
    assert conn.execute("SELECT COUNT(*) FROM bank_events").fetchone()[0] == 5
    conn.close()


def test_sepay_webhook_disabled_without_key(client, monkeypatch):
    monkeypatch.setenv("SEPAY_WEBHOOK_KEY", "")
    res = client.post("/api/webhooks/sepay", headers={"Authorization": "Apikey "}, json={"id": 1})
    assert res.status_code == 401


# =============================================================== Mạng xã hội
class FakeSocial:
    def __init__(self):
        self.requests = []
        self.tiktok_status = "PUBLISH_COMPLETE"

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = str(request.url).split("?")[0]
        if url == "https://open.tiktokapis.com/v2/oauth/token/":
            return httpx.Response(200, json={"access_token": "tt-access", "refresh_token": "tt-refresh",
                                             "open_id": "open_123", "expires_in": 86400, "scope": "video.publish"})
        if url == "https://open.tiktokapis.com/v2/user/info/":
            return httpx.Response(200, json={"data": {"user": {"open_id": "open_123", "display_name": "Shop Hoa"}}})
        if url == "https://open.tiktokapis.com/v2/post/publish/creator_info/query/":
            return httpx.Response(200, json={"data": {"creator_nickname": "shophoa",
                                                      "privacy_level_options": ["SELF_ONLY", "PUBLIC_TO_EVERYONE"],
                                                      "max_video_post_duration_sec": 600}})
        if url == "https://open.tiktokapis.com/v2/post/publish/video/init/":
            return httpx.Response(200, json={"data": {"publish_id": "pub_tt_1",
                                                      "upload_url": "https://open-upload.tiktokapis.com/up/1"}})
        if url == "https://open-upload.tiktokapis.com/up/1":
            return httpx.Response(201)
        if url == "https://open.tiktokapis.com/v2/post/publish/status/fetch/":
            if self.tiktok_status == "FAILED":
                return httpx.Response(200, json={"data": {"status": "FAILED", "fail_reason": "duration_check"}})
            return httpx.Response(200, json={"data": {"status": "PUBLISH_COMPLETE",
                                                      "publicaly_available_post_id": [7300000000001]}})
        if url == "https://graph.facebook.com/v23.0/oauth/access_token":
            params = dict(request.url.params)
            token = "fb-long" if params.get("grant_type") == "fb_exchange_token" else "fb-short"
            return httpx.Response(200, json={"access_token": token})
        if url == "https://graph.facebook.com/v23.0/me/accounts":
            return httpx.Response(200, json={"data": [{"id": "page_1", "name": "Trang Shop Hoa",
                                                       "access_token": "page-token"}]})
        if url == "https://graph.facebook.com/v23.0/page_1/video_reels":
            body = urllib.parse.parse_qs(request.content.decode())
            if body["upload_phase"] == ["start"]:
                return httpx.Response(200, json={"video_id": "vid_1",
                                                 "upload_url": "https://rupload.facebook.com/video-upload/v23.0/vid_1"})
            return httpx.Response(200, json={"success": True})
        if url == "https://rupload.facebook.com/video-upload/v23.0/vid_1":
            return httpx.Response(200, json={"success": True})
        return httpx.Response(404, json={"error": {"message": f"unexpected {url}"}})

    def find(self, url_part, method=None):
        return [r for r in self.requests if url_part in str(r.url) and (method is None or r.method == method)]


@pytest.fixture()
def fake_social(monkeypatch):
    fake = FakeSocial()
    monkeypatch.setattr(http_utils, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(fake.handler)))
    monkeypatch.setattr(http_utils.time, "sleep", lambda s: None)
    for k, v in {"TIKTOK_CLIENT_KEY": "tt-key", "TIKTOK_CLIENT_SECRET": "tt-secret",
                 "FACEBOOK_APP_ID": "fb-app", "FACEBOOK_APP_SECRET": "fb-secret"}.items():
        monkeypatch.setenv(k, v)
    return fake


def _connect(client, platform, headers=DEMO_AUTH):
    auth_url = client.get(f"/api/social/{platform}/connect", headers=headers).json()["auth_url"]
    state = urllib.parse.parse_qs(urllib.parse.urlparse(auth_url).query)["state"][0]
    return auth_url, client.get(f"/api/social/{platform}/callback", params={"code": "abc", "state": state},
                                follow_redirects=False)


def test_tiktok_connect_stores_encrypted_tokens(client, fake_social):
    auth_url, res = _connect(client, "tiktok")
    q = urllib.parse.parse_qs(urllib.parse.urlparse(auth_url).query)
    assert auth_url.startswith("https://www.tiktok.com/v2/auth/authorize/")
    assert q["client_key"] == ["tt-key"] and "video.publish" in q["scope"][0]
    assert q["redirect_uri"] == ["https://api.example.vn/api/social/tiktok/callback"]

    assert res.status_code in (302, 307)
    assert res.headers["location"].startswith("https://app.example.vn/?social=tiktok&result=connected")
    accounts = client.get("/api/social/status", headers=DEMO_AUTH).json()["accounts"]
    assert accounts[0]["display_name"] == "Shop Hoa" and "access_token_enc" not in accounts[0]

    conn = database.get_db()
    row = conn.execute("SELECT access_token_enc, refresh_token_enc FROM social_accounts").fetchone()
    conn.close()
    assert "tt-access" not in row[0] and decrypt(row[0]) == "tt-access"
    assert decrypt(row[1]) == "tt-refresh"


def test_oauth_callback_rejects_forged_or_foreign_state(client, fake_social):
    res = client.get("/api/social/tiktok/callback", params={"code": "abc", "state": "gia-mao"}, follow_redirects=False)
    assert "result=error" in res.headers["location"]
    # State ký cho Facebook không dùng được cho TikTok
    state = sign({"uid": "user_linh_chi", "p": "facebook", "n": "x"})
    res = client.get("/api/social/tiktok/callback", params={"code": "abc", "state": state}, follow_redirects=False)
    assert "result=error" in res.headers["location"]
    assert not fake_social.find("oauth/token")


def test_oauth_link_cannot_be_completed_in_another_browser(client, fake_social):
    """Kẻ xấu lấy link cấp quyền của mình rồi gửi cho nạn nhân bấm: phải bị chặn."""
    from fastapi.testclient import TestClient
    from backend.main import app

    auth_url = client.get("/api/social/tiktok/connect", headers=DEMO_AUTH).json()["auth_url"]
    state = urllib.parse.parse_qs(urllib.parse.urlparse(auth_url).query)["state"][0]
    victim_browser = TestClient(app, base_url="https://testserver")  # không có cookie của phiên kết nối
    res = victim_browser.get("/api/social/tiktok/callback", params={"code": "abc", "state": state},
                             follow_redirects=False)
    assert "result=error" in res.headers["location"]
    assert not fake_social.find("oauth/token")
    assert client.get("/api/social/status", headers=DEMO_AUTH).json()["accounts"] == []


def test_webhook_not_rate_limited(client, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "2")
    codes = [client.post("/api/webhooks/sepay", headers=SEPAY, json={"id": i, "transferType": "out"}).status_code
             for i in range(5)]
    assert codes == [200] * 5


def test_connect_requires_configuration(client, monkeypatch):
    monkeypatch.setenv("TIKTOK_CLIENT_KEY", "")
    res = client.get("/api/social/tiktok/connect", headers=DEMO_AUTH)
    assert res.status_code == 400 and "chưa cấu hình" in res.json()["detail"]


def test_facebook_connect_saves_pages(client, fake_social):
    _, res = _connect(client, "facebook")
    assert "result=connected" in res.headers["location"] and "Trang+Shop+Hoa" in res.headers["location"]
    acc = client.get("/api/social/status", headers=DEMO_AUTH).json()["accounts"]
    assert acc[0]["platform"] == "facebook" and acc[0]["external_id"] == "page_1"


def _completed_job(client, headers=DEMO_AUTH):
    product = create_product(client, headers)
    job_id = client.post("/api/pipeline/run", headers=headers, json={"product_id": product["id"]}).json()["job_id"]
    job = wait_for_job(client, job_id, headers)
    assert job["status"] == "completed"
    return job


def _wait_publication(client, job_id, headers=DEMO_AUTH):
    import time
    for _ in range(100):
        pubs = client.get("/api/social/publications", params={"job_id": job_id}, headers=headers).json()
        if pubs and pubs[0]["status"] in ("published", "failed"):
            return pubs[0]
        time.sleep(0.05)
    raise AssertionError("Đăng bài không xong")


@pytest.mark.skipif(not ffmpeg_available(), reason="Cần ffmpeg")
def test_publish_to_tiktok(client, fake_social):
    _connect(client, "tiktok")
    account = client.get("/api/social/status", headers=DEMO_AUTH).json()["accounts"][0]
    info = client.get(f"/api/social/accounts/{account['id']}/creator-info", headers=DEMO_AUTH).json()
    assert "PUBLIC_TO_EVERYONE" in info["privacy_level_options"]

    job = _completed_job(client)
    body = {"job_id": job["job_id"], "account_id": account["id"], "caption": "Áo khoác dạ #aokhoac"}
    assert client.post("/api/social/publish", headers=DEMO_AUTH, json=body).status_code == 400  # thiếu quyền riêng tư
    res = client.post("/api/social/publish", headers=DEMO_AUTH,
                      json={**body, "privacy_level": "SELF_ONLY", "allow_duet": False})
    assert res.status_code == 200
    pub = _wait_publication(client, job["job_id"])
    assert pub["status"] == "published", pub["error_message"]
    assert pub["external_id"] == "7300000000001"
    assert pub["product_title"] == "Áo khoác dạ"

    init = json.loads(fake_social.find("video/init")[0].content)
    assert init["post_info"]["privacy_level"] == "SELF_ONLY"
    assert init["post_info"]["disable_duet"] is True and init["post_info"]["is_aigc"] is True
    assert init["source_info"]["source"] == "FILE_UPLOAD" and init["source_info"]["total_chunk_count"] == 1
    upload = fake_social.find("open-upload.tiktokapis.com", "PUT")[0]
    size = init["source_info"]["video_size"]
    assert upload.headers["Content-Range"] == f"bytes 0-{size - 1}/{size}"
    assert fake_social.find("video/init")[0].headers["Authorization"] == "Bearer tt-access"


@pytest.mark.skipif(not ffmpeg_available(), reason="Cần ffmpeg")
def test_publish_to_facebook_reels(client, fake_social):
    _connect(client, "facebook")
    account = client.get("/api/social/status", headers=DEMO_AUTH).json()["accounts"][0]
    job = _completed_job(client)
    client.post("/api/social/publish", headers=DEMO_AUTH,
                json={"job_id": job["job_id"], "account_id": account["id"], "caption": "Reels mới"})
    pub = _wait_publication(client, job["job_id"])
    assert pub["status"] == "published", pub["error_message"]
    upload = fake_social.find("rupload.facebook.com")[0]
    assert upload.headers["Authorization"] == "OAuth page-token" and upload.headers["offset"] == "0"
    finish = urllib.parse.parse_qs(fake_social.find("video_reels")[-1].content.decode())
    assert finish["video_state"] == ["PUBLISHED"] and finish["description"] == ["Reels mới"]


@pytest.mark.skipif(not ffmpeg_available(), reason="Cần ffmpeg")
def test_tiktok_failure_is_recorded(client, fake_social):
    fake_social.tiktok_status = "FAILED"
    _connect(client, "tiktok")
    account = client.get("/api/social/status", headers=DEMO_AUTH).json()["accounts"][0]
    job = _completed_job(client)
    client.post("/api/social/publish", headers=DEMO_AUTH, json={
        "job_id": job["job_id"], "account_id": account["id"], "caption": "x", "privacy_level": "SELF_ONLY"})
    pub = _wait_publication(client, job["job_id"])
    assert pub["status"] == "failed" and "duration_check" in pub["error_message"]


def test_tiktok_token_refreshes_when_expired(client, fake_social):
    _connect(client, "tiktok")
    conn = database.get_db()
    conn.execute("UPDATE social_accounts SET expires_at = datetime('now', '-1 hour')")
    conn.commit()
    conn.close()
    account = client.get("/api/social/status", headers=DEMO_AUTH).json()["accounts"][0]
    client.get(f"/api/social/accounts/{account['id']}/creator-info", headers=DEMO_AUTH)
    refresh = [r for r in fake_social.find("oauth/token") if b"grant_type=refresh_token" in r.content]
    assert refresh and b"refresh_token=tt-refresh" in refresh[0].content


def test_cannot_publish_others_job_or_account(client, shop, fake_social, monkeypatch):
    _connect(client, "tiktok")
    account = client.get("/api/social/status", headers=DEMO_AUTH).json()["accounts"][0]
    monkeypatch.setattr(queue_manager, "_process_job_worker", lambda *a: None)
    product = create_product(client, shop["headers"])
    shop_job = client.post("/api/pipeline/run", headers=shop["headers"],
                           json={"product_id": product["id"]}).json()["job_id"]
    # Shop dùng tài khoản TikTok của người khác
    res = client.post("/api/social/publish", headers=shop["headers"], json={
        "job_id": shop_job, "account_id": account["id"], "caption": "x", "privacy_level": "SELF_ONLY"})
    assert res.status_code == 404
    # Chủ tài khoản đăng video của shop
    res = client.post("/api/social/publish", headers=DEMO_AUTH, json={
        "job_id": shop_job, "account_id": account["id"], "caption": "x", "privacy_level": "SELF_ONLY"})
    assert res.status_code == 404
    assert client.delete(f"/api/social/accounts/{account['id']}", headers=shop["headers"]).status_code == 404
    assert client.delete(f"/api/social/accounts/{account['id']}", headers=DEMO_AUTH).status_code == 200


def test_social_connect_needs_secret_key(client, fake_social, monkeypatch):
    monkeypatch.setenv("APP_SECRET_KEY", "ngan")
    res = client.get("/api/social/tiktok/connect", headers=DEMO_AUTH)
    assert res.status_code == 400 and "APP_SECRET_KEY" in res.json()["detail"]


def test_stale_publications_marked_failed_on_restart(client):
    conn = database.get_db()
    conn.execute("INSERT INTO publications (id, user_id, job_id, account_id, platform, status) "
                 "VALUES ('p1', 'u', 'j', 'a', 'tiktok', 'processing')")
    conn.commit()
    conn.close()
    assert social.recover_stale_publications() == 1
