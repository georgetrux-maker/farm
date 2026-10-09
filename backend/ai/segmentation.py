from typing import Optional

from PIL import Image, ImageDraw, ImageFilter, ImageStat

from backend.media_paths import media_path, media_url

# Engine hiện tại: tách nền đơn giản cho ảnh chụp trên nền sáng.
# Đợt 2 sẽ thay bằng mô hình tách nền thật (BiRefNet / rembg / SAM).
ENGINE = "placeholder-threshold"


def _demo_garment() -> Image.Image:
    img = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.polygon([(200, 80), (312, 80), (380, 240), (450, 480), (62, 480), (132, 240)], fill=(235, 215, 185, 255))
    draw.rectangle([(220, 80), (292, 130)], fill=(0, 0, 0, 0))
    return img


def _remove_light_background(img: Image.Image) -> Image.Image:
    """Xóa nền gần trắng (ảnh flatlay/studio). Ảnh đã có alpha thì giữ nguyên."""
    rgba = img.convert("RGBA")
    if rgba.getextrema()[3][0] < 250:  # đã có vùng trong suốt
        return rgba
    gray = rgba.convert("L")
    mask = gray.point(lambda v: 0 if v > 238 else 255).filter(ImageFilter.MedianFilter(5))
    rgba.putalpha(mask)
    return rgba


def _dominant_color(img: Image.Image) -> str:
    small = img.convert("RGBA").resize((64, 64))
    mask = small.getchannel("A").point(lambda a: 255 if a > 128 else 0)
    if mask.getbbox() is None:
        return "#000000"
    r, g, b = (int(v) for v in ImageStat.Stat(small.convert("RGB"), mask=mask).mean)
    return f"#{r:02X}{g:02X}{b:02X}"


def segment_garment(image_path: Optional[str], output_name: str = "segmented_garment.png") -> dict:
    """
    Task 1: Tách nền trang phục.
    `image_path` phải là đường dẫn đã kiểm tra (nằm trong thư mục media) hoặc None để dùng hình minh họa.
    """
    output_path = media_path(output_name)
    if image_path:
        with Image.open(image_path) as src:
            garment = _remove_light_background(src)
        source = "upload"
    else:
        garment = _demo_garment()
        source = "demo"

    bbox = garment.getbbox()
    if bbox:
        garment = garment.crop(bbox)
    garment.save(output_path, "PNG")

    return {
        "status": "success",
        "engine": ENGINE,
        "source": source,
        "output_path": output_path,
        "media_url": media_url(output_path),
        "width": garment.width,
        "height": garment.height,
        "dominant_color": _dominant_color(garment),
    }
