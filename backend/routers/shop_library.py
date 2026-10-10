"""Thư viện của shop: Sản phẩm của tôi (lọc, sửa, ẩn, link mua, size, thử đồ) và người mẫu riêng."""
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, HttpUrl, field_validator

from backend.auth import get_current_user
from backend.database import (
    add_brand_avatar_entry, archive_brand_avatar, archive_product, count_private_avatars, create_product, get_brand_avatar,
    get_db, update_brand_avatar, update_product,
)
from backend.media_paths import media_url, resolve_media_ref
from backend.routers.admin import avatar_out
from backend.routers.common import owned_product, product_out
from backend.services import plans

router = APIRouter()

MAX_SIZES = 12


def _like(q: str) -> str:
    return "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _clean_sizes(sizes: Optional[List[str]]) -> Optional[str]:
    """["s", " M ", "M"] -> "S,M" (giữ thứ tự, bỏ trùng)."""
    if sizes is None:
        return None
    out = []
    for s in sizes:
        s = s.strip().upper()
        if s and s not in out:
            out.append(s)
    return ",".join(out[:MAX_SIZES]) or None


class SizesMixin(BaseModel):
    @field_validator("sizes", check_fields=False)
    @classmethod
    def _sizes(cls, v):
        if v is not None and any(len(s.strip()) > 10 or "," in s for s in v):
            raise ValueError("Mỗi size tối đa 10 ký tự, không chứa dấu phẩy")
        return v


class LibraryProductCreate(SizesMixin):
    title: str = Field(min_length=2, max_length=200)
    price: int = Field(gt=0, le=1_000_000_000)
    image_url: str = Field(max_length=1000, description="Đường dẫn /media/... trả về từ /api/uploads/image")
    original_price: Optional[int] = Field(default=None, gt=0, le=1_000_000_000)
    category: Optional[str] = Field(default=None, max_length=100)
    fabric_type: Optional[str] = Field(default=None, max_length=100)
    product_url: Optional[HttpUrl] = Field(default=None, description="Link mua: Shopee, TikTok Shop, website")
    sizes: Optional[List[str]] = Field(default=None, max_length=MAX_SIZES)
    tryon_enabled: bool = False


class LibraryProductUpdate(SizesMixin):
    title: Optional[str] = Field(default=None, min_length=2, max_length=200)
    price: Optional[int] = Field(default=None, gt=0, le=1_000_000_000)
    image_url: Optional[str] = Field(default=None, max_length=1000)
    original_price: Optional[int] = Field(default=None, ge=0, le=1_000_000_000, description="0 = bỏ giá gốc")
    category: Optional[str] = Field(default=None, max_length=100)
    fabric_type: Optional[str] = Field(default=None, max_length=100)
    product_url: Optional[str] = Field(default=None, max_length=2000, description="Chuỗi rỗng = bỏ link")
    sizes: Optional[List[str]] = Field(default=None, max_length=MAX_SIZES)
    tryon_enabled: Optional[bool] = None


def _check_original(price: Optional[int], original: Optional[int]):
    if price and original and original <= price:
        raise HTTPException(status_code=400, detail="Giá gốc phải cao hơn giá bán (hoặc để trống)")


@router.get("/api/products/library")
def api_product_library(q: Optional[str] = Query(None, max_length=100), category: Optional[str] = Query(None, max_length=100),
                        page: int = Query(1, ge=1, le=10_000), page_size: int = Query(24, ge=1, le=100),
                        user: dict = Depends(get_current_user)):
    """Sản phẩm của tôi: tìm theo tên, lọc theo loại, kèm số video đã tạo và số lượng theo từng loại."""
    base, args = ["p.owner_id = ?", "COALESCE(p.archived, 0) = 0"], [user["id"]]
    if q and q.strip():
        base.append("p.title LIKE ? ESCAPE '\\'")
        args.append(_like(q))
    where = " AND ".join(base)
    filtered, f_args = where, list(args)
    if category == "__none__":
        filtered += " AND COALESCE(TRIM(p.category), '') = ''"
    elif category:
        filtered += " AND TRIM(p.category) = ?"
        f_args.append(category.strip())
    conn = get_db()
    try:
        counts = conn.execute(f"SELECT TRIM(COALESCE(p.category, '')) AS c, COUNT(*) FROM products p WHERE {where} "
                              "GROUP BY c ORDER BY COUNT(*) DESC, c", args).fetchall()
        total = conn.execute(f"SELECT COUNT(*) FROM products p WHERE {filtered}", f_args).fetchone()[0]
        rows = conn.execute(f'''
            SELECT p.*,
                   (SELECT COUNT(*) FROM ai_jobs j WHERE j.product_id = p.id AND j.status = 'completed') AS videos_count
            FROM products p WHERE {filtered}
            ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?''', f_args + [page_size, (page - 1) * page_size]).fetchall()
    finally:
        conn.close()
    categories = [{"category": c or None, "count": n} for c, n in counts]
    return {"items": [product_out(dict(r)) for r in rows], "total": total, "page": page, "page_size": page_size,
            "has_more": page * page_size < total, "all": sum(n for _, n in counts), "categories": categories}


@router.post("/api/products/library")
def api_library_create(req: LibraryProductCreate, user: dict = Depends(get_current_user)):
    _check_original(req.price, req.original_price)
    image_path = resolve_media_ref(req.image_url)
    return product_out(create_product(
        owner_id=user["id"], title=req.title.strip(), price=req.price, image_url=media_url(image_path),
        category=(req.category or "").strip() or None, fabric_type=(req.fabric_type or "").strip() or None,
        original_price=req.original_price, product_url=str(req.product_url) if req.product_url else None,
        sizes=_clean_sizes(req.sizes), tryon_enabled=req.tryon_enabled,
    ))


@router.patch("/api/products/{product_id}")
def api_update_product(product_id: str, req: LibraryProductUpdate, user: dict = Depends(get_current_user)):
    product = owned_product(product_id, user)
    if product.get("archived"):
        raise HTTPException(status_code=404, detail="Sản phẩm không tồn tại")
    fields = req.model_dump(exclude_unset=True)
    if "image_url" in fields and fields["image_url"]:
        fields["image_url"] = media_url(resolve_media_ref(fields["image_url"]))
    if "original_price" in fields:
        fields["original_price"] = fields["original_price"] or None
    if "product_url" in fields:
        url = (fields["product_url"] or "").strip()
        if url and not url.lower().startswith(("https://", "http://")):
            raise HTTPException(status_code=400, detail="Link mua phải bắt đầu bằng https://")
        fields["product_url"] = url or None
    if "sizes" in fields:
        fields["sizes"] = _clean_sizes(fields["sizes"])
    for key in ("category", "fabric_type"):
        if key in fields:
            fields[key] = (fields[key] or "").strip() or None
    if "tryon_enabled" in fields:
        fields["tryon_enabled"] = 1 if fields["tryon_enabled"] else 0
    _check_original(fields.get("price", product["price"]), fields.get("original_price", product["original_price"]))
    return product_out(update_product(product_id, **fields))


@router.delete("/api/products/{product_id}")
def api_archive_product(product_id: str, user: dict = Depends(get_current_user)):
    """Ẩn sản phẩm (video đã tạo vẫn giữ nguyên trong Video của tôi)."""
    owned_product(product_id, user)
    archive_product(product_id)
    return {"status": "archived"}


# ----------------------------------------------------------------- người mẫu riêng của shop
CONSENT_TEXT = ("Tôi xác nhận có quyền sử dụng hình ảnh người trong ảnh (là tôi, hoặc người trong ảnh đã đồng ý) "
                "để tạo video quảng cáo bằng AI.")


class PrivateModelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    style: str = Field(min_length=1, max_length=120)
    gender: Literal["female", "male"] = "female"
    height: str = Field(default="", max_length=20)
    weight: str = Field(default="", max_length=20)
    measurements: str = Field(default="", max_length=40)
    avatar_url: str = Field(max_length=1000, description="Ảnh toàn thân đã upload (/media/...)")
    consent: Literal[True] = Field(description="Bắt buộc: cam kết có quyền dùng hình ảnh người này")


class PrivateModelUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    style: Optional[str] = Field(default=None, min_length=1, max_length=120)
    gender: Optional[Literal["female", "male"]] = None
    height: Optional[str] = Field(default=None, max_length=20)
    weight: Optional[str] = Field(default=None, max_length=20)
    measurements: Optional[str] = Field(default=None, max_length=40)


def _own_model(avatar_id: str, user: dict) -> dict:
    avatar = get_brand_avatar(avatar_id)
    if not avatar or avatar.get("archived") or avatar.get("owner_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Người mẫu không tồn tại")
    return avatar


@router.get("/api/my/avatars/quota")
def api_private_model_quota(user: dict = Depends(get_current_user)):
    return {"used": count_private_avatars(user["id"]), "limit": plans.private_models_limit(user["id"]),
            "consent_text": CONSENT_TEXT}


@router.post("/api/my/avatars")
def api_create_private_model(req: PrivateModelCreate, user: dict = Depends(get_current_user)):
    """Tạo người mẫu riêng từ ảnh toàn thân của shop. Chỉ shop đó thấy và dùng được."""
    limit = plans.private_models_limit(user["id"])
    if count_private_avatars(user["id"]) >= limit:
        raise HTTPException(status_code=403, detail=f"Bạn đã dùng hết {limit} người mẫu riêng. Xóa bớt mẫu cũ hoặc nâng cấp gói.")
    url = media_url(resolve_media_ref(req.avatar_url))  # chỉ nhận ảnh đã tải lên máy chủ, không nhận link ngoài
    avatar = add_brand_avatar_entry(
        name=req.name.strip(), style=req.style.strip(), height=req.height.strip(), weight=req.weight.strip(),
        measurements=req.measurements.strip(), avatar_url=url, badge="Mẫu riêng", gender=req.gender, owner_id=user["id"])
    return avatar_out(avatar, user)


@router.patch("/api/my/avatars/{avatar_id}")
def api_update_private_model(avatar_id: str, req: PrivateModelUpdate, user: dict = Depends(get_current_user)):
    _own_model(avatar_id, user)
    fields = {k: (v.strip() if isinstance(v, str) else v) for k, v in req.model_dump(exclude_none=True).items()}
    return avatar_out(update_brand_avatar(avatar_id, **fields), user)


@router.delete("/api/my/avatars/{avatar_id}")
def api_delete_private_model(avatar_id: str, user: dict = Depends(get_current_user)):
    """Xóa mẫu riêng: không dùng được nữa, video đã tạo vẫn giữ nguyên."""
    _own_model(avatar_id, user)
    archive_brand_avatar(avatar_id)
    return {"status": "deleted"}
