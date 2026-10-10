"""Ứng dụng người mua (bản cũ): feed video, tư vấn size"""

import json
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.database import get_db, get_product
from backend.media_paths import try_resolve_media_ref
from backend.services.size_advisor import calculate_smart_size

router = APIRouter()


@router.get("/api/feed/videos")
def api_feed_videos():
    """Task 17: Feed video dọc từ các video đã tạo xong (kèm video mẫu nếu chưa có)"""
    conn = get_db()
    rows = conn.execute('''
    SELECT j.id, j.output_video_url, j.script_json, p.title, p.price
    FROM ai_jobs j JOIN products p ON p.id = j.product_id
    WHERE j.status = 'completed' AND j.output_video_url IS NOT NULL
    ORDER BY j.completed_at DESC LIMIT 20
    ''').fetchall()
    conn.close()
    videos = []
    for r in rows:
        if not try_resolve_media_ref(r["output_video_url"]):
            continue
        script = json.loads(r["script_json"]) if r["script_json"] else {}
        videos.append({"id": r["id"], "title": r["title"], "price": r["price"], "video_url": r["output_video_url"],
                       "subtitles_vtt": script.get("subtitles_vtt"), "shop_name": "Aura Lookbook"})
    if not videos:
        videos.append({"id": "sample", "title": "Đầm Voan Tơ 2 Lớp Hoa Nhí", "price": 189000,
                       "video_url": "/samples/sample_final.mp4", "subtitles_vtt": None, "shop_name": "Aura Lookbook"})
    return {"status": "success", "videos": videos}


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
