import urllib.parse
import uuid

from backend import config
from backend.database import get_db


class WalletError(ValueError):
    pass


def generate_vietqr_deposit(user_id: str, amount_vnd: int) -> dict:
    """
    Task 9: Tạo mã VietQR nạp tiền. Tỉ lệ: 100đ = 1 credit.
    Giao dịch ở trạng thái 'pending' cho tới khi được xác nhận đã nhận tiền
    (hiện tại do quản trị viên xác nhận; Đợt 3 sẽ dùng webhook ngân hàng).
    """
    if not isinstance(amount_vnd, int) or not (config.MIN_DEPOSIT_VND <= amount_vnd <= config.MAX_DEPOSIT_VND):
        raise WalletError(
            f"Số tiền nạp phải từ {config.MIN_DEPOSIT_VND:,}đ đến {config.MAX_DEPOSIT_VND:,}đ".replace(",", ".")
        )
    if amount_vnd % config.VND_PER_CREDIT:
        raise WalletError(f"Số tiền nạp phải là bội số của {config.VND_PER_CREDIT}đ")
    account_no = config.bank_account_no()
    if not account_no:
        raise WalletError("Máy chủ chưa cấu hình tài khoản nhận tiền (VIETQR_ACCOUNT_NO)")

    tx_id = f"TX{uuid.uuid4().hex[:10].upper()}"
    credits_awarded = amount_vnd // config.VND_PER_CREDIT
    # Nội dung chuyển khoản chỉ gồm chữ và số để ngân hàng không cắt bớt
    description = f"NAPTIEN {tx_id}"
    query = urllib.parse.urlencode({
        "amount": amount_vnd,
        "addInfo": description,
        "accountName": config.bank_account_name(),
    })
    qr_url = f"https://img.vietqr.io/image/{config.bank_id()}-{account_no}-compact2.png?{query}"

    conn = get_db()
    conn.execute('''
    INSERT INTO wallet_transactions (id, user_id, amount_credits, amount_vnd, transaction_type, description, qr_code_ref, status)
    VALUES (?, ?, ?, ?, 'deposit', ?, ?, 'pending')
    ''', (tx_id, user_id, credits_awarded, amount_vnd, description, qr_url))
    conn.commit()
    conn.close()

    return {
        "status": "pending",
        "transaction_id": tx_id,
        "amount_vnd": amount_vnd,
        "credits_awarded": credits_awarded,
        "qr_code_url": qr_url,
        "bank_id": config.bank_id(),
        "account_number": account_no,
        "account_holder": config.bank_account_name(),
        "transfer_content": description,
    }


def get_transaction(transaction_id: str, user_id: str = None):
    conn = get_db()
    if user_id is None:
        row = conn.execute("SELECT * FROM wallet_transactions WHERE id = ?", (transaction_id,)).fetchone()
    else:
        row = conn.execute("SELECT * FROM wallet_transactions WHERE id = ? AND user_id = ?",
                           (transaction_id, user_id)).fetchone()
    conn.close()
    return dict(row) if row else None


def list_transactions(user_id: str, limit: int = 30) -> list:
    """Lịch sử credit (nạp, trừ khi tạo video, hoàn), mới nhất trước.

    Lệnh nạp chưa thanh toán chỉ hiện trong 24 giờ để các mã QR bỏ dở không làm rối danh sách.
    """
    conn = get_db()
    rows = conn.execute('''
    SELECT id, amount_credits, amount_vnd, transaction_type, description, status, created_at
    FROM wallet_transactions
    WHERE user_id = ? AND (status = 'success' OR created_at >= datetime('now', '-1 day'))
    ORDER BY created_at DESC, rowid DESC
    LIMIT ?
    ''', (user_id, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def wallet_summary(user_id: str) -> dict:
    """Tổng đã nạp (tiền và credit), đã dùng để tạo video, được hoàn và được quản trị viên điều chỉnh."""
    conn = get_db()
    try:
        row = conn.execute('''
        SELECT
          COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount_vnd END), 0),
          COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount_credits END), 0),
          COALESCE(-SUM(CASE WHEN transaction_type = 'usage' THEN amount_credits END), 0),
          COALESCE(SUM(CASE WHEN transaction_type = 'refund' THEN amount_credits END), 0),
          COALESCE(SUM(CASE WHEN transaction_type = 'adjust' THEN amount_credits END), 0)
        FROM wallet_transactions WHERE user_id = ? AND status = 'success'
        ''', (user_id,)).fetchone()
    finally:
        conn.close()
    return {"deposited_vnd": row[0], "deposited_credits": row[1], "used_credits": row[2],
            "refunded_credits": row[3], "adjusted_credits": row[4]}


def verify_and_credit_transaction(transaction_id: str, confirmed_by: str = "admin") -> dict:
    """Xác nhận đã nhận tiền và cộng credit. Chỉ gọi từ luồng quản trị/webhook đã xác thực.

    confirmed_by ghi lại nguồn xác nhận ("sepay", "admin:<user_id>", "cli") để đối soát.
    """
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")
        tx = cursor.execute(
            "SELECT * FROM wallet_transactions WHERE id = ? AND transaction_type = 'deposit'",
            (transaction_id,)).fetchone()
        if not tx:
            conn.rollback()
            return {"status": "error", "message": "Giao dịch không tồn tại"}

        # Chỉ chuyển sang success đúng một lần, kể cả khi bị gọi đồng thời.
        # Lệnh đã hủy vẫn duyệt được: khách có thể chuyển tiền sau khi quản trị viên hủy.
        cursor.execute("UPDATE wallet_transactions SET status = 'success', confirmed_at = CURRENT_TIMESTAMP, "
                       "confirmed_by = ? WHERE id = ? AND status IN ('pending', 'cancelled')",
                       (confirmed_by[:64], transaction_id))
        if cursor.rowcount == 0:
            conn.rollback()
            return {"status": "already_processed", "message": "Giao dịch đã được ghi nhận trước đó"}

        cursor.execute("UPDATE users SET credits = credits + ? WHERE id = ?", (tx["amount_credits"], tx["user_id"]))
        new_balance = cursor.execute("SELECT credits FROM users WHERE id = ?", (tx["user_id"],)).fetchone()[0]
        conn.commit()
    finally:
        conn.close()

    return {
        "status": "success",
        "transaction_id": transaction_id,
        "credits_added": tx["amount_credits"],
        "new_balance": new_balance,
    }


def deduct_credits(user_id: str, amount_credits: int, description: str = "Tạo video AI", conn=None) -> dict:
    """Trừ credit nguyên tử: không bao giờ để số dư âm, kể cả khi nhiều request chạy song song.

    Nếu truyền `conn`, thao tác nằm trong transaction của người gọi (người gọi tự commit).
    """
    if amount_credits <= 0:
        raise WalletError("Số credit cần trừ phải lớn hơn 0")
    own_conn = conn is None
    conn = conn or get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?",
                       (amount_credits, user_id, amount_credits))
        if cursor.rowcount == 0:
            if own_conn:
                conn.rollback()
            return {"status": "error", "message": "Không đủ số dư credits"}

        tx_id = f"USE_{uuid.uuid4().hex[:10].upper()}"
        cursor.execute('''
        INSERT INTO wallet_transactions (id, user_id, amount_credits, transaction_type, description, status)
        VALUES (?, ?, ?, 'usage', ?, 'success')
        ''', (tx_id, user_id, -amount_credits, description))
        remaining = cursor.execute("SELECT credits FROM users WHERE id = ?", (user_id,)).fetchone()[0]
        if own_conn:
            conn.commit()
    finally:
        if own_conn:
            conn.close()

    return {"status": "success", "deducted": amount_credits, "remaining_credits": remaining}


def refund_credits(user_id: str, amount_credits: int, description: str, conn) -> None:
    """Hoàn credit trong transaction của người gọi."""
    conn.execute("UPDATE users SET credits = credits + ? WHERE id = ?", (amount_credits, user_id))
    conn.execute('''
    INSERT INTO wallet_transactions (id, user_id, amount_credits, transaction_type, description, status)
    VALUES (?, ?, ?, 'refund', ?, 'success')
    ''', (f"REF_{uuid.uuid4().hex[:10].upper()}", user_id, amount_credits, description))


def cancel_deposit(transaction_id: str, admin_id: str) -> bool:
    """Hủy lệnh nạp đang chờ (mã QR bỏ dở, nạp nhầm). Trả False nếu không còn ở trạng thái chờ."""
    conn = get_db()
    try:
        cur = conn.execute("UPDATE wallet_transactions SET status = 'cancelled', confirmed_at = CURRENT_TIMESTAMP, "
                           "confirmed_by = ? WHERE id = ? AND transaction_type = 'deposit' AND status = 'pending'",
                           (f"admin:{admin_id}"[:64], transaction_id))
        conn.commit()
        return cur.rowcount == 1
    finally:
        conn.close()


def adjust_credits(user_id: str, delta: int, reason: str) -> dict:
    """Quản trị viên cộng (delta > 0) hoặc trừ (delta < 0) credit, ghi vào lịch sử ví của khách."""
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")
        if delta < 0:
            cursor.execute("UPDATE users SET credits = credits + ? WHERE id = ? AND credits + ? >= 0",
                           (delta, user_id, delta))
        else:
            cursor.execute("UPDATE users SET credits = credits + ? WHERE id = ?", (delta, user_id))
        if cursor.rowcount == 0:
            conn.rollback()
            exists = conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone()
            raise WalletError("Số dư không đủ để trừ" if exists else "Tài khoản không tồn tại")
        cursor.execute(
            "INSERT INTO wallet_transactions (id, user_id, amount_credits, transaction_type, description, status) "
            "VALUES (?, ?, ?, 'adjust', ?, 'success')",
            (f"ADJ{uuid.uuid4().hex[:10].upper()}", user_id, delta, f"Điều chỉnh bởi quản trị viên: {reason}"))
        balance = cursor.execute("SELECT credits FROM users WHERE id = ?", (user_id,)).fetchone()[0]
        conn.commit()
    finally:
        conn.close()
    return {"status": "success", "new_balance": balance}
