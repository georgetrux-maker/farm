import hmac
import io
import json
import secrets
import logging
import os
import sqlite3
import urllib.parse
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import List, Optional

import uvicorn
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
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
from backend.auth import bearer_token, get_current_user, require_admin_role, require_admin_token
from backend.crypto_utils import SecretKeyMissing, hash_password, unsign, verify_password
from backend.database import (
    add_brand_avatar_entry, create_product, get_brand_avatar, get_brand_avatars_list,
    create_session, delete_session, get_user_by_email, register_user,
    get_dashboard_summary, get_db, get_product, get_system_settings, get_user, init_db, list_products,
    public_user, save_system_settings, set_default_brand_avatar,
    get_admin_api_config, get_all_admin_api_configs, save_admin_api_config,
)

from backend.ffmpeg_utils import FFmpegError, ffmpeg_available
from backend.media_paths import MediaPathError, media_path, media_url, resolve_media_ref, try_resolve_media_ref
from backend.services.cache_manager import check_tryon_cache, save_tryon_cache
from backend.services.queue_manager import (
    InsufficientCredits, approve_job, create_ai_job, create_ai_jobs, ensure_product_analysis, get_job_status,
    list_jobs, recover_stale_jobs, reject_job,
)
from backend.services.scraper import scrape_product_url
from backend.services import social
from backend.services.bank_webhook import handle_sepay_event
from backend.services.security import check_rate_limit
from backend.services.size_advisor import calculate_smart_size
from backend.services.wallet import (
    WalletError, generate_vietqr_deposit, get_transaction, list_transactions, verify_and_credit_transaction,
)

log = logging.getLogger("aura")
_publish_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="aura-publish")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    social.recover_stale_publications()
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
    exempt = (not path.startswith("/api/")) or (request.method == "GET" and path.startswith("/api/jobs/")) \
        or path.startswith("/api/webhooks/")  # webhook đã có xác thực riêng, không được chặn nhầm
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
    custom_script: Optional[str] = None
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
            "custom_script": getattr(req, "custom_script", None),
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


@app.get("/api/jobs")
def api_list_jobs(limit: int = 60, user: dict = Depends(get_current_user)):
    """Danh sách video của người dùng đang đăng nhập (trang "Video của tôi")"""
    return list_jobs(user["id"], max(1, min(limit, 200)))


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


@app.get("/api/wallet/transactions")
def api_list_transactions(user: dict = Depends(get_current_user)):
    """Lịch sử credit của người dùng đang đăng nhập"""
    return list_transactions(user["id"])


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


def mask_key(val: str) -> str:
    if not val:
        return ""
    if len(val) <= 8:
        return "***"
    return f"{val[:6]}***{val[-4:]}"


@app.get("/api/admin/api-keys")
def api_get_admin_api_keys(user: dict = Depends(require_admin_role)):
    return {
        "anthropic": {
            "is_configured": bool(config.anthropic_api_key()),
            "masked_key": mask_key(config.anthropic_api_key()),
            "model": config.anthropic_model(),
        },
        "fashn": {
            "is_configured": bool(config.fashn_api_key()),
            "masked_key": mask_key(config.fashn_api_key()),
            "model_name": config.fashn_model_name(),
            "mode": config.fashn_mode(),
        },
        "replicate": {
            "is_configured": bool(config.replicate_api_token()),
            "masked_key": mask_key(config.replicate_api_token()),
            "video_model": config.replicate_video_model(),
            "kling_mode": config.kling_mode(),
        },
        "vietqr": {
            "bank_id": config.bank_id(),
            "account_no": config.bank_account_no(),
            "account_name": config.bank_account_name(),
            "is_configured": bool(config.bank_account_no()),
        },
        "sepay": {
            "is_configured": bool(config.sepay_webhook_key()),
            "masked_key": mask_key(config.sepay_webhook_key()),
        },
        "tiktok": {
            "is_configured": bool(config.tiktok_client_key()),
            "client_key": mask_key(config.tiktok_client_key()),
            "has_secret": bool(config.tiktok_client_secret()),
        },
        "facebook": {
            "is_configured": bool(config.facebook_app_id()),
            "app_id": mask_key(config.facebook_app_id()),
            "has_secret": bool(config.facebook_app_secret()),
        },
        "pricing": {
            "pipeline_cost_credits": config.pipeline_cost_credits(),
            "tryon_preview_cost_credits": config.tryon_preview_cost_credits(),
            "signup_bonus_credits": config.signup_bonus_credits(),
        }
    }


@app.post("/api/admin/api-keys")
def api_save_admin_api_keys(req: dict, user: dict = Depends(require_admin_role)):
    for k, v in req.items():
        if v is not None:
            if isinstance(v, str) and "***" in v:
                continue
            save_admin_api_config(k, str(v).strip())
    return {"status": "success", "message": "Đã lưu cấu hình API thành công"}


@app.post("/api/admin/api-keys/test")
def api_test_admin_api_key(req: dict, user: dict = Depends(require_admin_role)):
    provider = req.get("provider", "").lower()
    if provider == "anthropic":
        key = config.anthropic_api_key()
        if not key:
            return {"ok": False, "message": "Chưa điền Anthropic API Key"}
        try:
            import anthropic
            c = anthropic.Anthropic(api_key=key, timeout=8.0)
            c.models.list(limit=1)
            return {"ok": True, "message": "Kết nối Claude Anthropic thành công!"}
        except Exception as e:
            return {"ok": False, "message": f"Lỗi Anthropic: {str(e)[:150]}"}
    elif provider == "fashn":
        key = config.fashn_api_key()
        if not key:
            return {"ok": False, "message": "Chưa điền FASHN API Key"}
        try:
            res = httpx.get("https://api.fashn.ai/v1/models", headers={"Authorization": f"Bearer {key}"}, timeout=8.0)
            if res.status_code == 200:
                return {"ok": True, "message": "Kết nối FASHN.ai thành công!"}
            return {"ok": False, "message": f"FASHN báo lỗi xác thực (HTTP {res.status_code})"}
        except Exception as e:
            return {"ok": False, "message": f"Không kết nối được FASHN: {str(e)[:150]}"}
    elif provider == "replicate":
        token = config.replicate_api_token()
        if not token:
            return {"ok": False, "message": "Chưa điền Replicate API Token"}
        try:
            res = httpx.get("https://api.replicate.com/v1/account", headers={"Authorization": f"Bearer {token}"}, timeout=8.0)
            if res.status_code == 200:
                user_info = res.json().get("username", "")
                return {"ok": True, "message": f"Kết nối Replicate thành công! Tài khoản: {user_info}"}
            return {"ok": False, "message": f"Replicate báo lỗi token (HTTP {res.status_code})"}
        except Exception as e:
            return {"ok": False, "message": f"Không kết nối được Replicate: {str(e)[:150]}"}
    elif provider == "sepay":
        key = config.sepay_webhook_key()
        if not key:
            return {"ok": False, "message": "Chưa điền SePay Webhook Key"}
        return {"ok": True, "message": "SePay Webhook Key sẵn sàng"}
    return {"ok": False, "message": f"Nhà cung cấp không xác định: {provider}"}


@app.get("/api/admin/stats-overview")
def api_admin_stats_overview(user: dict = Depends(require_admin_role)):
    conn = get_db()
    total_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    total_credits = conn.execute("SELECT SUM(credits) FROM users").fetchone()[0] or 0
    total_revenue_vnd = conn.execute(
        "SELECT SUM(amount_vnd) FROM wallet_transactions WHERE status = 'success' AND transaction_type = 'deposit'"
    ).fetchone()[0] or 0

    total_jobs = conn.execute("SELECT COUNT(*) FROM ai_jobs").fetchone()[0]
    completed_jobs = conn.execute("SELECT COUNT(*) FROM ai_jobs WHERE status = 'completed'").fetchone()[0]

    recent_users = conn.execute("SELECT id, name, email, role, credits, created_at FROM users ORDER BY created_at DESC LIMIT 10").fetchall()
    recent_transactions = conn.execute(
        "SELECT t.*, u.name as user_name, u.email as user_email FROM wallet_transactions t "
        "LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT 20"
    ).fetchall()
    conn.close()

    return {
        "summary": {
            "total_users": total_users,
            "total_credits_in_circulation": total_credits,
            "total_revenue_vnd": total_revenue_vnd,
            "total_jobs": total_jobs,
            "completed_jobs": completed_jobs,
        },
        "recent_users": [dict(r) for r in recent_users],
        "recent_transactions": [dict(r) for r in recent_transactions],
    }


@app.get("/api/templates/showcase")
def api_templates_showcase():
    return {
        "templates": [
            {
                "id": "tpl_street_summer",
                "title": "Nàng Thơ Dạo Phố",
                "category": "Váy hoa / Đồ hè",
                "badge": "Xu Hướng",
                "video_url": "/samples/sample_final.mp4",
                "thumbnail_url": "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=80",
                "motion_template": "street",
                "voice_id": "vi-VN-HoaiMyNeural",
                "voice_name": "Hoài My (Nữ ngọt ngào)",
                "script_style": "genz",
                "music_name": "Lofi Chill Chic",
                "description": "Dáng đi dạo phố tự nhiên, tôn nét trẻ trung, bay bổng của váy hoa hoặc set đồ dạo phố.",
                "tags": ["Dạo phố", "Trẻ trung", "Mùa hè"],
            },
            {
                "id": "tpl_catwalk_office",
                "title": "Quý Cô Công Sở",
                "category": "Blazer / Sơ mi / Đầm công sở",
                "badge": "Thanh Lịch",
                "video_url": "/samples/sample_final.mp4",
                "thumbnail_url": "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=600&q=80",
                "motion_template": "catwalk",
                "voice_id": "vi-VN-HoaiMyNeural",
                "voice_name": "Hoài My (Nữ thanh lịch)",
                "script_style": "office",
                "music_name": "Fashion Week Runway",
                "description": "Bước đi sàn diễn tự tin, toát lên phong thái chuyên nghiệp, thời thượng của set đồ công sở.",
                "tags": ["Công sở", "Catwalk", "Sang trọng"],
            },
            {
                "id": "tpl_spin_evening",
                "title": "Đầm Dạ Tiệc Sang Chảnh",
                "category": "Váy dạ hội / Đầm ôm body",
                "badge": "Cao Cấp",
                "video_url": "/samples/sample_final.mp4",
                "thumbnail_url": "https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=600&q=80",
                "motion_template": "spin_360",
                "voice_id": "vi-VN-HoaiMyNeural",
                "voice_name": "Hoài My (Nữ quý phái)",
                "script_style": "office",
                "music_name": "Luxury Lounge Ambient",
                "description": "Góc quay xoay tròn 360 độ khoe trọn đường cong cơ thể và sự lộng lẫy của trang phục dạ tiệc.",
                "tags": ["Dự tiệc", "Xoay 360", "Quyến rũ"],
            },
            {
                "id": "tpl_fabric_flash_sale",
                "title": "Xả Kho Flash Sale TikTok",
                "category": "Áo thun / Polo / Đồ mặc nhà",
                "badge": "Bán Chạy",
                "video_url": "/samples/sample_final.mp4",
                "thumbnail_url": "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=600&q=80",
                "motion_template": "fabric_closeup",
                "voice_id": "vi-VN-NamMinhNeural",
                "voice_name": "Nam Minh (Nam dồn dập)",
                "script_style": "honest",
                "music_name": "Upbeat TikTok Beat",
                "description": "Zoom cận cảnh từng thớ vải mềm mịn và form áo, thúc đẩy người xem bấm vào giỏ hàng ngay.",
                "tags": ["Flash Sale", "Chất vải", "Xả kho"],
            },
        ]
    }


@app.get("/api/ai/tts/voices-preview")
def api_tts_voices_preview():
    return {
        "voices": [
            {
                "id": "vi-VN-HoaiMyNeural",
                "label": "Hoài My (Nữ miền Nam, ngọt ngào)",
                "gender": "female",
                "preview_url": "/samples/preview_hoaimy.mp3",
            },
            {
                "id": "vi-VN-NamMinhNeural",
                "label": "Nam Minh (Nam miền Bắc, truyền cảm)",
                "gender": "male",
                "preview_url": "/samples/preview_namminh.mp3",
            },
        ]
    }


class ScriptPreviewRequest(BaseModel):
    title: str = "Áo Thun Cotton"
    price: float = 189000
    fabric: Optional[str] = None
    category: Optional[str] = None
    style: str = "genz"


@app.post("/api/ai/script/preview")
def api_preview_script(req: ScriptPreviewRequest, user: dict = Depends(get_current_user)):
    """Tạo trước kịch bản review 3 câu để người dùng xem và chỉnh sửa trước khi chạy pipeline"""
    from backend.ai.script import generate_koc_script
    if req.style not in STYLES:
        raise HTTPException(status_code=400, detail="Phong cách kịch bản không hợp lệ")
    res = generate_koc_script(req.title, req.price, req.fabric, style=req.style, category=req.category)
    return res


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
def api_system_audit(user: dict = Depends(require_admin_role)):
    """Tình trạng cấu hình máy chủ: chỉ quản trị viên xem được"""
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
# ĐĂNG KÝ / ĐĂNG NHẬP
# =============================================================================
class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


def _login_rate_limit(request: Request, email: str):
    ip = request.client.host if request.client else "unknown"
    # Chặn dò mật khẩu: tối đa 10 lần mỗi phút cho mỗi IP và mỗi email
    for key in (f"auth-ip:{ip}", f"auth-email:{email.lower()}"):
        res = check_rate_limit(key, max_requests=10)
        if not res["allowed"]:
            raise HTTPException(status_code=429, detail="Thử đăng nhập quá nhiều lần, vui lòng chờ một phút")


def _session_response(user: dict) -> dict:
    return {"token": create_session(user["id"], config.session_days()), "user": public_user(user)}


@app.post("/api/auth/register")
def api_register(req: RegisterRequest, request: Request):
    if not config.allow_signup():
        raise HTTPException(status_code=403, detail="Hiện chưa mở đăng ký tài khoản mới")
    _login_rate_limit(request, req.email)
    user = register_user(req.name.strip(), req.email.strip().lower(), hash_password(req.password),
                         credits=config.signup_bonus_credits())
    if user is None:
        raise HTTPException(status_code=409, detail="Email này đã được đăng ký")
    return _session_response(user)


@app.post("/api/auth/login")
def api_login(req: LoginRequest, request: Request):
    _login_rate_limit(request, req.email)
    user = get_user_by_email(req.email.strip())
    if not user or not user.get("password_hash") or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Sai email hoặc mật khẩu")
    return _session_response(user)


@app.post("/api/auth/logout")
def api_logout(token: str = Depends(bearer_token)):
    if token:
        delete_session(token)
    return {"status": "ok"}


# =============================================================================
# WEBHOOK NGÂN HÀNG (SePay): tự cộng credit khi tiền về
# =============================================================================
@app.post("/api/webhooks/sepay", include_in_schema=False)
async def api_sepay_webhook(request: Request):
    expected = config.sepay_webhook_key()
    provided = request.headers.get("authorization", "")
    if not expected or not hmac.compare_digest(provided.encode(), f"Apikey {expected}".encode()):
        raise HTTPException(status_code=401, detail="Sai API key webhook")
    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Body không phải JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Body không hợp lệ")
    res = handle_sepay_event(payload)
    log.info("Webhook SePay %s: %s", payload.get("id"), res)
    # SePay coi phản hồi 200 + success=true là đã nhận, không gửi lại
    return {"success": True, **res}


# =============================================================================
# KẾT NỐI & ĐĂNG VIDEO LÊN TIKTOK / FACEBOOK
# =============================================================================
def _social_platform(platform: str) -> str:
    if platform not in social.PLATFORMS:
        raise HTTPException(status_code=404, detail="Nền tảng không hỗ trợ")
    return platform


@app.get("/api/social/status")
def api_social_status(user: dict = Depends(get_current_user)):
    return {
        "platforms": {p: social.platform_configured(p) for p in social.PLATFORMS},
        "accounts": social.list_accounts(user["id"]),
    }


def _oauth_cookie(platform: str) -> str:
    return f"aura_oauth_{platform}"


@app.get("/api/social/{platform}/connect")
def api_social_connect(platform: str, user: dict = Depends(get_current_user)):
    """Trả link đăng nhập TikTok/Facebook để frontend chuyển hướng tới"""
    nonce = secrets.token_urlsafe(16)
    try:
        url = social.authorize_url(_social_platform(platform), user["id"], nonce)
    except (social.SocialError, SecretKeyMissing) as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Gắn phiên kết nối với trình duyệt đã bấm nút: chặn việc gửi link cấp quyền cho người khác bấm
    response = JSONResponse({"auth_url": url})
    response.set_cookie(_oauth_cookie(platform), nonce, max_age=600, httponly=True, samesite="lax",
                        secure=config.public_base_url().startswith("https://"), path="/api/social")
    return response


@app.get("/api/social/{platform}/callback", include_in_schema=False)
def api_social_callback(request: Request, platform: str, state: str = "", code: str = "", error: str = ""):
    """TikTok/Facebook chuyển người dùng về đây sau khi đồng ý cấp quyền"""
    _social_platform(platform)

    def back(result: str, message: str = ""):
        query = urllib.parse.urlencode({"social": platform, "result": result, "message": message[:300]})
        return RedirectResponse(f"{config.frontend_url()}/?{query}")

    try:
        data = unsign(state)
    except SecretKeyMissing as e:
        return back("error", str(e))
    if not data or data.get("p") != platform:
        return back("error", "Phiên kết nối không hợp lệ hoặc đã hết hạn, vui lòng thử lại")
    cookie = request.cookies.get(_oauth_cookie(platform), "")
    if not cookie or not hmac.compare_digest(cookie, str(data.get("n", ""))):
        return back("error", "Vui lòng bấm Kết nối ngay trên trình duyệt đang đăng nhập AURA")
    if error or not code:
        return back("cancelled", "Bạn đã hủy cấp quyền")
    try:
        accounts = social.complete_oauth(platform, data["uid"], code)
    except (social.SocialError, SecretKeyMissing) as e:
        return back("error", str(e))
    return back("connected", ", ".join(a["display_name"] for a in accounts))


@app.delete("/api/social/accounts/{account_id}")
def api_social_disconnect(account_id: str, user: dict = Depends(get_current_user)):
    if not social.delete_account(account_id, user["id"]):
        raise HTTPException(status_code=404, detail="Tài khoản không tồn tại")
    return {"status": "deleted"}


def _owned_account(account_id: str, user: dict) -> dict:
    account = social.get_account(account_id, user["id"])
    if account is None:
        raise HTTPException(status_code=404, detail="Tài khoản mạng xã hội không tồn tại")
    return account


@app.get("/api/social/accounts/{account_id}/creator-info")
def api_tiktok_creator_info(account_id: str, user: dict = Depends(get_current_user)):
    """TikTok yêu cầu hiển thị các lựa chọn quyền riêng tư của nhà sáng tạo trước khi đăng"""
    account = _owned_account(account_id, user)
    if account["platform"] != "tiktok":
        return {}
    try:
        return social.tiktok_creator_info(account)
    except (social.SocialError, ProviderError, SecretKeyMissing) as e:
        raise HTTPException(status_code=502, detail=str(e))


class PublishRequest(BaseModel):
    job_id: str
    account_id: str
    caption: str = Field(min_length=1, max_length=2200)
    privacy_level: Optional[str] = Field(default=None, max_length=50, description="Bắt buộc với TikTok")
    allow_comment: bool = True
    allow_duet: bool = True
    allow_stitch: bool = True


@app.post("/api/social/publish")
def api_social_publish(req: PublishRequest, user: dict = Depends(get_current_user)):
    account = _owned_account(req.account_id, user)
    job = get_job_status(req.job_id, user_id=user["id"])
    if job is None:
        raise HTTPException(status_code=404, detail="Job không tồn tại")
    if job["status"] != "completed" or not job["output_video_url"]:
        raise HTTPException(status_code=409, detail="Video chưa tạo xong")
    if account["platform"] == "tiktok" and not req.privacy_level:
        raise HTTPException(status_code=400, detail="Vui lòng chọn chế độ hiển thị cho video TikTok")
    pub_id = social.create_publication(user["id"], job, account, req.caption)
    options = {"privacy_level": req.privacy_level, "allow_comment": req.allow_comment,
               "allow_duet": req.allow_duet, "allow_stitch": req.allow_stitch}
    _publish_executor.submit(social.run_publication, pub_id, account, job["output_video_url"], req.caption, options)
    return {"status": "pending", "publication_id": pub_id}


@app.get("/api/social/publications")
def api_social_publications(job_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    return social.list_publications(user["id"], job_id)


# =============================================================================
# FILE TĨNH: chỉ phục vụ đúng các file cần thiết, không mở cả thư mục repo
# =============================================================================
app.mount("/media", StaticFiles(directory=config.media_dir()), name="media")
app.mount("/samples", StaticFiles(directory=config.SAMPLES_DIR), name="samples")

# Bản HTML thuần cũ: /legacy (cần app.js, styles.css ở gốc)
_LEGACY_FILES = {"app.js", "styles.css"}
# Bản React đã build (npm run build) được phục vụ ở "/" nếu có
_DIST_DIR = os.path.join(config.REPO_DIR, "frontend", "dist")
_HAS_DIST = os.path.isfile(os.path.join(_DIST_DIR, "index.html"))
if _HAS_DIST and os.path.isdir(os.path.join(_DIST_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST_DIR, "assets")), name="assets")
_DIST_FILES = {f for f in os.listdir(_DIST_DIR) if os.path.isfile(os.path.join(_DIST_DIR, f))} if _HAS_DIST else set()


@app.get("/", include_in_schema=False)
def serve_index():
    if _HAS_DIST:
        return FileResponse(os.path.join(_DIST_DIR, "index.html"))
    return FileResponse(os.path.join(config.REPO_DIR, "index.html"))


@app.get("/legacy", include_in_schema=False)
def serve_legacy():
    return FileResponse(os.path.join(config.REPO_DIR, "index.html"))


@app.get("/{filename}", include_in_schema=False)
def serve_public_file(filename: str):
    if filename in _DIST_FILES and filename != "index.html":
        return FileResponse(os.path.join(_DIST_DIR, filename))
    if filename in _LEGACY_FILES:
        return FileResponse(os.path.join(config.REPO_DIR, filename))
    raise HTTPException(status_code=404, detail="Not Found")


if __name__ == '__main__':
    uvicorn.run("backend.main:app", host="0.0.0.0", port=3456, reload=True)
