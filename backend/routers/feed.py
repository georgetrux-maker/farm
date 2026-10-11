"""Feed video của Aura: shop chọn video nào hiện công khai; ai cũng xem được, đăng nhập thì thích/lưu được."""
import json
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from backend import config
from backend.auth import get_current_user, optional_user
from backend.database import get_db
from backend.services.security import check_rate_limit

router = APIRouter()

_FEED_SQL = """
SELECT j.id, j.output_video_url, j.output_image_url, COALESCE(j.views, 0) AS views, j.feed_at, j.script_json,
       u.id AS shop_id, u.name AS shop_name,
       p.id AS product_id, p.title, p.price, p.original_price, p.sizes, p.product_url, p.tryon_enabled,
       p.image_url AS product_image_url,
       (SELECT COUNT(*) FROM feed_reactions r WHERE r.job_id = j.id AND r.kind = 'like') AS likes,
       (SELECT COUNT(*) FROM feed_reactions r WHERE r.job_id = j.id AND r.kind = 'save') AS saves
FROM ai_jobs j
JOIN products p ON p.id = j.product_id
JOIN users u ON u.id = j.user_id
WHERE j.feed_visible = 1 AND j.status = 'completed' AND j.output_video_url IS NOT NULL
  AND COALESCE(p.archived, 0) = 0 AND COALESCE(u.disabled, 0) = 0
"""


def _reactions(conn, user: Optional[dict], job_ids: list) -> set:
    if not user or not job_ids:
        return set()
    marks = ",".join("?" * len(job_ids))
    rows = conn.execute(f"SELECT job_id, kind FROM feed_reactions WHERE user_id = ? AND job_id IN ({marks})",
                        [user["id"], *job_ids]).fetchall()
    return {(r[0], r[1]) for r in rows}


def _item(row, mine: set) -> dict:
    script = json.loads(row["script_json"]) if row["script_json"] else {}
    return {
        "id": row["id"],
        "video_url": row["output_video_url"],
        "poster_url": row["output_image_url"] or row["product_image_url"],
        "caption": script.get("post_caption") or script.get("hook") or "",
        "hashtags": (script.get("hashtags") or [])[:6],
        "shop": {"id": row["shop_id"], "name": row["shop_name"]},
        "product": {
            "id": row["product_id"], "title": row["title"], "price": row["price"],
            "original_price": row["original_price"], "image_url": row["product_image_url"],
            "sizes": [s for s in (row["sizes"] or "").split(",") if s],
            "product_url": row["product_url"], "tryon_enabled": bool(row["tryon_enabled"]),
        },
        "views": row["views"], "likes": row["likes"], "saves": row["saves"],
        "liked": (row["id"], "like") in mine, "saved": (row["id"], "save") in mine,
        "published_at": row["feed_at"],
    }


def _query(sql_tail: str, args: list, user: Optional[dict]) -> list:
    conn = get_db()
    try:
        rows = conn.execute(_FEED_SQL + sql_tail, args).fetchall()
        mine = _reactions(conn, user, [r["id"] for r in rows])
    finally:
        conn.close()
    return [_item(r, mine) for r in rows]


@router.get("/api/feed")
def api_feed(page: int = Query(1, ge=1, le=1000), page_size: int = Query(10, ge=1, le=30),
             shop_id: Optional[str] = Query(None, max_length=40),
             sort: Literal["new", "top"] = Query("new", description="new = mới nhất; top = xu hướng (xem, thích, lưu nhiều)"),
             user: Optional[dict] = Depends(optional_user)):
    """Mặc định video mới nhất trước. Không cần đăng nhập; đã đăng nhập thì biết mình đã thích/lưu video nào."""
    tail, args = "", []
    if shop_id:
        tail, args = " AND u.id = ?", [shop_id]
    order = (" ORDER BY (COALESCE(j.views, 0) + 5 * likes + 8 * saves) DESC, j.feed_at DESC, j.rowid DESC"
             if sort == "top" else " ORDER BY j.feed_at DESC, j.rowid DESC")
    items = _query(tail + order + " LIMIT ? OFFSET ?", args + [page_size + 1, (page - 1) * page_size], user)
    return {"items": items[:page_size], "page": page, "has_more": len(items) > page_size}


@router.get("/api/feed/info")
def api_feed_info():
    """Thông tin công khai cho trang giới thiệu: ảnh thử đồ tự xóa sau bao lâu, mỗi người thử được mấy lần/ngày."""
    return {"photo_hours": config.buyer_photo_hours(), "daily_limit": config.buyer_tryon_daily_limit()}


@router.get("/api/feed/saved")
def api_feed_saved(user: dict = Depends(get_current_user)):
    items = _query(" AND j.id IN (SELECT job_id FROM feed_reactions WHERE user_id = ? AND kind = 'save') "
                   "ORDER BY j.feed_at DESC LIMIT 100", [user["id"]], user)
    return {"items": items}


@router.get("/api/feed/{job_id}")
def api_feed_item(job_id: str, user: Optional[dict] = Depends(optional_user)):
    """Một video (link chia sẻ)."""
    items = _query(" AND j.id = ?", [job_id], user)
    if not items:
        raise HTTPException(status_code=404, detail="Video không còn trên feed")
    return items[0]


def _visible(conn, job_id: str) -> bool:
    return conn.execute("SELECT 1 FROM ai_jobs WHERE id = ? AND feed_visible = 1 AND status = 'completed'",
                        (job_id,)).fetchone() is not None


@router.post("/api/feed/{job_id}/view")
def api_feed_view(job_id: str, request: Request):
    """Đếm một lượt xem. Cùng một máy xem lại trong 10 phút không tính thêm."""
    ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"feed-view:{ip}:{job_id}", max_requests=1, window_sec=600)["allowed"]:
        return {"counted": False}
    conn = get_db()
    try:
        cur = conn.execute("UPDATE ai_jobs SET views = COALESCE(views, 0) + 1 WHERE id = ? AND feed_visible = 1 "
                           "AND status = 'completed'", (job_id,))
        conn.commit()
    finally:
        conn.close()
    return {"counted": cur.rowcount == 1}


class ReactionRequest(BaseModel):
    active: bool


@router.put("/api/feed/{job_id}/reactions/{kind}")
def api_feed_react(job_id: str, kind: Literal["like", "save"], req: ReactionRequest, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        if not _visible(conn, job_id):
            raise HTTPException(status_code=404, detail="Video không còn trên feed")
        if req.active:
            conn.execute("INSERT OR IGNORE INTO feed_reactions (job_id, user_id, kind) VALUES (?, ?, ?)",
                         (job_id, user["id"], kind))
        else:
            conn.execute("DELETE FROM feed_reactions WHERE job_id = ? AND user_id = ? AND kind = ?",
                         (job_id, user["id"], kind))
        conn.commit()
        count = conn.execute("SELECT COUNT(*) FROM feed_reactions WHERE job_id = ? AND kind = ?",
                             (job_id, kind)).fetchone()[0]
    finally:
        conn.close()
    return {"kind": kind, "active": req.active, "count": count}


# ------------------------------------------------------------------ shop bật/tắt video trên feed
class FeedVisibilityRequest(BaseModel):
    visible: bool


@router.put("/api/jobs/{job_id}/feed")
def api_set_feed_visibility(job_id: str, req: FeedVisibilityRequest, user: dict = Depends(get_current_user)):
    """Shop chọn hiện video đã tạo xong lên feed của Aura (người mua xem, thử đồ, bấm Mua ngay)."""
    conn = get_db()
    try:
        row = conn.execute("SELECT status FROM ai_jobs WHERE id = ? AND user_id = ?", (job_id, user["id"])).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Job không tồn tại")
        if req.visible and row["status"] != "completed":
            raise HTTPException(status_code=409, detail="Video chưa tạo xong")
        conn.execute("UPDATE ai_jobs SET feed_visible = ?, feed_at = CASE WHEN ? = 1 THEN COALESCE(feed_at, "
                     "CURRENT_TIMESTAMP) ELSE feed_at END WHERE id = ?", (int(req.visible), int(req.visible), job_id))
        conn.commit()
    finally:
        conn.close()
    return {"job_id": job_id, "feed_visible": req.visible}
