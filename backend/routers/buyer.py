"""Người mua thử đồ ảo lên ảnh của mình.

- Shop bật "Cho khách thử đồ" ở sản phẩm. Mỗi lượt thử trừ credit của shop (Admin chỉnh phí);
  shop hết credit thì khách tạm không thử được, khách không bao giờ bị thu tiền.
- Mỗi người mua có giới hạn lượt thử trong 24 giờ.
- Ảnh khách tải lên và ảnh kết quả tự xóa sau BUYER_PHOTO_HOURS giờ (mặc định 24), khách xóa ngay được.
"""
import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from backend import config
from backend.ai.http_utils import ProviderError
from backend.ai.segmentation import segment_garment
from backend.ai.vton import generate_person_tryon
from backend.auth import get_current_user
from backend.database import get_db, get_product
from backend.media_paths import resolve_media_ref, try_resolve_media_ref
from backend.services.image_store import ImageRejected, store_image_bytes
from backend.services.wallet import deduct_credits, refund_credits

log = logging.getLogger(__name__)
router = APIRouter()

PRIVACY_TEXT = ("Ảnh chỉ dùng để thử đồ, không hiện cho shop hay ai khác và tự xóa sau {hours} giờ. "
                "Chỉ tải ảnh của chính bạn.")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def _remove(url: Optional[str]):
    path = try_resolve_media_ref(url or "")
    if path:
        try:
            os.remove(path)
        except OSError:
            pass


def cleanup_expired_tryons() -> int:
    """Xóa ảnh khách và ảnh kết quả đã quá hạn. Gọi mỗi lần có người dùng tính năng thử đồ."""
    conn = get_db()
    try:
        rows = conn.execute("SELECT id, photo_url, result_url FROM buyer_tryons WHERE deleted_at IS NULL "
                            "AND expires_at <= ?", (_now().strftime("%Y-%m-%d %H:%M:%S"),)).fetchall()
        for r in rows:
            # Cùng một ảnh có thể đang dùng cho lượt thử khác còn hạn: chỉ xóa khi không còn ai dùng
            in_use = conn.execute("SELECT COUNT(*) FROM buyer_tryons WHERE photo_url = ? AND id != ? AND deleted_at IS NULL "
                                  "AND expires_at > ?", (r["photo_url"], r["id"], _now().strftime("%Y-%m-%d %H:%M:%S"))).fetchone()[0]
            if not in_use:
                _remove(r["photo_url"])
            _remove(r["result_url"])
            conn.execute("UPDATE buyer_tryons SET deleted_at = CURRENT_TIMESTAMP, photo_url = NULL, result_url = NULL "
                         "WHERE id = ?", (r["id"],))
        conn.commit()
    finally:
        conn.close()
    return len(rows)


@router.get("/api/buyer/tryon/info")
def api_tryon_info(user: dict = Depends(get_current_user)):
    """Còn bao nhiêu lượt thử hôm nay và lời cam kết về ảnh."""
    hours, limit = config.buyer_photo_hours(), config.buyer_tryon_daily_limit()
    return {"daily_limit": limit, "used_24h": _used_24h(user["id"]), "photo_hours": hours,
            "privacy_text": PRIVACY_TEXT.format(hours=hours)}


@router.post("/api/buyer/photo")
async def api_buyer_photo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Ảnh toàn thân của khách để thử đồ: bỏ metadata (vị trí, máy chụp), tên file ngẫu nhiên khó đoán."""
    limit = config.max_upload_bytes()
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"Ảnh vượt quá {limit // (1024 * 1024)}MB")
    try:
        saved = store_image_bytes(data, prefix="buyer", max_side=1600, name_hex=32)
    except ImageRejected as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    return {"photo_url": saved["media_url"], "width": saved["width"], "height": saved["height"]}


def _used_24h(buyer_id: str) -> int:
    conn = get_db()
    try:
        return conn.execute("SELECT COUNT(*) FROM buyer_tryons WHERE buyer_id = ? AND created_at >= datetime('now', "
                            "'-1 day')", (buyer_id,)).fetchone()[0]
    finally:
        conn.close()


class BuyerTryonRequest(BaseModel):
    product_id: str = Field(max_length=40)
    photo_url: str = Field(max_length=1000, description="Đường dẫn trả về từ /api/buyer/photo")
    consent: Literal[True] = Field(description="Đồng ý cho Aura dùng ảnh này để thử đồ")
    size: Optional[str] = Field(default=None, max_length=10)
    job_id: Optional[str] = Field(default=None, max_length=40, description="Video trên feed mà khách bấm Thử đồ")


def _out(row: dict, product: Optional[dict] = None) -> dict:
    return {"id": row["id"], "product_id": row["product_id"], "size": row["size"], "engine": row["engine"],
            "before_url": row["photo_url"], "after_url": row["result_url"], "created_at": row["created_at"],
            "expires_at": row["expires_at"],
            **({"product": {"title": product["title"], "price": product["price"], "product_url": product.get("product_url"),
                            "sizes": [s for s in (product.get("sizes") or "").split(",") if s],
                            "image_url": product["image_url"]}} if product else {})}


@router.post("/api/buyer/tryon")
def api_buyer_tryon(req: BuyerTryonRequest, user: dict = Depends(get_current_user)):
    cleanup_expired_tryons()
    product = get_product(req.product_id)
    if not product or product.get("archived"):
        raise HTTPException(status_code=404, detail="Sản phẩm không còn bán")
    if not product.get("tryon_enabled"):
        raise HTTPException(status_code=400, detail="Shop chưa bật thử đồ cho sản phẩm này")
    limit = config.buyer_tryon_daily_limit()
    if _used_24h(user["id"]) >= limit:
        raise HTTPException(status_code=429, detail=f"Bạn đã thử {limit} lần trong 24 giờ qua, quay lại sau nhé")
    person_path = resolve_media_ref(req.photo_url)
    if not os.path.basename(person_path).startswith("buyer_"):
        raise HTTPException(status_code=400, detail="Vui lòng tải ảnh của bạn lên trước khi thử")
    garment_path = try_resolve_media_ref(product["image_url"])
    if not garment_path:
        raise HTTPException(status_code=400, detail="Sản phẩm thiếu ảnh để thử")

    cost = config.buyer_tryon_cost_credits()
    shop_id = product["owner_id"]
    if cost:
        charged = deduct_credits(shop_id, cost, f"Khách thử đồ ảo: {product['title']}"[:200])
        if charged["status"] != "success":
            # Không nói chuyện credit với khách: chỉ báo shop tạm dừng
            raise HTTPException(status_code=402, detail="Shop đang tạm dừng thử đồ cho sản phẩm này, bạn quay lại sau nhé")

    tryon_id = f"BT{uuid.uuid4().hex[:12].upper()}"
    analysis = json.loads(product["analysis_json"]) if product.get("analysis_json") else {}
    try:
        cutout = segment_garment(garment_path, output_name=f"buyer_cut_{tryon_id}.png")["output_path"]
        result = generate_person_tryon(garment_path, person_path, output_name=f"buyer_{uuid.uuid4().hex}.jpg",
                                       garment_type=analysis.get("garment_type", "auto"),
                                       photo_type=analysis.get("photo_type", "auto"), cutout_path=cutout)
        try:
            os.remove(cutout)
        except OSError:
            pass
    except (ProviderError, OSError, ValueError) as e:
        log.warning("Thử đồ cho khách lỗi: %s", e)
        if cost:
            conn = get_db()
            try:
                refund_credits(shop_id, cost, f"Hoàn credit: lượt thử đồ lỗi {tryon_id}", conn)
                conn.commit()
            finally:
                conn.close()
        raise HTTPException(status_code=502, detail="Chưa thử được, bạn thử lại với ảnh khác nhé")

    expires = _now() + timedelta(hours=config.buyer_photo_hours())
    size = (req.size or "").strip().upper() or None
    conn = get_db()
    try:
        conn.execute('''
        INSERT INTO buyer_tryons (id, buyer_id, product_id, shop_id, job_id, size, photo_url, result_url, engine,
                                  cost_credits, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (tryon_id, user["id"], product["id"], shop_id, req.job_id, size, req.photo_url, result["media_url"],
              result["engine"], cost, expires.strftime("%Y-%m-%d %H:%M:%S")))
        conn.commit()
        row = dict(conn.execute("SELECT * FROM buyer_tryons WHERE id = ?", (tryon_id,)).fetchone())
    finally:
        conn.close()
    return _out(row, product)


@router.get("/api/buyer/tryons")
def api_buyer_tryons(user: dict = Depends(get_current_user)):
    """Các lượt thử còn ảnh (chưa hết hạn, chưa xóa) của người đang đăng nhập."""
    cleanup_expired_tryons()
    conn = get_db()
    try:
        rows = [dict(r) for r in conn.execute("SELECT * FROM buyer_tryons WHERE buyer_id = ? AND deleted_at IS NULL "
                                              "ORDER BY created_at DESC LIMIT 50", (user["id"],)).fetchall()]
    finally:
        conn.close()
    return {"items": [_out(r, get_product(r["product_id"])) for r in rows]}


@router.delete("/api/buyer/tryons/{tryon_id}")
def api_delete_buyer_tryon(tryon_id: str, user: dict = Depends(get_current_user)):
    """Xóa ngay ảnh của khách và ảnh kết quả."""
    conn = get_db()
    try:
        row = conn.execute("SELECT photo_url, result_url FROM buyer_tryons WHERE id = ? AND buyer_id = ? "
                           "AND deleted_at IS NULL", (tryon_id, user["id"])).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Không tìm thấy lượt thử")
        # Ảnh có thể đang dùng cho lượt thử khác còn hạn (khách thử nhiều món với cùng một ảnh)
        shared = conn.execute("SELECT COUNT(*) FROM buyer_tryons WHERE photo_url = ? AND id != ? AND deleted_at IS NULL",
                              (row["photo_url"], tryon_id)).fetchone()[0]
        if not shared:
            _remove(row["photo_url"])
        _remove(row["result_url"])
        conn.execute("UPDATE buyer_tryons SET deleted_at = CURRENT_TIMESTAMP, photo_url = NULL, result_url = NULL "
                     "WHERE id = ?", (tryon_id,))
        conn.commit()
    finally:
        conn.close()
    return {"status": "deleted"}
