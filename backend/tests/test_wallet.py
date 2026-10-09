import threading

from backend.services.wallet import deduct_credits
from backend.tests.conftest import DEMO_AUTH

ADMIN = {"X-Admin-Token": "admin-secret"}


def _balance(client, headers):
    return client.get("/api/user/profile", headers=headers).json()["credits"]


def test_deposit_validates_amount(client):
    for amount in (-500000, 0, 5000, 100_000_000, 100050):
        res = client.post("/api/wallet/deposit", headers=DEMO_AUTH, json={"amount_vnd": amount})
        assert res.status_code == 400, amount


def test_deposit_creates_pending_qr(client):
    res = client.post("/api/wallet/deposit", headers=DEMO_AUTH, json={"amount_vnd": 200000})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "pending"
    assert body["credits_awarded"] == 2000
    assert "img.vietqr.io" in body["qr_code_url"] and "0123456789" in body["qr_code_url"]
    tx = client.get(f"/api/wallet/transactions/{body['transaction_id']}", headers=DEMO_AUTH).json()
    assert tx["status"] == "pending"


def test_user_cannot_confirm_own_deposit(client):
    before = _balance(client, DEMO_AUTH)
    tx = client.post("/api/wallet/deposit", headers=DEMO_AUTH, json={"amount_vnd": 100000}).json()
    for headers in ({}, DEMO_AUTH, {"X-Admin-Token": "sai"}):
        res = client.post("/api/admin/wallet/verify", headers=headers, json={"transaction_id": tx["transaction_id"]})
        assert res.status_code == 403
    assert _balance(client, DEMO_AUTH) == before


def test_admin_confirm_credits_exactly_once(client):
    before = _balance(client, DEMO_AUTH)
    tx = client.post("/api/wallet/deposit", headers=DEMO_AUTH, json={"amount_vnd": 100000}).json()
    first = client.post("/api/admin/wallet/verify", headers=ADMIN, json={"transaction_id": tx["transaction_id"]})
    second = client.post("/api/admin/wallet/verify", headers=ADMIN, json={"transaction_id": tx["transaction_id"]})
    assert first.json()["status"] == "success"
    assert second.json()["status"] == "already_processed"
    assert _balance(client, DEMO_AUTH) == before + 1000


def test_users_cannot_read_others_transactions(client, shop):
    tx = client.post("/api/wallet/deposit", headers=DEMO_AUTH, json={"amount_vnd": 100000}).json()
    assert client.get(f"/api/wallet/transactions/{tx['transaction_id']}", headers=shop["headers"]).status_code == 404


def test_concurrent_deductions_never_go_negative(client, shop):
    # shop có 100 credit: 10 luồng cùng trừ 30 thì chỉ đúng 3 lần thành công
    results = []
    threads = [threading.Thread(target=lambda: results.append(deduct_credits(shop["id"], 30)["status"]))
               for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert results.count("success") == 3
    assert _balance(client, shop["headers"]) == 10
