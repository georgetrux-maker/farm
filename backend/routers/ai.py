"""Từng bước AI riêng lẻ: tách nền, thử đồ, chuyển động, kịch bản, lồng tiếng, ghép video"""

from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend import config
from backend.ai import motion as motion_engine, script as script_engine, tts as tts_engine, vton as vton_engine
from backend.ai.http_utils import ProviderError
from backend.ai.motion import generate_motion, TEMPLATES
from backend.ai.render import render_final_video
from backend.ai.script import generate_koc_script, STYLES
from backend.ai.segmentation import segment_garment
from backend.ai.tts import generate_speech, VOICES
from backend.ai.vton import generate_tryon
from backend.auth import get_current_user
from backend.database import avatar_usable_by, get_brand_avatar
from backend.media_paths import resolve_media_ref, try_resolve_media_ref
from backend.routers.common import owned_product, unique_name
from backend.services.cache_manager import check_tryon_cache, save_tryon_cache
from backend.services.queue_manager import ensure_product_analysis

router = APIRouter()


class SegmentRequest(BaseModel):
    image_url: str = Field(description="Đường dẫn /media/... của ảnh đã upload")


@router.post("/api/ai/segment")
def api_segment(req: SegmentRequest, user: dict = Depends(get_current_user)):
    """Task 1: Tách nền trang phục"""
    return segment_garment(resolve_media_ref(req.image_url), output_name=unique_name("seg", "png"))


class TryOnRequest(BaseModel):
    product_id: str
    avatar_id: str = "model_01"
    body_shape: str = Field(default="standard", max_length=30)
    height: float = Field(default=158.0, ge=120, le=220)
    weight: float = Field(default=51.0, ge=30, le=200)


@router.post("/api/ai/tryon")
def api_tryon(req: TryOnRequest, user: dict = Depends(get_current_user)):
    """Task 2 & 23: Thử đồ ảo có cache tiết kiệm GPU"""
    product = owned_product(req.product_id, user)
    avatar = get_brand_avatar(req.avatar_id)
    if not avatar_usable_by(avatar, user["id"]):
        raise HTTPException(status_code=404, detail="Người mẫu không tồn tại")

    cache = check_tryon_cache(req.product_id, req.avatar_id, req.body_shape, req.height, req.weight)
    if cache["cached"]:
        return {"status": "success", "cached": True, "media_url": cache["result_image_url"],
                "gpu_cost_saved": cache["gpu_cost_saved"]}

    analysis = ensure_product_analysis(product)
    product_image = try_resolve_media_ref(product["image_url"])
    garment = product_image if vton_engine.engine_name() == "fashn" else \
        segment_garment(product_image, output_name=unique_name("seg", "png"))["output_path"]
    try:
        res = generate_tryon(garment, req.avatar_id, avatar, {"height": req.height, "weight": req.weight},
                             output_name=unique_name("tryon", "jpg"), garment_type=analysis.get("garment_type", "auto"),
                             photo_type=analysis.get("photo_type", "auto"))
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))
    save_tryon_cache(req.product_id, req.avatar_id, req.body_shape, req.height, req.weight, res["media_url"])
    return {**res, "cached": False}


class MotionRequest(BaseModel):
    image_url: str
    duration_sec: int = Field(default=5, ge=1, le=15)
    template: str = motion_engine.DEFAULT_TEMPLATE


@router.post("/api/ai/motion")
def api_motion(req: MotionRequest, user: dict = Depends(get_current_user)):
    """Task 3: Sinh video dọc 9:16 theo mẫu chuyển động"""
    if req.template not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Mẫu video phải là một trong: {', '.join(TEMPLATES)}")
    try:
        return generate_motion(resolve_media_ref(req.image_url), req.duration_sec, req.template,
                               output_name=unique_name("motion", "mp4"))
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/api/ai/templates")
def api_templates():
    """Danh sách mẫu video, giọng đọc và giọng văn hiện có"""
    return {
        "templates": [{"id": k, "label": v["label"]} for k, v in TEMPLATES.items()],
        "voices": [{"id": k, "label": v} for k, v in VOICES.items()],
        "script_styles": list(STYLES),
        "pipeline_cost_credits": config.pipeline_cost_credits(),
        "tryon_preview_cost_credits": config.tryon_preview_cost_credits(),
        "engines": {
            "analysis": script_engine.engine_name(),
            "tryon": vton_engine.engine_name(),
            "video": motion_engine.engine_name(),
        },
    }


class ScriptRequest(BaseModel):
    product_title: str = Field(min_length=2, max_length=200)
    price: int = Field(gt=0, le=1_000_000_000)
    fabric: Optional[str] = Field(default=None, max_length=100)
    category: Optional[str] = Field(default=None, max_length=100)
    style: str = "genz"


@router.post("/api/ai/script")
def api_script(req: ScriptRequest, user: dict = Depends(get_current_user)):
    """Task 4: Soạn kịch bản review"""
    return generate_koc_script(req.product_title, req.price, req.fabric, req.style, req.category)


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: str = tts_engine.DEFAULT_VOICE


@router.post("/api/ai/tts")
def api_tts(req: TTSRequest, user: dict = Depends(get_current_user)):
    """Task 5: Lồng tiếng tiếng Việt và phụ đề"""
    return generate_speech(req.text, req.voice, output_name=unique_name("tts", "mp3"))


class RenderRequest(BaseModel):
    video_url: str
    audio_url: str


@router.post("/api/ai/render")
def api_render(req: RenderRequest, user: dict = Depends(get_current_user)):
    """Task 6: Ghép video và âm thanh thành MP4"""
    return render_final_video(resolve_media_ref(req.video_url), resolve_media_ref(req.audio_url),
                              output_name=unique_name("final", "mp4"))


class ScriptPreviewRequest(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    price: int = Field(gt=0, le=1_000_000_000)
    fabric: Optional[str] = Field(default=None, max_length=100)
    category: Optional[str] = Field(default=None, max_length=100)
    style: str = "genz"
    features: List[Annotated[str, Field(max_length=80)]] = Field(
        default_factory=list, max_length=12, description="Điểm nổi bật AI nhận ra từ ảnh (màu, chi tiết)")


@router.post("/api/ai/script/preview")
def api_preview_script(req: ScriptPreviewRequest, user: dict = Depends(get_current_user)):
    """Viết trước kịch bản để người bán xem và sửa (thêm tên shop, hotline...) trước khi tạo video"""
    if req.style not in STYLES:
        raise HTTPException(status_code=400, detail="Phong cách kịch bản không hợp lệ")
    analysis = {"key_features": [f.strip() for f in req.features if f.strip()]} if req.features else None
    return generate_koc_script(req.title, req.price, req.fabric, style=req.style, category=req.category,
                               analysis=analysis)
