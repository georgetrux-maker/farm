"""Nhật ký hệ thống: ghi lại thao tác của quản trị viên và các lần xác nhận tiền về."""
import json
import logging
from typing import Optional

from backend.database import get_db

log = logging.getLogger("aura")

ACTION_LABELS = {
    "settings.update": "Đổi cài đặt API & hệ thống",
    "deposit.verify": "Duyệt tay lệnh nạp tiền",
    "deposit.auto": "SePay xác nhận tiền về",
    "deposit.cancel": "Hủy lệnh nạp tiền",
    "user.credits": "Điều chỉnh credit",
    "user.lock": "Khóa tài khoản",
    "user.unlock": "Mở khóa tài khoản",
    "avatar.create": "Thêm người mẫu AI",
    "avatar.update": "Sửa người mẫu AI",
    "avatar.default": "Đổi người mẫu mặc định",
}


def record(actor: Optional[dict], action: str, target: str = None, detail=None) -> None:
    """actor None = hệ thống (vd webhook SePay). Ghi nhật ký lỗi thì chỉ log, không làm hỏng thao tác chính."""
    if isinstance(detail, (dict, list)):
        detail = json.dumps(detail, ensure_ascii=False)
    try:
        conn = get_db()
        try:
            conn.execute("INSERT INTO audit_logs (actor_id, actor_name, action, target, detail) VALUES (?, ?, ?, ?, ?)",
                         (actor["id"] if actor else None, actor["name"] if actor else "Hệ thống", action, target,
                          (detail or "")[:1000]))
            conn.commit()
        finally:
            conn.close()
    except Exception:
        log.exception("Không ghi được nhật ký %s", action)


def list_logs(page: int = 1, page_size: int = 30, action: str = None, q: str = None) -> dict:
    where, args = [], []
    if action:
        where.append("action = ?")
        args.append(action)
    if q and q.strip():
        like = "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append("(actor_name LIKE ? ESCAPE '\\' OR target LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\')")
        args += [like] * 3
    sql_where = ("WHERE " + " AND ".join(where)) if where else ""
    conn = get_db()
    try:
        total = conn.execute(f"SELECT COUNT(*) FROM audit_logs {sql_where}", args).fetchone()[0]
        rows = conn.execute(f"SELECT * FROM audit_logs {sql_where} ORDER BY id DESC LIMIT ? OFFSET ?",
                            args + [page_size, (page - 1) * page_size]).fetchall()
    finally:
        conn.close()
    items = [{**dict(r), "action_label": ACTION_LABELS.get(r["action"], r["action"])} for r in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size, "has_more": page * page_size < total}
