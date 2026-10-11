import logging
import re
import unicodedata

from backend import config
from backend.ai import claude_client
from backend.ai.http_utils import ProviderError

log = logging.getLogger(__name__)

STYLES = ("genz", "office", "honest")


def engine_name() -> str:
    return "claude" if config.anthropic_enabled() else "template"


def _hashtag(text: str) -> str:
    """'Đầm Maxi' -> '#dammaxi'."""
    text = unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D"))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    slug = re.sub(r"[^a-z0-9]", "", text.lower())
    return f"#{slug}" if slug else ""


def _vnd(price: int) -> str:
    return f"{price:,}đ".replace(",", ".")


def _template_script(title: str, price: int, fabric: str, style: str, category: str, features: list) -> dict:
    fabric_text = f"chất {fabric}" if fabric else ""
    highlight = f" Điểm nổi bật là {features[0].lower()}." if features else ""

    if style == "genz":
        hook = f"Đừng lướt qua nếu bạn đang tìm {title} dưới {price // 1000} cành!"
        material = f"làm bằng {fabric_text} " if fabric_text else ""
        body = (f"Mẫu này {material}mặc lên nhẹ và thoải mái.{highlight} "
                "Phom dáng gọn gàng, dễ phối đồ, đi chơi hay đi học đều hợp.")
        cta = f"Bấm ngay vào giỏ hàng để săn {title} giá chỉ {_vnd(price)} nha cả nhà ơi!"
    elif style == "office":
        hook = "Gợi ý set đồ công sở thanh lịch cho nàng tuần này."
        material = f" với {fabric_text}" if fabric_text else ""
        body = (f"{title}{material} mang lại cảm giác dễ chịu suốt ngày dài làm việc.{highlight} "
                "Thiết kế tối giản, dễ phối cùng blazer hoặc phụ kiện nhẹ nhàng.")
        cta = f"Giá hôm nay chỉ {_vnd(price)}, link chi tiết ở bên dưới."
    else:
        hook = f"Review thật lòng {title} sau khi mặc thử."
        material = f"{fabric_text} và " if fabric_text else ""
        body = (f"Điểm cộng là {material}đường may khá chắc chắn.{highlight} "
                "Mọi người nên xem kỹ bảng size trước khi đặt để chọn vừa nhất.")
        cta = f"Giá {_vnd(price)}, mọi người tham khảo ở giỏ hàng nhé."

    return {"hook_3s": hook, "body_text": body, "cta_text": cta, **caption_and_hashtags(title, price, category)}


def caption_and_hashtags(title: str, price: int, category: str = None) -> dict:
    """Caption + hashtag mẫu (dùng khi không có Claude, hoặc khi người bán tự viết lời review)."""
    hashtags = [h for h in dict.fromkeys([
        _hashtag(category) if category else "", _hashtag(title), "#reviewthoitrang", "#outfit", "#tiktokfashion",
    ]) if h]
    return {"post_caption": f"{title} chỉ {_vnd(int(price))}", "hashtags": hashtags}


def generate_koc_script(product_title: str, price: int, fabric: str = None, style: str = "genz",
                        category: str = None, analysis: dict = None, image_path: str = None) -> dict:
    """
    Task 4: Soạn kịch bản review (hook 3 giây, nội dung, lời kêu gọi mua, caption, hashtag).
    Dùng Claude khi có ANTHROPIC_API_KEY; lỗi hoặc chưa cấu hình thì dùng mẫu câu.
    """
    if style not in STYLES:
        style = "genz"
    analysis = analysis or {}
    title = product_title.strip()
    engine, warning, parts = "template", None, None

    if config.anthropic_enabled():
        product = {"title": title, "price": price, "fabric_type": fabric, "category": category}
        try:
            parts = claude_client.write_review_script(product, analysis, style, image_path)
            engine = "claude"
        except ProviderError as e:
            log.warning("Viết kịch bản bằng Claude lỗi, dùng mẫu câu: %s", e)
            warning = f"Không viết được kịch bản bằng AI ({e}), đã dùng mẫu câu"

    if parts is None:
        parts = _template_script(title, price, fabric or analysis.get("material_guess"), style,
                                 category or analysis.get("category"), analysis.get("key_features", []))

    full_script = f"{parts['hook_3s']} {parts['body_text']} {parts['cta_text']}"
    return {
        "status": "success",
        "engine": engine,
        "warning": warning,
        "style": style,
        **parts,
        "full_script": full_script,
        # Tốc độ đọc tiếng Việt khoảng 3 từ/giây
        "estimated_duration_sec": max(5, round(len(full_script.split()) / 3)),
    }
