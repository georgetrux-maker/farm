import io
import json
import logging
import os
import sqlite3
import uuid
from contextlib import asynccontextmanager
from typing import List, Optional

import uvicorn
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, HttpUrl

from backend import config
from backend.ai import motion as motion_engine
from backend.ai import script as script_engine
from backend.ai import segmentation as seg_engine
from backend.ai import tts as tts_engine
from backend.ai import vton as vton_engine
from backend.ai.http_utils import ProviderError
from backend.ai.motion import TEMPLATES, generate_motion
from backend.ai.product_analysis import analyze_product
from backend.ai.render import render_final_video
from backend.ai.script import STYLES, generate_koc_script
from backend.ai.segmentation import segment_garment
from backend.ai.tts import VOICES, generate_speech
from backend.ai.vton import generate_tryon
from backend.auth import get_current_user, require_admin_role, require_admin_token
from backend.database import (
    add_brand_avatar_entry, create_product, get_brand_avatar, get_brand_avatars_list,
    get_dashboard_summary, get_db, get_product, get_system_settings, get_user, init_db, list_products,
    public_user, save_system_settings, set_default_brand_avatar,
)
from backend.ffmpeg_utils import FFmpegError, ffmpeg_available
from backend.media_paths import MediaPathError, media_path, media_url, resolve_media_ref, try_resolve_media_ref
from backend.services.cache_manager import check_tryon_cache, save_tryon_cache
from backend.services.queue_manager import (
    InsufficientCredits, approve_job, create_ai_job, create_ai_jobs, ensure_product_analysis, get_job_status,
    recover_stale_jobs, reject_job,
)
from backend.services.scraper import scrape_product_url
from backend.services.security import check_rate_limit
from backend.services.size_advisor import calculate_smart_size
from backend.services.wallet import (
    WalletError, generate_vietqr_deposit, get_transaction, verify_and_credit_transaction,
)

log = logging.getLogger("aura")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    recovered = recover_stale_jobs()
    if recovered:
        log.warning("Đã hoàn credit cho %d job bị dở dang do server khởi động lại", recovered)
    if config.allow_demo_user():
        log.warning("ALLOW_DEMO_USER đang bật: request không có token được coi là user demo. KHÔNG dùng khi chạy thật.")
    yield


app = FastAPI(title="Aura Fashion AI API", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Admin-Token"],
)


# =============================================================================
# RATE LIMIT (Task 24)
# =============================================================================
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    # Không tính file tĩnh và việc hỏi tiến độ job (frontend hỏi liên tục)
    exempt = (not path.startswith("/api/")) or (request.method == "GET" and path.startswith("/api/jobs/"))
    if not exempt:
        client_ip = request.client.host if request.client else "unknown"
        res = check_rate_limit(client_ip, max_requests=config.rate_limit_per_minute())
        if not res["allowed"]:
            return JSONResponse(status_code=429, content={"detail": res["error"]},
                                headers={"Retry-After": str(res["retry_after"])})
    return await call_next(request)


@app.exception_handler(MediaPathError)
async def media_path_error_handler(request: Request, exc: MediaPathError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(FFmpegError)
async def ffmpeg_error_handler(request: Request, exc: FFmpegError):
    log.error("FFmpeg: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Lỗi xử lý video trên máy chủ"})


def _unique(prefix: str, ext: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}.{ext}"


def _product_out(product: dict) -> dict:
    out = {k: v for k, v in product.items() if k != "analysis_json"}
    out["analysis"] = json.loads(product["analysis_json"]) if product.get("analysis_json") else None
    return out


def _owned_product(product_id: str, user: dict) -> dict:
    product = get_product(product_id)
    # Sản phẩm của người khác cũng trả 404 để không lộ việc nó tồn tại
    if not product or (product["owner_id"] not in (None, user["id"]) and user["role"] != "admin"):
        raise HTTPException(status_code=404, detail="Sản phẩm không tồn tại")
    return product


# =============================================================================
# UPLOAD & SẢN PHẨM
# =============================================================================
@app.post("/api/uploads/image")
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
        name = os.path.join("uploads", _unique("img", "png"))
        img.convert("RGBA").save(media_path(name), "PNG")
    else:
        name = os.path.join("uploads", _unique("img", "jpg"))
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


@app.post("/api/products/analyze")
def api_analyze_product(req: AnalyzeRequest, user: dict = Depends(get_current_user)):
    """Chấm chất lượng ảnh và (nếu có Claude) mô tả sản phẩm: loại, màu, chất liệu, điểm nổi bật"""
    return analyze_product(resolve_media_ref(req.image_url), req.title)


@app.post("/api/products")
def api_create_product(req: ProductCreateRequest, user: dict = Depends(get_current_user)):
    image_path = resolve_media_ref(req.image_url)
    if req.analysis is not None and len(json.dumps(req.analysis, ensure_ascii=False)) > 20_000:
        raise HTTPException(status_code=400, detail="Dữ liệu phân tích quá lớn")
    return _product_out(create_product(
        owner_id=user["id"], title=req.title.strip(), price=req.price, image_url=media_url(image_path),
        category=req.category, fabric_type=req.fabric_type, original_price=req.original_price,
        affiliate_shopee_url=str(req.affiliate_shopee_url) if req.affiliate_shopee_url else None,
        affiliate_tiktok_url=str(req.affiliate_tiktok_url) if req.affiliate_tiktok_url else None,
        analysis=req.analysis,
    ))


@app.get("/api/products")
def api_list_products(user: dict = Depends(get_current_user)):
    return [_product_out(p) for p in list_products(user["id"])]


@app.get("/api/products/{product_id}")
def api_get_product(product_id: str, user: dict = Depends(get_current_user)):
    return _product_out(_owned_product(product_id, user))


# =============================================================================
# GIAI ĐOẠN 1: TỪNG BƯỚC AI RIÊNG LẺ (Tasks 1 - 6)
# =============================================================================
class SegmentRequest(BaseModel):
    image_url: str = Field(description="Đường dẫn /media/... của ảnh đã upload")


@app.post("/api/ai/segment")
def api_segment(req: SegmentRequest, user: dict = Depends(get_current_user)):
    """Task 1: Tách nền trang phục"""
    return segment_garment(resolve_media_ref(req.image_url), output_name=_unique("seg", "png"))


class TryOnRequest(BaseModel):
    product_id: str
    avatar_id: str = "model_01"
    body_shape: str = Field(default="standard", max_length=30)
    height: float = Field(default=158.0, ge=120, le=220)
    weight: float = Field(default=51.0, ge=30, le=200)


@app.post("/api/ai/tryon")
def api_tryon(req: TryOnRequest, user: dict = Depends(get_current_user)):
    """Task 2 & 23: Thử đồ ảo có cache tiết kiệm GPU"""
    product = _owned_product(req.product_id, user)
    avatar = get_brand_avatar(req.avatar_id)
    if avatar is None:
        raise HTTPException(status_code=404, detail="Người mẫu không tồn tại")

    cache = check_tryon_cache(req.product_id, req.avatar_id, req.body_shape, req.height, req.weight)
    if cache["cached"]:
        return {"status": "success", "cached": True, "media_url": cache["result_image_url"],
                "gpu_cost_saved": cache["gpu_cost_saved"]}

    analysis = ensure_product_analysis(product)
    product_image = try_resolve_media_ref(product["image_url"])
    garment = product_image if vton_engine.engine_name() == "fashn" else \
        segment_garment(product_image, output_name=_unique("seg", "png"))["output_path"]
    try:
        res = generate_tryon(garment, req.avatar_id, avatar, {"height": req.height, "weight": req.weight},
                             output_name=_unique("tryon", "jpg"), garment_type=analysis.get("garment_type", "auto"),
                             photo_type=analysis.get("photo_type", "auto"))
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))
    save_tryon_cache(req.product_id, req.avatar_id, req.body_shape, req.height, req.weight, res["media_url"])
    return {**res, "cached": False}


class MotionRequest(BaseModel):
    image_url: str
    duration_sec: int = Field(default=5, ge=1, le=15)
    template: str = motion_engine.DEFAULT_TEMPLATE


@app.post("/api/ai/motion")
def api_motion(req: MotionRequest, user: dict = Depends(get_current_user)):
    """Task 3: Sinh video dọc 9:16 theo mẫu chuyển động"""
    if req.template not in TEMPLATES:
        raise HTTPException(status_code=400, detail=f"Mẫu video phải là một trong: {', '.join(TEMPLATES)}")
    try:
        return generate_motion(resolve_media_ref(req.image_url), req.duration_sec, req.template,
                               output_name=_unique("motion", "mp4"))
    except ProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/ai/templates")
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


@app.post("/api/ai/script")
def api_script(req: ScriptRequest, user: dict = Depends(get_current_user)):
    """Task 4: Soạn kịch bản review"""
    return generate_koc_script(req.product_title, req.price, req.fabric, req.style, req.category)


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: str = tts_engine.DEFAULT_VOICE


@app.post("/api/ai/tts")
def api_tts(req: TTSRequest, user: dict = Depends(get_current_user)):
    """Task 5: Lồng tiếng tiếng Việt và phụ đề"""
    return generate_speech(req.text, req.voice, output_name=_unique("tts", "mp3"))


class RenderRequest(BaseModel):
    video_url: str
    audio_url: str


@app.post("/api/ai/render")
def api_render(req: RenderRequest, user: dict = Depends(get_current_user)):
    """Task 6: Ghép video và âm thanh thành MP4"""
    return render_final_video(resolve_media_ref(req.video_url), resolve_media_ref(req.audio_url),
                              output_name=_unique("final", "mp4"))


# =============================================================================
# GIAI ĐOẠN 2: TÀI KHOẢN, HÀNG ĐỢI & THANH TOÁN (Tasks 7 - 11)
# =============================================================================
@app.get("/api/user/profile")
def api_get_profile(user: dict = Depends(get_current_user)):
    """Task 7 & 19: Thông tin tài khoản & hồ sơ cơ thể của user đang đăng nhập"""
    return public_user(user)


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


@app.post("/api/pipeline/run")
def api_run_pipeline(req: PipelineRunRequest, user: dict = Depends(get_current_user)):
    """Task 8: Trừ credit và đưa pipeline vào hàng đợi"""
    _owned_product(req.product_id, user)
    params = _pipeline_params(req)
    try:
        res = create_ai_job(user["id"], req.product_id, params)
    except InsufficientCredits as e:
        raise HTTPException(status_code=402, detail=str(e))
    return {
        "status": "success",
        "job_id": res["job_id"],
        "credits_deducted": res["credits_deducted"],
        "remaining_credits": res["remaining_credits"],
        "message": "Đã tiếp nhận yêu cầu và đang xử lý trong hàng đợi",
    }


@app.get("/api/jobs/{job_id}")
def api_job_status(job_id: str, user: dict = Depends(get_current_user)):
    """Task 8: Trạng thái và tiến độ % của job"""
    job = get_job_status(job_id, user_id=None if user["role"] == "admin" else user["id"])
    if job is None:
        raise HTTPException(status_code=404, detail="Job không tồn tại")
    return job


@app.post("/api/jobs/{job_id}/approve")
def api_approve_job(job_id: str, user: dict = Depends(get_current_user)):
    """Đồng ý ảnh thử đồ, tiếp tục tạo video"""
    if not approve_job(job_id, user["id"]):
        raise HTTPException(status_code=409, detail="Job không ở trạng thái chờ duyệt")
    return {"status": "queued"}


@app.post("/api/jobs/{job_id}/reject")
def api_reject_job(job_id: str, user: dict = Depends(get_current_user)):
    """Không ưng ảnh thử đồ: hủy job, hoàn credit (trừ phí thử đồ)"""
    res = reject_job(job_id, user["id"])
    if res is None:
        raise HTTPException(status_code=409, detail="Job không ở trạng thái chờ duyệt")
    res["remaining_credits"] = get_user(user["id"])["credits"]
    return res


class DepositRequest(BaseModel):
    amount_vnd: int


@app.post("/api/wallet/deposit")
def api_deposit(req: DepositRequest, user: dict = Depends(get_current_user)):
    """Task 9: Tạo mã VietQR nạp tiền (giao dịch ở trạng thái chờ)"""
    try:
        return generate_vietqr_deposit(user["id"], req.amount_vnd)
    except WalletError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/wallet/transactions/{transaction_id}")
def api_transaction_status(transaction_id: str, user: dict = Depends(get_current_user)):
    """Frontend hỏi định kỳ để biết tiền đã về chưa"""
    tx = get_transaction(transaction_id, user_id=user["id"])
    if tx is None:
        raise HTTPException(status_code=404, detail="Giao dịch không tồn tại")
    balance = get_user(user["id"])["credits"]
    return {"transaction_id": tx["id"], "status": tx["status"], "amount_vnd": tx["amount_vnd"],
            "credits": tx["amount_credits"], "balance": balance}


class VerifyDepositRequest(BaseModel):
    transaction_id: str


@app.post("/api/admin/wallet/verify", dependencies=[Depends(require_admin_token)])
def api_verify_deposit(req: VerifyDepositRequest):
    """Task 9: Quản trị viên xác nhận đã nhận tiền (Đợt 3 thay bằng webhook ngân hàng)"""
    res = verify_and_credit_transaction(req.transaction_id)
    if res["status"] == "error":
        raise HTTPException(status_code=404, detail=res["message"])
    return res


class ScrapeRequest(BaseModel):
    url: HttpUrl


@app.post("/api/scraper/product")
def api_scrape(req: ScrapeRequest, user: dict = Depends(get_current_user)):
    """Task 11: Nhận diện link Shopee / TikTok Shop (chưa cào dữ liệu thật)"""
    return scrape_product_url(str(req.url))


# =============================================================================
# GIAI ĐOẠN 3: B2B CREATOR STUDIO (Tasks 12 - 16)
# =============================================================================
@app.get("/api/avatars")
def api_get_avatars():
    """Task 14: Kho người mẫu AI"""
    return get_brand_avatars_list()


class AddAvatarRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    style: str = Field(min_length=1, max_length=120)
    height: str = Field(max_length=20)
    weight: str = Field(max_length=20)
    measurements: str = Field(max_length=40)
    avatar_url: str = Field(max_length=1000, description="URL https hoặc /media/... (ảnh toàn thân đã upload)")
    badge: Optional[str] = Field(default="Tùy Chỉnh", max_length=40)


@app.post("/api/avatars")
def api_add_avatar(req: AddAvatarRequest, user: dict = Depends(require_admin_role)):
    url = req.avatar_url.strip()
    if not url.startswith("https://"):
        url = media_url(resolve_media_ref(url))
    return add_brand_avatar_entry(
        name=req.name, style=req.style, height=req.height, weight=req.weight,
        measurements=req.measurements, avatar_url=url, badge=req.badge or "Tùy Chỉnh",
    )


class SetDefaultAvatarRequest(BaseModel):
    avatar_id: str


@app.post("/api/avatars/set-default")
def api_set_default_avatar(req: SetDefaultAvatarRequest, user: dict = Depends(require_admin_role)):
    res = set_default_brand_avatar(req.avatar_id)
    if res is None:
        raise HTTPException(status_code=404, detail="Người mẫu không tồn tại")
    return res


@app.get("/api/dashboard/stats")
def api_dashboard_stats(user: dict = Depends(get_current_user)):
    """Thống kê của user đang đăng nhập"""
    return get_dashboard_summary(user["id"])


@app.get("/api/settings")
def api_get_settings(user: dict = Depends(require_admin_role)):
    """Cấu hình hệ thống (API key không lưu ở đây mà trong backend/.env)"""
    return get_system_settings()


@app.post("/api/settings")
def api_save_settings(req: dict, user: dict = Depends(require_admin_role)):
    return save_system_settings(req)


class BatchCreateRequest(BaseModel):
    product_ids: List[str] = Field(min_length=1, max_length=50)
    avatar_id: Optional[str] = None
    template: str = motion_engine.DEFAULT_TEMPLATE
    voice: str = tts_engine.DEFAULT_VOICE
    script_style: str = "genz"
    duration_sec: int = Field(default=5, ge=3, le=15)


@app.post("/api/batch/create")
def api_batch_create(req: BatchCreateRequest, user: dict = Depends(get_current_user)):
    """Task 15: Tạo video hàng loạt (trừ credit cho từng video)"""
    for pid in req.product_ids:
        _owned_product(pid, user)
    params = _pipeline_params(req)
    try:
        res = create_ai_jobs(user["id"], req.product_ids, params, config.pipeline_cost_credits())
    except InsufficientCredits as e:
        raise HTTPException(status_code=402, detail=str(e))
    return {"status": "success", "total_jobs": len(res["job_ids"]), "job_ids": res["job_ids"],
            "credits_deducted": res["credits_deducted"], "remaining_credits": res["remaining_credits"]}


class ExportRequest(BaseModel):
    job_id: str


@app.post("/api/publisher/export")
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


# =============================================================================
# GIAI ĐOẠN 4: C2C SHOPPER APP (Tasks 17 - 22)
# =============================================================================
@app.get("/api/feed/videos")
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


@app.get("/api/products/{product_id}/hotspots")
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


class SizeAdvisorRequest(BaseModel):
    height: float = Field(default=158.0, ge=120, le=220)
    weight: float = Field(default=51.0, ge=30, le=200)
    bust: float = Field(default=84.0, ge=50, le=200)
    waist: float = Field(default=68.0, ge=40, le=200)
    hips: float = Field(default=92.0, ge=50, le=200)
    body_shape: str = Field(default="pear", max_length=30)
    product_id: Optional[str] = None


@app.post("/api/size/recommend")
def api_size_recommend(req: SizeAdvisorRequest):
    """Task 22: Tư vấn size"""
    links = {}
    product = get_product(req.product_id) if req.product_id else None
    if product:
        links = {k: v for k, v in (("shopee", product["affiliate_shopee_url"]),
                                   ("tiktok", product["affiliate_tiktok_url"])) if v}
    return calculate_smart_size(req.height, req.weight, req.bust, req.waist, req.hips, req.body_shape, links)


# =============================================================================
# KIỂM TRA SỨC KHỎE HỆ THỐNG (thay cho báo cáo "25 task PASSED" gõ cứng)
# =============================================================================
def _health_report() -> list:
    checks = []

    def add(name, status, module, note=""):
        checks.append({"task": len(checks) + 1, "name": name, "status": status, "module": module, "note": note})

    try:
        get_db().execute("SELECT 1").fetchone()
        add("Cơ sở dữ liệu", "PASSED", "database.py")
    except sqlite3.Error as e:
        add("Cơ sở dữ liệu", "FAILED", "database.py", str(e))
    add("FFmpeg", "PASSED" if ffmpeg_available() else "FAILED", "ffmpeg_utils.py",
        "" if ffmpeg_available() else "Chưa cài ffmpeg, không tạo được video")
    try:
        import edge_tts  # noqa: F401
        add("Lồng tiếng edge-tts", "PASSED", "ai/tts.py", "Cần internet để gọi dịch vụ")
    except ImportError:
        add("Lồng tiếng edge-tts", "WARNING", "ai/tts.py", "Chưa cài edge-tts, sẽ dùng phương án dự phòng")
    media_ok = os.access(config.media_dir(), os.W_OK)
    add("Thư mục media", "PASSED" if media_ok else "FAILED", config.media_dir())
    add("Tài khoản nhận tiền VietQR", "PASSED" if config.bank_account_no() else "WARNING", "services/wallet.py",
        "" if config.bank_account_no() else "Chưa đặt VIETQR_ACCOUNT_NO")
    for name, module, engine, how in (
        ("Phân tích ảnh & viết kịch bản (Claude)", "ai/claude_client.py", script_engine.engine_name(),
         "đặt ANTHROPIC_API_KEY"),
        ("Tách nền trang phục", "ai/segmentation.py", seg_engine.engine_name(),
         "cài backend/requirements-ai.txt"),
        ("Thử đồ lên người mẫu (FASHN)", "ai/vton.py", vton_engine.engine_name(), "đặt FASHN_API_KEY"),
        ("Tạo video AI (Kling qua Replicate)", "ai/motion.py", motion_engine.engine_name(),
         "đặt REPLICATE_API_TOKEN"),
    ):
        real = not engine.startswith(("placeholder", "template"))
        add(name, "PASSED" if real else "WARNING", module,
            f"Đang dùng: {engine}" if real else f"Đang dùng engine tạm '{engine}'; để dùng AI thật: {how}")
    return checks


@app.get("/api/health")
def api_health():
    return {"status": "ok"}


@app.get("/api/system/audit-25-tasks")
def api_system_audit():
    report = _health_report()
    passed = sum(1 for r in report if r["status"] == "PASSED")
    failed = any(r["status"] == "FAILED" for r in report)
    return {
        "status": "DEGRADED" if failed else ("OK_WITH_WARNINGS" if passed < len(report) else "ALL_SYSTEMS_OPERATIONAL"),
        "passed_tasks": passed,
        "total_tasks": len(report),
        "accuracy_rate": f"{round(passed * 100 / len(report))}%",
        "report": report,
    }


# =============================================================================
# FILE TĨNH: chỉ phục vụ đúng các file cần thiết, không mở cả thư mục repo
# =============================================================================
app.mount("/media", StaticFiles(directory=config.media_dir()), name="media")
app.mount("/samples", StaticFiles(directory=config.SAMPLES_DIR), name="samples")

_PUBLIC_FILES = {"index.html", "app.js", "styles.css"}


@app.get("/", include_in_schema=False)
def serve_index():
    return FileResponse(os.path.join(config.REPO_DIR, "index.html"))


@app.get("/{filename}", include_in_schema=False)
def serve_public_file(filename: str):
    if filename not in _PUBLIC_FILES:
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(os.path.join(config.REPO_DIR, filename))


if __name__ == '__main__':
    uvicorn.run("backend.main:app", host="0.0.0.0", port=3456, reload=True)
