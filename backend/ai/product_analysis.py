"""Phân tích ảnh sản phẩm: kiểm tra chất lượng ảnh (chạy tại chỗ) + mô tả sản phẩm bằng Claude."""
import logging

from PIL import Image, ImageFilter, ImageStat

from backend import config
from backend.ai import claude_client
from backend.ai.http_utils import ProviderError

log = logging.getLogger(__name__)

MIN_SIDE_PX = 512


def check_image_quality(path: str) -> dict:
    """Chấm điểm ảnh 0-100 bằng các phép đo đơn giản: độ phân giải, độ nét, độ sáng."""
    issues = []
    score = 100
    with Image.open(path) as img:
        width, height = img.size
        gray = img.convert("L")
        gray.thumbnail((1024, 1024))

    if min(width, height) < MIN_SIDE_PX:
        issues.append(f"Ảnh nhỏ ({width}x{height}px), nên dùng ảnh cạnh ngắn từ {MIN_SIDE_PX}px trở lên")
        score -= 35

    # Độ nét: độ lệch chuẩn của ảnh biên cạnh; ảnh mờ có rất ít biên cạnh rõ
    sharpness = ImageStat.Stat(gray.filter(ImageFilter.FIND_EDGES)).stddev[0]
    if sharpness < 8:
        issues.append("Ảnh bị mờ hoặc thiếu chi tiết, nên chụp lại rõ nét hơn")
        score -= 30

    brightness = ImageStat.Stat(gray).mean[0]
    if brightness < 50:
        issues.append("Ảnh quá tối")
        score -= 25
    elif brightness > 245:
        issues.append("Ảnh quá sáng, có thể mất chi tiết vải")
        score -= 15

    return {
        "score": max(0, score),
        "issues": issues,
        "width": width,
        "height": height,
        "sharpness": round(sharpness, 1),
        "brightness": round(brightness, 1),
    }


def analyze_product(path: str, hint_title: str = None) -> dict:
    """Kết quả gồm `quality` (luôn có) và `ai` (mô tả của Claude, None nếu chưa cấu hình hoặc lỗi)."""
    quality = check_image_quality(path)
    result = {"quality": quality, "ai": None, "engine": "local", "warning": None}
    if not config.anthropic_enabled():
        return result
    try:
        ai = claude_client.analyze_product_image(path, hint_title)
    except ProviderError as e:
        log.warning("Phân tích ảnh bằng Claude lỗi: %s", e)
        result["warning"] = f"Chưa phân tích được bằng AI: {e}"
        return result

    result["ai"] = ai
    result["engine"] = "claude"
    # Gộp nhận xét: lấy điểm thấp hơn giữa đo tại chỗ và đánh giá của AI
    quality["score"] = min(quality["score"], ai["image_quality_score"])
    quality["issues"] = list(dict.fromkeys(quality["issues"] + ai.get("image_issues", [])))
    if not ai.get("is_fashion_item", True):
        quality["issues"].insert(0, "Ảnh có vẻ không phải sản phẩm thời trang")
        quality["score"] = min(quality["score"], 20)
    return result
