"""Trang Admin: phân quyền, lưu key mã hóa Fernet, kiểm tra giá trị, kiểm tra kết nối, doanh thu, duyệt nạp tay."""
import sqlite3
from datetime import datetime

import anthropic
import httpx
import pytest

from backend import config, crypto_utils, database
from backend.services import provider_check
from backend.tests.conftest import DEMO_AUTH, dress_png_bytes

CLAUDE_KEY = "sk-ant-api03-" + "k" * 40 + "8f2a"


@pytest.fixture()
def secret(monkeypatch):
    monkeypatch.setenv("APP_SECRET_KEY", "s" * 40)
    for name in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"):
        monkeypatch.delenv(name, raising=False)


def _settings(client) -> dict:
    res = client.get("/api/admin/api-keys", headers=DEMO_AUTH)
    assert res.status_code == 200
    return {s["key"]: s for s in res.json()["settings"]}


def _save(client, payload):
    return client.post("/api/admin/api-keys", headers=DEMO_AUTH, json=payload)


def _stored_keys() -> list:
    conn = sqlite3.connect(config.db_path())
    try:
        return sorted(r[0] for r in conn.execute("SELECT key FROM admin_api_configs"))
    finally:
        conn.close()


def test_admin_endpoints_reject_normal_shop(client, shop):
    h = shop["headers"]
    assert client.get("/api/admin/api-keys", headers=h).status_code == 403
    assert client.post("/api/admin/api-keys", headers=h, json={"pipeline_cost_credits": 1}).status_code == 403
    assert client.post("/api/admin/api-keys/test", headers=h, json={"provider": "anthropic"}).status_code == 403
    assert client.get("/api/admin/stats-overview", headers=h).status_code == 403
    assert client.get("/api/admin/deposits", headers=h).status_code == 403
    assert client.post("/api/admin/deposits/TX1/verify", headers=h).status_code == 403
    assert client.patch("/api/avatars/model_01", headers=h, json={"name": "X"}).status_code == 403
    assert client.get("/api/admin/api-keys").status_code == 401


def test_keys_are_encrypted_in_db_and_masked(client, secret):
    res = _save(client, {"anthropic_api_key": CLAUDE_KEY})
    assert res.status_code == 200 and res.json()["saved"] == ["anthropic_api_key"]

    item = _settings(client)["anthropic_api_key"]
    assert item["configured"] and item["source"] == "admin"
    assert CLAUDE_KEY not in str(item) and item["value"].endswith("8f2a")

    conn = sqlite3.connect(config.db_path())
    raw = conn.execute("SELECT value_enc FROM admin_api_configs WHERE key = 'anthropic_api_key'").fetchone()[0]
    conn.close()
    assert CLAUDE_KEY not in raw and crypto_utils.decrypt(raw) == CLAUDE_KEY
    assert config.anthropic_api_key() == CLAUDE_KEY and config.anthropic_enabled()

    # Gửi lại bản đã che = không đổi; để trống = xóa, quay về .env (đang trống)
    assert _save(client, {"anthropic_api_key": item["value"]}).json()["saved"] == []
    assert config.anthropic_api_key() == CLAUDE_KEY
    assert _save(client, {"anthropic_api_key": ""}).json()["saved"] == ["anthropic_api_key"]
    assert config.anthropic_api_key() == "" and not config.anthropic_enabled()


def test_claude_client_uses_key_saved_in_admin(client, secret, monkeypatch):
    _save(client, {"anthropic_api_key": CLAUDE_KEY})
    seen = {}

    class FakeAnthropic:
        def __init__(self, **kwargs):
            seen.update(kwargs)

    monkeypatch.setattr(anthropic, "Anthropic", FakeAnthropic)
    from backend.ai import claude_client
    claude_client._client()
    assert seen["api_key"] == CLAUDE_KEY


def test_saving_one_field_does_not_freeze_env_values(client, secret, monkeypatch):
    assert _save(client, {"pipeline_cost_credits": 45}).status_code == 200
    assert _stored_keys() == ["pipeline_cost_credits"]
    assert config.pipeline_cost_credits() == 45

    monkeypatch.setenv("VIETQR_ACCOUNT_NO", "999888777")
    assert config.bank_account_no() == "999888777"
    settings = _settings(client)
    assert settings["vietqr_account_no"]["source"] == "env"
    assert settings["pipeline_cost_credits"]["source"] == "admin"


@pytest.mark.parametrize("payload, word", [
    ({"pipeline_cost_credits": 0}, "Giá mỗi video"),
    ({"pipeline_cost_credits": -5}, "Giá mỗi video"),
    ({"pipeline_cost_credits": "abc"}, "Giá mỗi video"),
    ({"anthropic_model": "gpt-4"}, "Model"),
    ({"vietqr_account_no": "12ab"}, "Số tài khoản"),
    ({"tryon_preview_cost_credits": 999}, "Phí thử đồ"),
    ({"bat_ky_gi": "x"}, "Không có mục"),
])
def test_validation_rejects_bad_values(client, secret, payload, word):
    res = _save(client, payload)
    assert res.status_code == 400 and word in res.json()["detail"]
    assert _stored_keys() == []


def test_account_name_is_normalised_for_vietqr(client, secret):
    assert _save(client, {"vietqr_account_name": "  Nguyễn Văn Đức "}).status_code == 200
    assert config.bank_account_name() == "NGUYEN VAN DUC"


def test_save_without_app_secret_key_explains(client, monkeypatch):
    monkeypatch.delenv("APP_SECRET_KEY", raising=False)
    assert client.get("/api/admin/api-keys", headers=DEMO_AUTH).json()["secret_key_ready"] is False
    res = _save(client, {"pipeline_cost_credits": 40})
    assert res.status_code == 400 and "APP_SECRET_KEY" in res.json()["detail"]


def test_connection_test_uses_the_key_just_typed(client, secret, monkeypatch):
    _save(client, {"anthropic_api_key": CLAUDE_KEY})
    seen = []
    monkeypatch.setattr(provider_check, "check_anthropic",
                        lambda key, model: seen.append((key, model)) or {"ok": True, "status": "ok", "message": "ok"})
    url = "/api/admin/api-keys/test"
    client.post(url, headers=DEMO_AUTH, json={"provider": "anthropic", "values": {"anthropic_api_key": "sk-moi-go"}})
    masked = _settings(client)["anthropic_api_key"]["value"]
    client.post(url, headers=DEMO_AUTH, json={"provider": "anthropic", "values": {"anthropic_api_key": masked,
                                                                                    "anthropic_model": "claude-sonnet-5-5"}})
    assert seen == [("sk-moi-go", "claude-opus-5-5"), (CLAUDE_KEY, "claude-sonnet-5-5")]
    assert client.post(url, headers=DEMO_AUTH, json={"provider": "khong-co"}).status_code == 422


def _api_error(cls, status, message="error"):
    response = httpx.Response(status, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))
    return cls(message, response=response, body=None)


@pytest.mark.parametrize("error, status", [
    (None, "ok"),
    (_api_error(anthropic.AuthenticationError, 401), "invalid_key"),
    (_api_error(anthropic.APIStatusError, 402, "billing_error"), "no_credit"),
    (_api_error(anthropic.BadRequestError, 400, "Your credit balance is too low to access the API"), "no_credit"),
    (_api_error(anthropic.NotFoundError, 404), "error"),
])
def test_anthropic_check_explains_result(monkeypatch, error, status):
    class FakeClient:
        def __init__(self, **kwargs):
            self.models = self
            self.messages = self

        def retrieve(self, model):
            return {"id": model}

        def create(self, **kwargs):
            if error:
                raise error

    monkeypatch.setattr(provider_check.anthropic, "Anthropic", FakeClient)
    assert provider_check.check_anthropic("sk-ant", "claude-opus-5-5")["status"] == status


@pytest.mark.parametrize("responses, status", [
    ({"/v1/credits": (200, {"credits": {"total": 120, "subscription": 100, "on_demand": 20}})}, "ok"),
    ({"/v1/credits": (200, {"credits": {"total": 0}})}, "no_credit"),
    ({"/v1/credits": (401, {"error": "Unauthorized"})}, "invalid_key"),
    ({"/v1/credits": (404, {}), "/v1/status/kiem-tra-ket-noi": (404, {})}, "ok"),
    ({"/v1/credits": (404, {}), "/v1/status/kiem-tra-ket-noi": (401, {})}, "invalid_key"),
])
def test_fashn_check_reads_credit_balance(monkeypatch, responses, status):
    def handler(request):
        code, body = responses[request.url.path]
        return httpx.Response(code, json=body)

    real_client = httpx.Client
    monkeypatch.setattr(provider_check.httpx, "Client",
                        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    assert provider_check.check_fashn("fa-key")["status"] == status


def test_period_starts_use_vietnam_time():
    from backend.routers.admin import _period_starts
    # 18:30 UTC ngày 10/10/2026 = 01:30 Chủ nhật 11/10 giờ Việt Nam
    starts = _period_starts(datetime(2026, 10, 10, 18, 30))
    assert starts == {"today": "2026-10-10 17:00:00", "week": "2026-10-04 17:00:00", "month": "2026-09-30 17:00:00"}


def _insert_tx(tx_id, user_id, vnd, status, ttype="deposit", age="-1 minutes"):
    conn = database.get_db()
    conn.execute("INSERT INTO wallet_transactions (id, user_id, amount_credits, amount_vnd, transaction_type, "
                 "description, qr_code_ref, status, created_at, confirmed_at) "
                 "VALUES (?, ?, ?, ?, ?, '', ?, ?, datetime('now', ?), CASE WHEN ? = 'success' THEN datetime('now', ?) END)",
                 (tx_id, user_id, vnd // 100 if vnd else -30, vnd, ttype, f"NAPTIEN {tx_id}", status, age, status, age))
    conn.commit()
    conn.close()


def test_stats_overview_revenue_by_period(client, shop):
    _insert_tx("TXTODAY", shop["id"], 200_000, "success")
    _insert_tx("TXOLD", shop["id"], 100_000, "success", age="-40 days")
    _insert_tx("TXWAIT", shop["id"], 50_000, "pending")
    _insert_tx("TXUSE", shop["id"], None, "success", ttype="usage")
    summary = client.get("/api/admin/stats-overview", headers=DEMO_AUTH).json()["summary"]
    assert summary["revenue_vnd"]["total"] == 300_000
    assert summary["revenue_vnd"]["month"] == 200_000 and summary["revenue_vnd"]["today"] == 200_000
    assert summary["pending_deposits"] == 1
    assert summary["new_shops"]["total"] >= 1


def test_deposit_list_and_manual_verify(client, shop):
    dep = client.post("/api/wallet/deposit", headers=shop["headers"], json={"amount_vnd": 50_000}).json()
    _insert_tx("TXUSE", shop["id"], None, "success", ttype="usage")

    pending = client.get("/api/admin/deposits", headers=DEMO_AUTH).json()
    assert [d["id"] for d in pending["items"]] == [dep["transaction_id"]] and pending["total"] == 1
    assert pending["items"][0]["transfer_content"] == f"NAPTIEN {dep['transaction_id']}"
    code = dep["transaction_id"][2:8]
    assert client.get(f"/api/admin/deposits?q=NAPTIEN%20TX{code}", headers=DEMO_AUTH).json()["total"] == 1
    assert client.get("/api/admin/deposits?status=all&q=shop@test", headers=DEMO_AUTH).json()["total"] == 1
    assert client.get("/api/admin/deposits?status=all&q=khong-ai-ca", headers=DEMO_AUTH).json()["total"] == 0

    res = client.post(f"/api/admin/deposits/{dep['transaction_id']}/verify", headers=DEMO_AUTH)
    assert res.status_code == 200 and res.json()["credits_added"] == 500
    assert database.get_user(shop["id"])["credits"] == 600
    again = client.post(f"/api/admin/deposits/{dep['transaction_id']}/verify", headers=DEMO_AUTH).json()
    assert again["status"] == "already_processed" and database.get_user(shop["id"])["credits"] == 600
    done = client.get("/api/admin/deposits?status=success", headers=DEMO_AUTH).json()["items"][0]
    assert done["confirmed_by"] == f"admin:{database.DEMO_USER_ID}" and done["confirmed_at"]
    assert client.post("/api/admin/deposits/KHONGCO/verify", headers=DEMO_AUTH).status_code == 404


def test_admin_can_change_model_photo(client):
    up = client.post("/api/uploads/image", headers=DEMO_AUTH,
                     files={"file": ("mau.png", dress_png_bytes(), "image/png")}).json()
    res = client.patch("/api/avatars/model_01", headers=DEMO_AUTH, json={"avatar_url": up["media_url"]})
    assert res.status_code == 200 and res.json()["avatar_url"] == up["media_url"]
    avatars = {a["id"]: a for a in client.get("/api/avatars").json()}
    assert avatars["model_01"]["avatar_url"] == up["media_url"]
    assert client.patch("/api/avatars/khong-co", headers=DEMO_AUTH, json={"name": "A"}).status_code == 404
