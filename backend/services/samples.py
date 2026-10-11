"""Ảnh sản phẩm mẫu (cho người mới bấm thử ngay) và thư viện mẫu video (Template Showcase).

Ảnh mẫu là ảnh Unsplash (giấy phép Unsplash, dùng tự do): tải về một lần qua safe_http rồi giữ trong
media/samples/ để AI xử lý như ảnh người dùng tải lên.

Video xem trước của từng mẫu: đặt file backend/samples/showcase/<id>.mp4 (tạo bằng chính app khi đã có
key AI thật) thì thư viện tự dùng; chưa có file thì giao diện mô phỏng góc quay trên ảnh mẫu.
"""
import os
import threading

from backend import config
from backend.ai.motion import TEMPLATES
from backend.ai.tts import VOICES
from backend.media_paths import media_path, media_url
from backend.services import safe_http
from backend.services.image_store import ImageRejected, MAX_SIDE, store_image_bytes

_UNSPLASH = "https://images.unsplash.com/{photo}?auto=format&fit=crop&w={w}&q=85"

SAMPLE_PRODUCTS = {
    "dam-voan-hoa-nhi": {"title": "Đầm voan hoa nhí vintage", "price": 289_000, "fabric": "Voan",
                         "category": "Đầm / Váy", "photo": "photo-1572804013309-59a88b7e92f1"},
    "blazer-cong-so": {"title": "Áo blazer công sở dáng rộng", "price": 350_000, "fabric": "Tuyết mưa",
                       "category": "Áo Blazer", "photo": "photo-1539109136881-3be0616acf4b"},
    "ao-thun-basic": {"title": "Áo thun cotton basic form rộng", "price": 149_000, "fabric": "Cotton",
                      "category": "Áo thun", "photo": "photo-1521572267360-ee0c2909d518"},
}

SHOWCASE_TEMPLATES = [
    {"id": "nang-tho-dao-pho", "title": "Nàng thơ dạo phố", "category": "Váy hoa, đồ hè", "badge": "Xu hướng",
     "description": "Dáng đi dạo phố tự nhiên, tôn nét trẻ trung, bay bổng của váy hoa và đồ đi chơi.",
     "tags": ["Dạo phố", "Trẻ trung", "Mùa hè"], "motion_template": "street", "voice_id": "vi-VN-HoaiMyNeural",
     "script_style": "genz", "avatar_id": "model_02", "sample_product_id": "dam-voan-hoa-nhi",
     "caption_lines": ["Váy hoa nhí xinh xỉu luôn các nàng ơi", "Voan mềm, mặc đi chơi cả ngày vẫn mát"]},
    {"id": "quy-co-cong-so", "title": "Quý cô công sở", "category": "Blazer, đầm thanh lịch", "badge": "Thanh lịch",
     "description": "Bước catwalk tự tin, toát lên phong thái chuyên nghiệp của đồ công sở.",
     "tags": ["Công sở", "Catwalk", "Thanh lịch"], "motion_template": "catwalk", "voice_id": "vi-VN-HoaiMyNeural",
     "script_style": "office", "avatar_id": "model_01", "sample_product_id": "blazer-cong-so",
     "caption_lines": ["Blazer dáng rộng, khoác lên là sang", "Phối váy hay quần tây đều chuẩn công sở"]},
    {"id": "sang-chanh-tiec-toi", "title": "Sang chảnh tiệc tối", "category": "Đầm dạ hội, đầm dự tiệc",
     "badge": "Cao cấp", "description": "Người mẫu xoay một vòng khoe trọn phom dáng và độ rủ của đầm dự tiệc.",
     "tags": ["Dự tiệc", "Xoay 360", "Quyến rũ"], "motion_template": "spin_360", "voice_id": "vi-VN-HoaiMyNeural",
     "script_style": "office", "avatar_id": "model_03", "sample_product_id": "dam-voan-hoa-nhi",
     "caption_lines": ["Một vòng xoay là đủ gây thương nhớ", "Phom ôm nhẹ, tôn dáng mà vẫn thoải mái"]},
    {"id": "flash-sale", "title": "Flash sale bùng nổ", "category": "Áo thun, đồ xả kho", "badge": "Bán chạy",
     "description": "Máy quay tiến sát chất vải và đường may, nhịp nhanh để chốt đơn trong vài giây.",
     "tags": ["Flash sale", "Cận chất vải", "Chốt đơn"], "motion_template": "fabric_closeup",
     "voice_id": "vi-VN-NamMinhNeural", "script_style": "genz", "avatar_id": "model_02",
     "sample_product_id": "ao-thun-basic",
     "caption_lines": ["Cotton dày dặn, sờ là mê", "Giá chỉ hôm nay, nhanh tay kẻo hết"]},
]
SHOWCASE_DIR = os.path.join(config.SAMPLES_DIR, "showcase")

_locks = {key: threading.Lock() for key in SAMPLE_PRODUCTS}


class SampleUnavailable(RuntimeError):
    pass


def thumbnail_url(sample_id: str, width: int = 600) -> str:
    cached = _cached_path(sample_id)
    if os.path.isfile(cached):
        return media_url(cached)
    return _UNSPLASH.format(photo=SAMPLE_PRODUCTS[sample_id]["photo"], w=width)


def _cached_path(sample_id: str) -> str:
    return media_path(os.path.join("samples", f"{sample_id}.jpg"))


def list_sample_products() -> list:
    return [{"id": key, **{k: v for k, v in item.items() if k != "photo"}, "thumbnail_url": thumbnail_url(key)}
            for key, item in SAMPLE_PRODUCTS.items()]


def use_sample_product(sample_id: str) -> dict:
    """Bảo đảm ảnh mẫu có trong media/samples (tải lần đầu) rồi trả thông tin sản phẩm để tạo video."""
    item = SAMPLE_PRODUCTS[sample_id]
    path = _cached_path(sample_id)
    with _locks[sample_id]:
        if not os.path.isfile(path):
            try:
                res = safe_http.fetch(_UNSPLASH.format(photo=item["photo"], w=1200),
                                      max_bytes=config.max_upload_bytes(), accept="image/*")
                saved = store_image_bytes(res.content, prefix="sample", max_side=MAX_SIDE)
            except (safe_http.FetchError, safe_http.UnsafeURL, ImageRejected) as e:
                raise SampleUnavailable("Chưa tải được ảnh mẫu (máy chủ không vào được Unsplash). "
                                        "Bạn tải ảnh sản phẩm của mình lên nhé.") from e
            os.makedirs(os.path.dirname(path), exist_ok=True)
            os.replace(media_path(saved["media_url"][len("/media/"):]), path)
    return {"title": item["title"], "price": item["price"], "fabric": item["fabric"],
            "category": item["category"], "image_url": media_url(path)}


def list_showcase() -> list:
    out = []
    for t in SHOWCASE_TEMPLATES:
        video = os.path.join(SHOWCASE_DIR, f"{t['id']}.mp4")
        out.append({**t, "voice_label": VOICES[t["voice_id"]], "template_label": TEMPLATES[t["motion_template"]]["label"],
                    "image_url": thumbnail_url(t["sample_product_id"]),
                    "video_url": f"/samples/showcase/{t['id']}.mp4" if os.path.isfile(video) else None})
    return out
