from typing import Optional

from PIL import Image, ImageDraw

from backend.media_paths import media_path, media_url

# Engine hiện tại chỉ đặt trang phục lên phông studio để có ảnh minh họa cho video.
# Đợt 2 sẽ thay bằng API thử đồ thật (IDM-VTON / FASHN / Kling Try-On).
ENGINE = "placeholder-composite"

# Hồ sơ dự phòng khi không tìm thấy người mẫu trong bảng brand_avatars
AVATARS = {
    "model_01": {"name": "Linh Đan", "height": 168.0, "weight": 49.0},
    "model_02": {"name": "Bảo Anh", "height": 162.0, "weight": 47.0},
    "model_03": {"name": "Mai Khanh", "height": 172.0, "weight": 53.0},
}


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


def generate_tryon(garment_path: Optional[str], avatar_id: str = "model_01", avatar_row: Optional[dict] = None,
                   user_measurements: Optional[dict] = None, output_name: str = "tryon_result.jpg") -> dict:
    """
    Task 2: Thử đồ ảo. `garment_path` là ảnh trang phục đã tách nền (trong thư mục media).
    """
    output_path = media_path(output_name)
    avatar = avatar_profile(avatar_id, avatar_row)

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
        pos = ((width - garment.width) // 2, (height - garment.height) // 2)
        base.paste(garment, pos, garment)

    base.save(output_path, "JPEG", quality=90)

    m = user_measurements or {}
    h = float(m.get("height") or avatar["height"])
    w = float(m.get("weight") or avatar["weight"])
    bmi = w / ((h / 100) ** 2)
    recommended_size = "S" if bmi < 19.5 else ("M" if bmi < 23 else "L")

    return {
        "status": "success",
        "engine": ENGINE,
        "output_path": output_path,
        "media_url": media_url(output_path),
        "avatar_id": avatar_id,
        "avatar_used": avatar["name"],
        "recommended_size": recommended_size,
    }
