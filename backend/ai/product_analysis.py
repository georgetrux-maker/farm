"""Phân tích ảnh sản phẩm: kiểm tra chất lượng ảnh (chạy tại chỗ) + mô tả sản phẩm bằng Claude."""
import logging

from PIL import Image, ImageChops, ImageFilter, ImageStat

from backend import config
from backend.ai import claude_client
from backend.ai.http_utils import ProviderError

log = logging.getLogger(__name__)

MIN_SIDE_PX = 512
ANALYSIS_SIDE_PX = 1024   # đo độ nét ở cỡ gần với video đầu ra (720x1280)
BLURRY_BELOW = 0.30       # tương đương ảnh bị nhòe khoảng 3px ở cỡ 1024px
SOFT_BELOW = 0.50         # hơi mờ (nhòe khoảng 2px)
MIN_CONTRAST = 20

# Bộ lọc Sobel theo 4 hướng (PIL cắt giá trị âm về 0 nên cần cả chiều thuận và nghịch)
_SOBEL = [
    [-1, 0, 1, -2, 0, 2, -1, 0, 1], [1, 0, -1, 2, 0, -2, 1, 0, -1],
    [-1, -2, -1, 0, 0, 0, 1, 2, 1], [1, 2, 1, 0, 0, 0, -1, -2, -1],
]


def _percentile(hist: list, q: float) -> int:
    total, acc = sum(hist), 0
    for value, count in enumerate(hist):
        acc += count
        if acc >= q * total:
            return value
    return len(hist) - 1


def measure_sharpness(gray: Image.Image):
    """Độ sắc của các cạnh mạnh nhất so với độ tương phản của ảnh, khoảng 0 (rất mờ) đến 1 (rất nét).

    Ảnh nét có những chỗ chuyển màu gọn trong 1-2 pixel nên độ dốc lớn nhất gần bằng độ tương phản;
    ảnh mờ thì chỗ chuyển màu bị kéo dài nên độ dốc nhỏ đi. Cách đo này không phụ thuộc ảnh nhiều hay ít
    chi tiết (khác với đo tổng lượng cạnh). Trả về (độ sắc, độ tương phản).
    """
    hist = gray.histogram()
    contrast = _percentile(hist, 0.99) - _percentile(hist, 0.01)
    edges = [gray.filter(ImageFilter.Kernel((3, 3), k, scale=4)) for k in _SOBEL]
    magnitude = edges[0]
    for e in edges[1:]:
        magnitude = ImageChops.lighter(magnitude, e)
    # PIL giữ nguyên giá trị gốc ở viền ảnh khi lọc: bỏ viền để không bị tính nhầm là cạnh sắc
    magnitude = magnitude.crop((2, 2, magnitude.width - 2, magnitude.height - 2))
    strongest = _percentile(magnitude.histogram(), 0.999)
    return strongest / max(contrast, 1), contrast


def check_image_quality(path: str) -> dict:
    """Chấm điểm ảnh 0-100 bằng các phép đo đơn giản: độ phân giải, độ nét, độ sáng."""
    issues = []
    score = 100
    with Image.open(path) as img:
        width, height = img.size
        gray = img.convert("L")
        gray.thumbnail((ANALYSIS_SIDE_PX, ANALYSIS_SIDE_PX))

    if min(width, height) < MIN_SIDE_PX:
        issues.append(f"Ảnh nhỏ ({width}x{height}px), nên dùng ảnh cạnh ngắn từ {MIN_SIDE_PX}px trở lên")
        score -= 35

    sharpness, contrast = measure_sharpness(gray)
    if contrast < MIN_CONTRAST:
        issues.append("Ảnh gần như một màu, không thấy rõ sản phẩm")
        score -= 40
    elif sharpness < BLURRY_BELOW:
        issues.append("Ảnh bị mờ, nên chụp lại rõ nét hơn (giữ chắc tay, lau ống kính, đủ sáng)")
        score -= 55
    elif sharpness < SOFT_BELOW:
        issues.append("Ảnh hơi mờ, chi tiết vải có thể không rõ trong video")
        score -= 20

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
        "sharpness": round(sharpness, 2),
        "contrast": contrast,
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
