"""Tư vấn size cho người mua (feed video nằm ở routers/feed.py)"""

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.database import get_product
from backend.services.size_advisor import calculate_smart_size

router = APIRouter()


class SizeAdvisorRequest(BaseModel):
    height: float = Field(default=158.0, ge=120, le=220)
    weight: float = Field(default=51.0, ge=30, le=200)
    bust: float = Field(default=84.0, ge=50, le=200)
    waist: float = Field(default=68.0, ge=40, le=200)
    hips: float = Field(default=92.0, ge=50, le=200)
    body_shape: str = Field(default="pear", max_length=30)
    product_id: Optional[str] = None


@router.post("/api/size/recommend")
def api_size_recommend(req: SizeAdvisorRequest):
    """Task 22: Tư vấn size"""
    links = {}
    product = get_product(req.product_id) if req.product_id else None
    if product:
        links = {k: v for k, v in (("shopee", product["affiliate_shopee_url"]),
                                   ("tiktok", product["affiliate_tiktok_url"])) if v}
    return calculate_smart_size(req.height, req.weight, req.bust, req.waist, req.hips, req.body_shape, links)
