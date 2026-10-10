"""Tạo video (pipeline), hàng đợi job, duyệt ảnh thử đồ, xuất bản"""

from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend import config
from backend.ai import motion as motion_engine, tts as tts_engine
from backend.ai.motion import TEMPLATES
from backend.ai.script import STYLES
from backend.ai.tts import VOICES
from backend.auth import get_current_user
from backend.database import get_brand_avatar, get_system_settings, get_user
from backend.routers.common import owned_product
from backend.services.queue_manager import (
    approve_job, create_ai_job, create_ai_jobs, get_job_status, InsufficientCredits, list_jobs, reject_job,
)
from backend.services.task_queue import QueueUnavailable

router = APIRouter()


class PipelineRunRequest(BaseModel):
    product_id: str = "prod_dam_voan_to"
    avatar_id: Optional[str] = None
    template: str = motion_engine.DEFAULT_TEMPLATE
    voice: str = tts_engine.DEFAULT_VOICE
    script_style: str = "genz"
    duration_sec: int = Field(default=5, ge=3, le=15)
    require_approval: bool = Field(default=False, description="Dừng sau bước thử đồ để người bán duyệt ảnh")


def _pipeline_params(req) -> dict:
    if req.template not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Mẫu video phải là một trong: {', '.join(TEMPLATES)}")
    if req.voice not in VOICES:
        raise HTTPException(status_code=400, detail="Giọng đọc không hợp lệ")
    if req.script_style not in STYLES:
        raise HTTPException(status_code=400, detail="Giọng văn không hợp lệ")
    avatar_id = req.avatar_id or get_system_settings().get("default_model_id") or "model_01"
    if get_brand_avatar(avatar_id) is None:
        raise HTTPException(status_code=404, detail="Người mẫu không tồn tại")
    return {"avatar_id": avatar_id, "template": req.template, "voice": req.voice,
            "script_style": req.script_style, "duration_sec": req.duration_sec,
            "require_approval": bool(getattr(req, "require_approval", False))}


@router.post("/api/pipeline/run")
def api_run_pipeline(req: PipelineRunRequest, user: dict = Depends(get_current_user)):
    """Task 8: Trừ credit và đưa pipeline vào hàng đợi"""
    owned_product(req.product_id, user)
    params = _pipeline_params(req)
    try:
        res = create_ai_job(user["id"], req.product_id, params)
    except InsufficientCredits as e:
        raise HTTPException(status_code=402, detail=str(e))
    except QueueUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {
        "status": "success",
        "job_id": res["job_id"],
        "credits_deducted": res["credits_deducted"],
        "remaining_credits": res["remaining_credits"],
        "message": "Đã tiếp nhận yêu cầu và đang xử lý trong hàng đợi",
    }


@router.get("/api/jobs")
def api_list_jobs(
    page: int = Query(1, ge=1, le=10_000),
    page_size: int = Query(24, ge=1, le=100),
    q: Optional[str] = Query(None, max_length=100, description="Tìm theo tên sản phẩm, không cần gõ dấu"),
    status: Optional[Literal["completed", "busy", "awaiting_approval", "other"]] = None,
    sort: Literal["newest", "oldest", "title"] = "newest",
    user: dict = Depends(get_current_user),
):
    """Danh sách video của người dùng đang đăng nhập (trang "Video của tôi"): phân trang, tìm kiếm, lọc, sắp xếp"""
    return list_jobs(user["id"], page=page, page_size=page_size, q=q, status=status, sort=sort)


@router.get("/api/jobs/{job_id}")
def api_job_status(job_id: str, user: dict = Depends(get_current_user)):
    """Task 8: Trạng thái và tiến độ % của job"""
    job = get_job_status(job_id, user_id=None if user["role"] == "admin" else user["id"])
    if job is None:
        raise HTTPException(status_code=404, detail="Job không tồn tại")
    return job


@router.post("/api/jobs/{job_id}/approve")
def api_approve_job(job_id: str, user: dict = Depends(get_current_user)):
    """Đồng ý ảnh thử đồ, tiếp tục tạo video"""
    try:
        approved = approve_job(job_id, user["id"])
    except QueueUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    if not approved:
        raise HTTPException(status_code=409, detail="Job không ở trạng thái chờ duyệt")
    return {"status": "queued"}


@router.post("/api/jobs/{job_id}/reject")
def api_reject_job(job_id: str, user: dict = Depends(get_current_user)):
    """Không ưng ảnh thử đồ: hủy job, hoàn credit (trừ phí thử đồ)"""
    res = reject_job(job_id, user["id"])
    if res is None:
        raise HTTPException(status_code=409, detail="Job không ở trạng thái chờ duyệt")
    res["remaining_credits"] = get_user(user["id"])["credits"]
    return res


class BatchCreateRequest(BaseModel):
    product_ids: List[str] = Field(min_length=1, max_length=50)
    avatar_id: Optional[str] = None
    template: str = motion_engine.DEFAULT_TEMPLATE
    voice: str = tts_engine.DEFAULT_VOICE
    script_style: str = "genz"
    duration_sec: int = Field(default=5, ge=3, le=15)


@router.post("/api/batch/create")
def api_batch_create(req: BatchCreateRequest, user: dict = Depends(get_current_user)):
    """Task 15: Tạo video hàng loạt (trừ credit cho từng video)"""
    for pid in req.product_ids:
        owned_product(pid, user)
    params = _pipeline_params(req)
    try:
        res = create_ai_jobs(user["id"], req.product_ids, params, config.pipeline_cost_credits())
    except InsufficientCredits as e:
        raise HTTPException(status_code=402, detail=str(e))
    except QueueUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"status": "success", "total_jobs": len(res["job_ids"]), "job_ids": res["job_ids"],
            "credits_deducted": res["credits_deducted"], "remaining_credits": res["remaining_credits"]}


class ExportRequest(BaseModel):
    job_id: str


@router.post("/api/publisher/export")
def api_export_publisher(req: ExportRequest, user: dict = Depends(get_current_user)):
    """Task 16: Lấy link tải video và caption + hashtag để đăng"""
    job = get_job_status(req.job_id, user_id=None if user["role"] == "admin" else user["id"])
    if job is None:
        raise HTTPException(status_code=404, detail="Job không tồn tại")
    if job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Video chưa tạo xong")
    script = job["script"] or {}
    return {
        "status": "success",
        "download_url": job["output_video_url"],
        "subtitles_vtt": script.get("subtitles_vtt"),
        "seo_caption": script.get("post_caption") or script.get("full_script", ""),
        "voice_script": script.get("full_script", ""),
        "hashtags": script.get("hashtags", []),
        "ai_generated_label": "Video có sử dụng hình ảnh minh họa do AI tạo",
    }
