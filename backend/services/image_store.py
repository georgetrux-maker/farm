"""Kiểm tra và lưu ảnh sản phẩm vào media/uploads (dùng chung cho upload, ảnh lấy từ link và ảnh mẫu)."""
import io
import os
import uuid

from PIL import Image, UnidentifiedImageError

from backend.media_paths import media_path, media_url

MAX_PIXELS = 40_000_000
MAX_SIDE = 2400  # ảnh lấy từ link: thu nhỏ cho nhẹ, AI không cần lớn hơn


class ImageRejected(ValueError):
    def __init__(self, message: str, status_code: int = 415):
        super().__init__(message)
        self.status_code = status_code


def store_image_bytes(data: bytes, prefix: str = "img", max_side: int = None) -> dict:
    """Mở ảnh, kiểm tra định dạng/kích thước, lưu lại bản sạch (bỏ metadata). Trả về media_url, width, height."""
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        img = Image.open(io.BytesIO(data))
        if img.format not in ("JPEG", "PNG", "WEBP"):
            raise ImageRejected("Chỉ hỗ trợ ảnh JPG, PNG, WEBP")
        if img.width * img.height > MAX_PIXELS:
            raise ImageRejected("Ảnh có độ phân giải quá lớn", 413)
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ImageRejected("File không phải ảnh hợp lệ")

    if max_side and max(img.size) > max_side:
        img.thumbnail((max_side, max_side))
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    os.makedirs(media_path("uploads"), exist_ok=True)
    if has_alpha:
        name = os.path.join("uploads", f"{prefix}_{uuid.uuid4().hex[:12]}.png")
        img.convert("RGBA").save(media_path(name), "PNG")
    else:
        name = os.path.join("uploads", f"{prefix}_{uuid.uuid4().hex[:12]}.jpg")
        img.convert("RGB").save(media_path(name), "JPEG", quality=92)
    return {"media_url": media_url(media_path(name)), "width": img.width, "height": img.height}
