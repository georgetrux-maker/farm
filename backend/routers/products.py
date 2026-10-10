"""Upload ảnh và sản phẩm"""

import io
import json
import os
from typing import Optional

from PIL import Image, UnidentifiedImageError
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field, HttpUrl

from backend import config
from backend.ai.product_analysis import analyze_product
from backend.auth import get_current_user
from backend.database import create_product, list_products
from backend.media_paths import media_path, media_url, resolve_media_ref
from backend.routers.common import owned_product, product_out, unique_name
from backend.services.scraper import scrape_product_url

router = APIRouter()


@router.post("/api/uploads/image")
async def api_upload_image(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Upload ảnh sản phẩm. Ảnh được kiểm tra và lưu lại dưới dạng PNG/JPEG sạch (bỏ metadata)."""
    limit = config.max_upload_bytes()
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"Ảnh vượt quá {limit // (1024 * 1024)}MB")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        img = Image.open(io.BytesIO(data))
        if img.format not in ("JPEG", "PNG", "WEBP"):
            raise HTTPException(status_code=415, detail="Chỉ hỗ trợ ảnh JPG, PNG, WEBP")
        if img.width * img.height > 40_000_000:
            raise HTTPException(status_code=413, detail="Ảnh có độ phân giải quá lớn")
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(status_code=415, detail="File không phải ảnh hợp lệ")

    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    os.makedirs(media_path("uploads"), exist_ok=True)
    if has_alpha:
        name = os.path.join("uploads", unique_name("img", "png"))
        img.convert("RGBA").save(media_path(name), "PNG")
    else:
        name = os.path.join("uploads", unique_name("img", "jpg"))
        img.convert("RGB").save(media_path(name), "JPEG", quality=92)
    return {"status": "success", "media_url": media_url(media_path(name)), "width": img.width, "height": img.height}


class ProductCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    price: int = Field(gt=0, le=1_000_000_000)
    image_url: str = Field(description="Đường dẫn /media/... trả về từ /api/uploads/image")
    original_price: Optional[int] = Field(default=None, gt=0, le=1_000_000_000)
    category: Optional[str] = Field(default=None, max_length=100)
    fabric_type: Optional[str] = Field(default=None, max_length=100)
    affiliate_shopee_url: Optional[HttpUrl] = None
    affiliate_tiktok_url: Optional[HttpUrl] = None
    analysis: Optional[dict] = Field(default=None, description="Kết quả 'ai' từ /api/products/analyze")


class AnalyzeRequest(BaseModel):
    image_url: str
    title: Optional[str] = Field(default=None, max_length=200)


@router.post("/api/products/analyze")
def api_analyze_product(req: AnalyzeRequest, user: dict = Depends(get_current_user)):
    """Chấm chất lượng ảnh và (nếu có Claude) mô tả sản phẩm: loại, màu, chất liệu, điểm nổi bật"""
    return analyze_product(resolve_media_ref(req.image_url), req.title)


@router.post("/api/products")
def api_create_product(req: ProductCreateRequest, user: dict = Depends(get_current_user)):
    image_path = resolve_media_ref(req.image_url)
    if req.analysis is not None and len(json.dumps(req.analysis, ensure_ascii=False)) > 20_000:
        raise HTTPException(status_code=400, detail="Dữ liệu phân tích quá lớn")
    return product_out(create_product(
        owner_id=user["id"], title=req.title.strip(), price=req.price, image_url=media_url(image_path),
        category=req.category, fabric_type=req.fabric_type, original_price=req.original_price,
        affiliate_shopee_url=str(req.affiliate_shopee_url) if req.affiliate_shopee_url else None,
        affiliate_tiktok_url=str(req.affiliate_tiktok_url) if req.affiliate_tiktok_url else None,
        analysis=req.analysis,
    ))


@router.get("/api/products")
def api_list_products(user: dict = Depends(get_current_user)):
    return [product_out(p) for p in list_products(user["id"])]


@router.get("/api/products/{product_id}")
def api_get_product(product_id: str, user: dict = Depends(get_current_user)):
    return product_out(owned_product(product_id, user))


class ScrapeRequest(BaseModel):
    url: HttpUrl


@router.post("/api/scraper/product")
def api_scrape(req: ScrapeRequest, user: dict = Depends(get_current_user)):
    """Task 11: Nhận diện link Shopee / TikTok Shop (chưa cào dữ liệu thật)"""
    return scrape_product_url(str(req.url))


@router.get("/api/products/{product_id}/hotspots")
def api_product_hotspots(product_id: str):
    """Task 18: Điểm ghim trên video (đang dùng vị trí mặc định cho đầm, Đợt 2 sẽ tự nhận diện)"""
    return {
        "status": "success",
        "product_id": product_id,
        "hotspots": [
            {"id": "hp_collar", "label": "Cổ áo", "x_percent": 48.0, "y_percent": 37.0,
             "detail": "Chi tiết phần cổ áo"},
            {"id": "hp_waist", "label": "Phần eo", "x_percent": 45.0, "y_percent": 53.0,
             "detail": "Chi tiết phần eo"},
        ],
    }
