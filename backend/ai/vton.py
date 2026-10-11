"""Thử đồ ảo: ghép trang phục lên người mẫu.

- Có FASHN_API_KEY: gọi FASHN (https://docs.fashn.ai) để ghép thật lên ảnh người mẫu.
- Chưa có: đặt trang phục lên phông studio (ảnh minh họa, không có người mẫu).
"""
import logging
from typing import Optional

from PIL import Image, ImageDraw, ImageFilter

from backend import config
from backend.ai import http_utils
from backend.ai.http_utils import ProviderError
from backend.ai.scenes import DEFAULT_SCENE, backdrop_color, backdrop_image_path
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
    return "fashn" if config.fashn_active() else "placeholder-composite"


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


def _placeholder_tryon(garment_path: Optional[str], output_name: str, scene: str = DEFAULT_SCENE) -> str:
    output_path = media_path(output_name)
    width, height = 720, 1280
    photo = backdrop_image_path(scene)
    if photo:
        # Ảnh bối cảnh thật (đã làm mờ nhẹ như xóa phông)
        with Image.open(photo) as bg:
            base = bg.convert("RGB").resize((width, height))
    else:
        base = Image.new("RGB", (width, height))
        draw = ImageDraw.Draw(base)
        # Phông màu theo bối cảnh (studio: ngà chuyển dần sang be, như ảnh chụp sản phẩm thời trang)
        for y in range(height):
            draw.line([(0, y), (width, y)], fill=backdrop_color(scene, y / (height - 1)))
    if garment_path:
        with Image.open(garment_path) as g:
            garment = g.convert("RGBA")
        garment.thumbnail((int(width * 0.8), int(height * 0.7)))
        x, y = (width - garment.width) // 2, (height - garment.height) // 2
        # Bóng đổ mềm dưới chân sản phẩm
        shadow = Image.new("L", (width, height), 0)
        ImageDraw.Draw(shadow).ellipse(
            [width * 0.22, y + garment.height - 12, width * 0.78, y + garment.height + 28], fill=110)
        base.paste((150, 128, 110), mask=shadow.filter(ImageFilter.GaussianBlur(20)))
        base.paste(garment, (x, y), garment)
    base.save(output_path, "JPEG", quality=90)
    return output_path


def _placeholder_person_tryon(person_path: str, garment_path: Optional[str], output_name: str) -> str:
    """Bản xem thử khi chưa bật AI thử đồ: ảnh của khách (khung 9:16) với trang phục đã tách nền đặt lên phần thân."""
    width, height = 720, 1280
    with Image.open(person_path) as src:
        person = src.convert("RGB")
    scale = max(width / person.width, height / person.height)
    person = person.resize((round(person.width * scale), round(person.height * scale)))
    left, top = (person.width - width) // 2, (person.height - height) // 2
    base = person.crop((left, top, left + width, top + height))
    if garment_path:
        with Image.open(garment_path) as g:
            garment = g.convert("RGBA")
        garment.thumbnail((int(width * 0.56), int(height * 0.5)))
        x, y = (width - garment.width) // 2, int(height * 0.27)
        shadow = Image.new("L", (width, height), 0)
        shadow.paste(garment.getchannel("A").point(lambda a: a * 0.35), (x + 6, y + 10))
        base.paste((20, 16, 14), mask=shadow.filter(ImageFilter.GaussianBlur(12)))
        base.paste(garment, (x, y), garment)
    output_path = media_path(output_name)
    base.save(output_path, "JPEG", quality=90)
    return output_path


def generate_person_tryon(garment_path: str, person_path: str, output_name: str, garment_type: str = "auto",
                          photo_type: str = "auto", cutout_path: Optional[str] = None) -> dict:
    """Người mua thử đồ lên ảnh của chính mình. `person_path` là ảnh toàn thân của khách (trong thư mục media).
    `cutout_path`: ảnh trang phục đã tách nền, dùng cho bản xem thử khi chưa bật AI thử đồ."""
    engine = engine_name()
    if engine == "fashn":
        output_path = _fashn_tryon(garment_path, media_url(person_path), garment_type, photo_type, output_name)
    else:
        output_path = _placeholder_person_tryon(person_path, cutout_path or garment_path, output_name)
    return {"engine": engine, "output_path": output_path, "media_url": media_url(output_path)}


def restage_placeholder(garment_path: Optional[str], output_name: str, scene: str) -> Optional[str]:
    """Ảnh minh họa với phông nền của bối cảnh khác (Pro Studio nhiều cảnh).
    Trả về None khi đang dùng AI thử đồ thật: ảnh đó giữ nguyên, không dựng lại."""
    if engine_name() == "fashn":
        return None
    return _placeholder_tryon(garment_path, output_name, scene)


def generate_tryon(garment_path: Optional[str], avatar_id: str = "model_01", avatar_row: Optional[dict] = None,
                   user_measurements: Optional[dict] = None, output_name: str = "tryon_result.jpg",
                   garment_type: str = "auto", photo_type: str = "auto", scene: str = DEFAULT_SCENE) -> dict:
    """
    Task 2: Thử đồ ảo. `garment_path` là ảnh sản phẩm (trong thư mục media).
    `scene` chỉ đổi phông nền của ảnh minh họa; AI thử đồ thật giữ nền ảnh người mẫu, bối cảnh do bước tạo chuyển động lo.
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
        output_path = _placeholder_tryon(garment_path, output_name, scene)

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
