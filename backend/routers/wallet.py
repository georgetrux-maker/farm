"""Ví credit: nạp tiền VietQR, lịch sử giao dịch, webhook ngân hàng SePay"""
import hmac
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from backend import config
from backend.auth import get_current_user, require_admin_token
from backend.database import get_user
from backend.services.bank_webhook import handle_sepay_event
from backend.services.wallet import (
    generate_vietqr_deposit, get_transaction, list_transactions, verify_and_credit_transaction, WalletError,
)

log = logging.getLogger("aura")
router = APIRouter()


class DepositRequest(BaseModel):
    amount_vnd: int


@router.post("/api/wallet/deposit")
def api_deposit(req: DepositRequest, user: dict = Depends(get_current_user)):
    """Task 9: Tạo mã VietQR nạp tiền (giao dịch ở trạng thái chờ)"""
    try:
        return generate_vietqr_deposit(user["id"], req.amount_vnd)
    except WalletError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/api/wallet/transactions")
def api_list_transactions(user: dict = Depends(get_current_user)):
    """Lịch sử credit của người dùng đang đăng nhập"""
    return list_transactions(user["id"])


@router.get("/api/wallet/transactions/{transaction_id}")
def api_transaction_status(transaction_id: str, user: dict = Depends(get_current_user)):
    """Frontend hỏi định kỳ để biết tiền đã về chưa"""
    tx = get_transaction(transaction_id, user_id=user["id"])
    if tx is None:
        raise HTTPException(status_code=404, detail="Giao dịch không tồn tại")
    balance = get_user(user["id"])["credits"]
    return {"transaction_id": tx["id"], "status": tx["status"], "amount_vnd": tx["amount_vnd"],
            "credits": tx["amount_credits"], "balance": balance}


class VerifyDepositRequest(BaseModel):
    transaction_id: str


@router.post("/api/admin/wallet/verify", dependencies=[Depends(require_admin_token)])
def api_verify_deposit(req: VerifyDepositRequest):
    """Task 9: Quản trị viên xác nhận đã nhận tiền (Đợt 3 thay bằng webhook ngân hàng)"""
    res = verify_and_credit_transaction(req.transaction_id, confirmed_by="admin-token")
    if res["status"] == "error":
        raise HTTPException(status_code=404, detail=res["message"])
    return res


@router.post("/api/webhooks/sepay", include_in_schema=False)
async def api_sepay_webhook(request: Request):
    expected = config.sepay_webhook_key()
    provided = request.headers.get("authorization", "")
    if not expected or not hmac.compare_digest(provided.encode(), f"Apikey {expected}".encode()):
        raise HTTPException(status_code=401, detail="Sai API key webhook")
    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Body không phải JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Body không hợp lệ")
    res = handle_sepay_event(payload)
    log.info("Webhook SePay %s: %s", payload.get("id"), res)
    # SePay coi phản hồi 200 + success=true là đã nhận, không gửi lại
    return {"success": True, **res}
