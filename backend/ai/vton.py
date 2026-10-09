"""Thử đồ ảo: ghép trang phục lên người mẫu.

- Có FASHN_API_KEY: gọi FASHN (https://docs.fashn.ai) để ghép thật lên ảnh người mẫu.
- Chưa có: đặt trang phục lên phông studio (ảnh minh họa, không có người mẫu).
"""
import logging
from typing import Optional

from PIL import Image, ImageDraw

from backend import config
from backend.ai import http_utils
from backend.ai.http_utils import ProviderError
from backend.media_paths import media_path, media_url, try_resolve_media_ref

log = logging.getLogger(__name__)

FASHN_BASE_URL = "https://api.fashn.ai/v1"
_FASHN_CATEGORY = {"tops": "tops", "bottoms": "bottoms", "one-pieces": "one-pieces"}
_FASHN_PHOTO_TYPE = {"flat-lay": "flat-lay", "mannequin": "flat-lay", "model": "model"}

# Hồ sơ dự phòng khi không tìm thấy người mẫu trong bảng brand_avatars
AVATARS = {
    "model_01": {"name": "Linh Đan", "height": 168.0, "weight": 49.0},
    "model_02": {"name": "Bảo Anh", "height": 162.0, "weight": 47.0},
    "model_03": {"name": "Mai Khanh", "height": 172.0, "weight": 53.0},
}


def engine_name() -> str:
    return "fashn" if config.fashn_api_key() else "placeholder-composite"


def _parse_number(value, default: float) -> float:
    """Đổi '1m68' -> 168, '49kg' -> 49."""
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").lower().replace("kg", "").replace("cm", "").strip()
    try:
        if "m" in text:
            meters, _, cm = text.partition("m")
            return float(meters) * 100 + float(cm or 0)
        return float(text)
    except ValueError:
        return default


def avatar_profile(avatar_id: str, avatar_row: Optional[dict] = None) -> dict:
    if avatar_row:
        return {
            "name": avatar_row["name"],
            "height": _parse_number(avatar_row.get("height"), 165.0),
            "weight": _parse_number(avatar_row.get("weight"), 50.0),
        }
    return AVATARS.get(avatar_id, AVATARS["model_01"])


def _image_input(ref: str) -> str:
    """URL http(s) giữ nguyên (FASHN tự tải); file trong media -> URL công khai hoặc data URI."""
    if ref.startswith(("https://", "http://")):
        return ref
    path = try_resolve_media_ref(ref)
    if not path:
        raise ProviderError("Không tìm thấy ảnh đầu vào cho thử đồ")
    return http_utils.public_media_url(path) or http_utils.image_data_uri(path)


def _fashn_tryon(garment_path: str, model_image_ref: str, garment_type: str, photo_type: str,
                 output_name: str) -> str:
    headers = {"Authorization": f"Bearer {config.fashn_api_key()}"}
    inputs = {
        "model_image": _image_input(model_image_ref),
        "garment_image": http_utils.public_media_url(garment_path) or http_utils.image_data_uri(garment_path),
        "category": _FASHN_CATEGORY.get(garment_type, "auto"),
        "garment_photo_type": _FASHN_PHOTO_TYPE.get(photo_type, "auto"),
        "mode": config.fashn_mode(),
        "output_format": "jpeg",
    }
    with http_utils.http_client() as client:
        res = client.post(f"{FASHN_BASE_URL}/run", headers=headers,
                          json={"model_name": config.fashn_model_name(), "inputs": inputs})
        if res.status_code == 401:
            raise ProviderError("FASHN_API_KEY không hợp lệ")
        if res.status_code == 429:
            raise ProviderError("Tài khoản FASHN hết credit hoặc gửi quá nhanh")
        if res.status_code >= 400:
            raise ProviderError(f"FASHN từ chối yêu cầu (HTTP {res.status_code}): {res.text[:200]}")
        prediction_id = res.json().get("id")
        if not prediction_id:
            raise ProviderError("FASHN không trả về mã yêu cầu")

        def fetch():
            r = client.get(f"{FASHN_BASE_URL}/status/{prediction_id}", headers=headers)
            if r.status_code >= 400:
                raise ProviderError(f"Không đọc được trạng thái FASHN (HTTP {r.status_code})")
            return r.json()

        state = http_utils.poll(fetch, lambda s: s.get("status") in ("completed", "failed", "canceled", "time_out"),
                                timeout_sec=config.ai_timeout_sec(), interval=2.0)

    if state.get("status") != "completed":
        err = state.get("error") or {}
        message = err.get("message") if isinstance(err, dict) else str(err)
        if isinstance(err, dict) and err.get("name") == "PoseError":
            message = "Không nhận diện được dáng người trong ảnh người mẫu hoặc ảnh sản phẩm"
        raise ProviderError(f"Thử đồ thất bại: {message or state.get('status')}")
    outputs = state.get("output") or []
    if not outputs:
        raise ProviderError("FASHN không trả về ảnh kết quả")
    return http_utils.download_to_media(outputs[0], output_name)


def _placeholder_tryon(garment_path: Optional[str], output_name: str) -> str:
    output_path = media_path(output_name)
    width, height = 720, 1280
    base = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(base)
    for y in range(height):
        ratio = y / height
        draw.line([(0, y), (width, y)], fill=(int(18 + 22 * ratio), int(20 + 22 * ratio), int(29 + 26 * ratio)))
    if garment_path:
        with Image.open(garment_path) as g:
            garment = g.convert("RGBA")
        garment.thumbnail((int(width * 0.8), int(height * 0.7)))
        base.paste(garment, ((width - garment.width) // 2, (height - garment.height) // 2), garment)
    base.save(output_path, "JPEG", quality=90)
    return output_path


def generate_tryon(garment_path: Optional[str], avatar_id: str = "model_01", avatar_row: Optional[dict] = None,
                   user_measurements: Optional[dict] = None, output_name: str = "tryon_result.jpg",
                   garment_type: str = "auto", photo_type: str = "auto") -> dict:
    """
    Task 2: Thử đồ ảo. `garment_path` là ảnh sản phẩm (trong thư mục media).
    """
    avatar = avatar_profile(avatar_id, avatar_row)
    engine = engine_name()
    if engine == "fashn":
        if not garment_path:
            raise ProviderError("Thiếu ảnh sản phẩm để thử đồ")
        if not avatar_row or not avatar_row.get("avatar_url"):
            raise ProviderError("Người mẫu chưa có ảnh toàn thân để thử đồ")
        output_path = _fashn_tryon(garment_path, avatar_row["avatar_url"], garment_type, photo_type, output_name)
    else:
        output_path = _placeholder_tryon(garment_path, output_name)

    m = user_measurements or {}
    h = float(m.get("height") or avatar["height"])
    w = float(m.get("weight") or avatar["weight"])
    bmi = w / ((h / 100) ** 2)

    return {
        "status": "success",
        "engine": engine,
        "output_path": output_path,
        "media_url": media_url(output_path),
        "avatar_id": avatar_id,
        "avatar_used": avatar["name"],
        "recommended_size": "S" if bmi < 19.5 else ("M" if bmi < 23 else "L"),
    }
