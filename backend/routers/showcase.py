"""Ảnh sản phẩm mẫu, thư viện mẫu video và nghe thử giọng đọc"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from backend.ai import tts as tts_engine
from backend.auth import get_current_user
from backend.services import samples

log = logging.getLogger("aura")
router = APIRouter()


@router.get("/api/samples/products")
def api_sample_products():
    return {"products": samples.list_sample_products()}


@router.post("/api/samples/products/{sample_id}/use")
def api_use_sample_product(sample_id: str, user: dict = Depends(get_current_user)):
    """Chuẩn bị ảnh mẫu trên máy chủ để tạo video thử như ảnh tự tải lên."""
    if sample_id not in samples.SAMPLE_PRODUCTS:
        raise HTTPException(status_code=404, detail="Không có sản phẩm mẫu này")
    try:
        return samples.use_sample_product(sample_id)
    except samples.SampleUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get("/api/templates/showcase")
def api_templates_showcase():
    return {"templates": samples.list_showcase()}


@router.get("/api/ai/tts/voices-preview")
def api_tts_voices_preview():
    return {"voices": [{"id": vid, "label": label, "preview_url": f"/api/ai/tts/preview/{vid}"}
                       for vid, label in tts_engine.VOICES.items()]}


@router.get("/api/ai/tts/preview/{voice_id}")
def api_tts_preview(voice_id: str):
    """Không cần đăng nhập để thẻ <audio> phát được; file được tạo một lần rồi dùng lại."""
    if voice_id not in tts_engine.VOICES:
        raise HTTPException(status_code=404, detail="Không có giọng đọc này")
    try:
        path = tts_engine.preview_voice(voice_id)
    except Exception as e:  # edge-tts cần internet
        log.warning("Không tạo được file nghe thử %s: %s", voice_id, e)
        raise HTTPException(status_code=503, detail="Chưa nghe thử được giọng này (máy chủ chưa kết nối được "
                                                    "dịch vụ lồng tiếng). Video vẫn tạo được bình thường.")
    return FileResponse(path, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})
