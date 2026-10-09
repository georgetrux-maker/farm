import re
import unicodedata

# Engine hiện tại dùng mẫu câu có sẵn. Đợt 2 sẽ thay bằng LLM có nhìn ảnh sản phẩm.
ENGINE = "template"
STYLES = ("genz", "office", "honest")


def _hashtag(text: str) -> str:
    """'Đầm Maxi' -> '#dammaxi'."""
    text = unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D"))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    slug = re.sub(r"[^a-z0-9]", "", text.lower())
    return f"#{slug}" if slug else ""


def _vnd(price: int) -> str:
    return f"{price:,}đ".replace(",", ".")


def generate_koc_script(product_title: str, price: int, fabric: str = None, style: str = "genz",
                        category: str = None) -> dict:
    """
    Task 4: Soạn kịch bản review ngắn (hook 3 giây, nội dung, lời kêu gọi mua hàng).
    """
    if style not in STYLES:
        style = "genz"
    title = product_title.strip()
    fabric_text = f"chất {fabric}" if fabric else "chất liệu"

    if style == "genz":
        hook = f"Đừng lướt qua nếu bạn đang tìm {title} dưới {price // 1000} cành!"
        body = (f"Mẫu này làm bằng {fabric_text} mặc lên nhẹ và thoải mái. "
                "Phom dáng gọn gàng, dễ phối đồ, đi chơi hay đi học đều hợp.")
        cta = f"Bấm ngay vào giỏ hàng để săn {title} giá chỉ {_vnd(price)} nha cả nhà ơi!"
    elif style == "office":
        hook = "Gợi ý set đồ công sở thanh lịch cho nàng tuần này."
        body = (f"{title} với {fabric_text} mang lại cảm giác dễ chịu suốt ngày dài làm việc. "
                "Thiết kế tối giản, dễ phối cùng blazer hoặc phụ kiện nhẹ nhàng.")
        cta = f"Giá hôm nay chỉ {_vnd(price)}, link chi tiết ở bên dưới."
    else:
        hook = f"Review thật lòng {title} sau khi mặc thử."
        body = (f"Điểm cộng là {fabric_text} và đường may khá chắc chắn. "
                "Mọi người nên xem kỹ bảng size trước khi đặt để chọn vừa nhất.")
        cta = f"Giá {_vnd(price)}, mọi người tham khảo ở giỏ hàng nhé."

    hashtags = [h for h in dict.fromkeys([
        _hashtag(category) if category else "",
        _hashtag(title),
        "#reviewthoitrang",
        "#outfit",
        "#tiktokfashion",
    ]) if h]

    full_script = f"{hook} {body} {cta}"
    return {
        "status": "success",
        "engine": ENGINE,
        "style": style,
        "hook_3s": hook,
        "body_text": body,
        "cta_text": cta,
        "full_script": full_script,
        "hashtags": hashtags,
        # Tốc độ đọc tiếng Việt khoảng 3 từ/giây
        "estimated_duration_sec": max(5, round(len(full_script.split()) / 3)),
    }
