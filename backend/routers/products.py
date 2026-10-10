"""Upload ảnh và sản phẩm"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field, HttpUrl

from backend import config
from backend.ai.product_analysis import analyze_product
from backend.auth import get_current_user
from backend.database import create_product, list_products
from backend.media_paths import media_url, resolve_media_ref
from backend.routers.common import owned_product, product_out
from backend.services.image_store import ImageRejected, store_image_bytes
from backend.services.safe_http import UnsafeURL
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
        saved = store_image_bytes(data)
    except ImageRejected as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    return {"status": "success", **saved}


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
    url: str = Field(min_length=8, max_length=2000)


@router.post("/api/scraper/product")
def api_scrape(req: ScrapeRequest, user: dict = Depends(get_current_user)):
    """Đọc tên, giá, chất liệu, ảnh từ link sản phẩm (Shopee, TikTok Shop, website thời trang)."""
    try:
        return scrape_product_url(req.url)
    except UnsafeURL as e:
        raise HTTPException(status_code=400, detail=str(e))


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
