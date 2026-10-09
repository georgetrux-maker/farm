import uuid
from backend.database import get_db

BANK_ID = "MB"          # MBBank (Ngân hàng Quân Đội)
ACCOUNT_NO = "0987654321"
ACCOUNT_NAME = "AURA FASHION AI"

def generate_vietqr_deposit(user_id: str, amount_vnd: int) -> dict:
    """
    Task 9: Hệ Thống Ví & Nạp Credits Tự Động (VietQR & Wallet Engine)
    Tạo link mã VietQR chuẩn NAPAS để quét mã nạp tiền tự động.
    Tỉ lệ: 100.000đ = 1.000 Credits.
    """
    conn = get_db()
    cursor = conn.cursor()

    tx_id = f"TX_{uuid.uuid4().hex[:8].upper()}"
    credits_awarded = int((amount_vnd / 100000) * 1000)
    description = f"NAPTIEN {tx_id}"

    # Standard VietQR QuickLink format
    # https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-compact2.png?amount=<AMOUNT>&addInfo=<DESC>&accountName=<NAME>
    qr_url = f"https://img.vietqr.io/image/{BANK_ID}-{ACCOUNT_NO}-compact2.png?amount={amount_vnd}&addInfo={description}&accountName={ACCOUNT_NAME.replace(' ', '%20')}"

    cursor.execute('''
    INSERT INTO wallet_transactions (id, user_id, amount_credits, transaction_type, description, qr_code_ref, status)
    VALUES (?, ?, ?, 'deposit', ?, ?, 'pending')
    ''', (tx_id, user_id, credits_awarded, description, qr_url))

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "transaction_id": tx_id,
        "amount_vnd": amount_vnd,
        "credits_awarded": credits_awarded,
        "qr_code_url": qr_url,
        "bank_name": "MBBank",
        "account_number": ACCOUNT_NO,
        "account_holder": ACCOUNT_NAME,
        "transfer_content": description
    }

def verify_and_credit_transaction(transaction_id: str) -> dict:
    """Xác nhận giao dịch và cộng credits vào ví người dùng"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM wallet_transactions WHERE id = ?", (transaction_id,))
    tx = cursor.fetchone()
    if not tx:
        conn.close()
        return {"status": "error", "message": "Giao dịch không tồn tại"}

    if tx["status"] == "success":
        conn.close()
        return {"status": "already_processed", "message": "Giao dịch đã được ghi nhận trước đó"}

    # Update transaction status
    cursor.execute("UPDATE wallet_transactions SET status = 'success' WHERE id = ?", (transaction_id,))
    # Credit to user
    cursor.execute("UPDATE users SET credits = credits + ? WHERE id = ?", (tx["amount_credits"], tx["user_id"]))
    
    cursor.execute("SELECT credits FROM users WHERE id = ?", (tx["user_id"],))
    new_balance = cursor.fetchone()[0]

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "transaction_id": transaction_id,
        "credits_added": tx["amount_credits"],
        "new_balance": new_balance
    }

def deduct_credits(user_id: str, amount_credits: int, description: str = "Tạo video AI") -> dict:
    """Trừ credits khi render video hoặc gọi AI pipeline"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT credits FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row or row[0] < amount_credits:
        conn.close()
        return {"status": "error", "message": "Không đủ số dư credits"}

    new_credits = row[0] - amount_credits
    cursor.execute("UPDATE users SET credits = ? WHERE id = ?", (new_credits, user_id))
    
    tx_id = f"USE_{uuid.uuid4().hex[:8].upper()}"
    cursor.execute('''
    INSERT INTO wallet_transactions (id, user_id, amount_credits, transaction_type, description, status)
    VALUES (?, ?, ?, 'usage', ?, 'success')
    ''', (tx_id, user_id, -amount_credits, description))

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "deducted": amount_credits,
        "remaining_credits": new_credits
    }
