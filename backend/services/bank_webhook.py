"""Tự động xác nhận nạp tiền khi ngân hàng báo tiền về (qua SePay).

SePay gửi POST JSON mỗi khi tài khoản có biến động số dư:
https://developer.sepay.vn/en/sepay-webhooks/tich-hop-webhook
Ta tìm mã "NAPTIEN TX..." (nạp credit) hoặc "GOI TX..." (mua gói tháng) trong nội dung chuyển khoản,
đối chiếu số tiền rồi cộng credit hoặc kích hoạt gói.
"""
import json
import logging
import re
import sqlite3

from backend import config
from backend.database import get_db
from backend.services import audit
from backend.services.plans import confirm_payment
from backend.services.wallet import get_transaction

log = logging.getLogger(__name__)

# Ngân hàng hay bỏ dấu cách hoặc đổi chữ hoa/thường trong nội dung chuyển khoản
_TX_PATTERN = re.compile(r"(?:NAPTIEN|GOI)\s*(TX[0-9A-F]{10})", re.IGNORECASE)


def _digits(value) -> str:
    return re.sub(r"\D", "", str(value or ""))


def _record(conn, external_id: str, tx_id, amount, content, result: str, payload: dict) -> bool:
    """Ghi nhận sự kiện; trả False nếu sự kiện này đã được xử lý trước đó."""
    try:
        conn.execute('''
        INSERT INTO bank_events (provider, external_id, transaction_id, amount_vnd, content, result, payload_json)
        VALUES ('sepay', ?, ?, ?, ?, ?, ?)
        ''', (external_id, tx_id, amount, content, result, json.dumps(payload, ensure_ascii=False)[:5000]))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def _classify(payload: dict, content: str, amount: int):
    """Trả (kết quả, mã giao dịch) mà chưa thay đổi gì trong DB."""
    if payload.get("transferType") != "in":
        return "ignored_outgoing", None
    expected_account = _digits(config.bank_account_no())
    if expected_account and _digits(payload.get("accountNumber")) not in ("", expected_account):
        return "ignored_other_account", None
    match = _TX_PATTERN.search(content)
    if not match:
        return "no_matching_code", None
    tx_id = match.group(1).upper()
    tx = get_transaction(tx_id)
    if tx is None or tx["transaction_type"] not in ("deposit", "subscription"):
        return "unknown_transaction", tx_id
    if tx["status"] == "success":
        return "already_credited", tx_id
    if amount < (tx["amount_vnd"] or 0):
        # Chuyển thiếu tiền: không tự cộng, để quản trị viên xử lý
        log.warning("Giao dịch %s chuyển thiếu: nhận %s, cần %s", tx_id, amount, tx["amount_vnd"])
        return "amount_too_low", tx_id
    return "credited", tx_id


def handle_sepay_event(payload: dict) -> dict:
    external_id = str(payload.get("id") or "")
    if not external_id:
        return {"result": "ignored", "reason": "thiếu id"}
    content = str(payload.get("content") or payload.get("description") or "")
    try:
        amount = int(float(payload.get("transferAmount") or 0))
    except (TypeError, ValueError):
        amount = 0

    result, tx_id = _classify(payload, content, amount)
    conn = get_db()
    try:
        # Ghi nhận trước khi cộng tiền: webhook gửi lặp lại sẽ bị chặn ở khóa chính
        if not _record(conn, external_id, tx_id, amount, content, result, payload):
            return {"result": "duplicate"}
    finally:
        conn.close()

    if result == "credited":
        res = confirm_payment(tx_id, confirmed_by="sepay")
        if res["status"] != "success":
            result = res["status"]
        elif res.get("subscription_id"):
            result = "plan_activated"
            audit.record(None, "plan.auto", tx_id, f"Gói {res['plan_name']}")
        else:
            audit.record(None, "deposit.auto", tx_id, f"+{res['credits_added']} credit")
    return {"result": result, "transaction_id": tx_id}
