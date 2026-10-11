"""Tạo video (pipeline), hàng đợi job, duyệt ảnh thử đồ, xuất bản"""

from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend import config
from backend.ai import motion as motion_engine, tts as tts_engine
from backend.ai.motion import TEMPLATES
from backend.ai.scenes import DEFAULT_SCENE, MAX_SCENES, SCENES
from backend.ai.script import STYLES
from backend.ai.tts import VOICES
from backend.auth import get_current_user
from backend.database import avatar_usable_by, get_brand_avatar, get_system_settings, get_user
from backend.routers.common import owned_product
from backend.services.queue_manager import (
    approve_job, create_ai_job, create_ai_jobs, get_job_status, InsufficientCredits, list_jobs, reject_job,
)
from backend.services.task_queue import QueueUnavailable

router = APIRouter()


class SceneSpec(BaseModel):
    """Một cảnh của Pro Studio: kiểu chuyển động, bối cảnh, thời lượng."""
    template: str = motion_engine.DEFAULT_TEMPLATE
    scene: str = DEFAULT_SCENE
    duration_sec: int = Field(default=5, ge=3, le=10)


class Effects(BaseModel):
    transition: Literal["fade", "slide", "zoom", "cut"] = "fade"
    subtitles: bool = Field(default=True, description="In phụ đề lời thoại lên video")
    title_card: bool = Field(default=True, description="Thẻ tên + giá sản phẩm ở đầu video")


class PipelineRunRequest(BaseModel):
    product_id: str = "prod_dam_voan_to"
    avatar_id: Optional[str] = None
    template: str = motion_engine.DEFAULT_TEMPLATE
    voice: str = tts_engine.DEFAULT_VOICE
    script_style: str = "genz"
    custom_script: Optional[str] = Field(default=None, max_length=600, description="Kịch bản tự viết, AI đọc đúng nguyên văn")
    duration_sec: int = Field(default=5, ge=3, le=15)
    require_approval: bool = Field(default=False, description="Dừng sau bước thử đồ để người bán duyệt ảnh")
    scene: str = Field(default=DEFAULT_SCENE, description="Bối cảnh: studio, street, cafe, beach, indoor")
    scenes: Optional[List[SceneSpec]] = Field(default=None, min_length=1, max_length=MAX_SCENES,
                                              description="Pro Studio: danh sách cảnh (thay cho template/scene/duration_sec)")
    effects: Optional[Effects] = None


def _check_motion(template: str, scene: str):
    if template not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Mẫu video phải là một trong: {', '.join(TEMPLATES)}")
    if scene not in SCENES:
        raise HTTPException(status_code=400, detail=f"Bối cảnh phải là một trong: {', '.join(SCENES)}")


def job_cost(params: dict) -> int:
    """Giá một video: giá cơ bản + phí mỗi cảnh thêm của Pro Studio."""
    extra = max(0, len(params.get("scenes") or []) - 1)
    return config.pipeline_cost_credits() + extra * config.extra_scene_cost_credits()


def _pipeline_params(req, user: dict) -> dict:
    _check_motion(req.template, getattr(req, "scene", None) or DEFAULT_SCENE)
    if req.voice not in VOICES:
        raise HTTPException(status_code=400, detail="Giọng đọc không hợp lệ")
    if req.script_style not in STYLES:
        raise HTTPException(status_code=400, detail="Giọng văn không hợp lệ")
    avatar_id = req.avatar_id or get_system_settings().get("default_model_id") or "model_01"
    # Mẫu riêng của shop khác (hoặc đã xóa) coi như không tồn tại
    if not avatar_usable_by(get_brand_avatar(avatar_id), user["id"]):
        raise HTTPException(status_code=404, detail="Người mẫu không tồn tại")
    params = {"avatar_id": avatar_id, "template": req.template, "voice": req.voice,
              "script_style": req.script_style, "duration_sec": req.duration_sec,
              "scene": getattr(req, "scene", None) or DEFAULT_SCENE,
              "custom_script": (getattr(req, "custom_script", None) or "").strip() or None,
              "require_approval": bool(getattr(req, "require_approval", False))}
    scenes = getattr(req, "scenes", None)
    if scenes:
        for spec in scenes:
            _check_motion(spec.template, spec.scene)
        params["scenes"] = [spec.model_dump() for spec in scenes]
        # Cảnh đầu quyết định ảnh thử đồ (duyệt ảnh, ảnh bìa) và các thông số cũ để danh sách video hiển thị đúng
        first = scenes[0]
        params.update(template=first.template, scene=first.scene, duration_sec=first.duration_sec)
    effects = getattr(req, "effects", None)
    if effects:
        params["effects"] = effects.model_dump()
    return params


@router.post("/api/pipeline/run")
def api_run_pipeline(req: PipelineRunRequest, user: dict = Depends(get_current_user)):
    """Task 8: Trừ credit và đưa pipeline vào hàng đợi"""
    owned_product(req.product_id, user)
    params = _pipeline_params(req, user)
    try:
        res = create_ai_job(user["id"], req.product_id, params, job_cost(params))
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
    scene: str = DEFAULT_SCENE


@router.post("/api/batch/create")
def api_batch_create(req: BatchCreateRequest, user: dict = Depends(get_current_user)):
    """Task 15: Tạo video hàng loạt (trừ credit cho từng video)"""
    for pid in req.product_ids:
        owned_product(pid, user)
    params = _pipeline_params(req, user)
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
