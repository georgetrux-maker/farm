"""Gọi Claude để phân tích ảnh sản phẩm và viết kịch bản review tiếng Việt.

Kết quả luôn là JSON đúng schema (structured outputs). Khi Claude từ chối vì chính sách,
API tự chạy lại trên model dự phòng (`fallbacks: "default"`).
"""
import base64
import io
import json

import anthropic
from PIL import Image

from backend import config
from backend.ai.http_utils import ProviderError

_FALLBACK_BETA = "server-side-fallback-2026-07-01"

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "is_fashion_item": {"type": "boolean"},
        "title_suggestion": {"type": "string"},
        "category": {"type": "string"},
        "garment_type": {"type": "string", "enum": ["tops", "bottoms", "one-pieces", "other"]},
        "photo_type": {"type": "string", "enum": ["flat-lay", "model", "mannequin", "other"]},
        "colors": {"type": "array", "items": {"type": "string"}},
        "material_guess": {"type": "string"},
        "style_tags": {"type": "array", "items": {"type": "string"}},
        "key_features": {"type": "array", "items": {"type": "string"}},
        "suitable_occasions": {"type": "array", "items": {"type": "string"}},
        "image_quality_score": {"type": "integer"},
        "image_issues": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "is_fashion_item", "title_suggestion", "category", "garment_type", "photo_type", "colors",
        "material_guess", "style_tags", "key_features", "suitable_occasions", "image_quality_score", "image_issues",
    ],
    "additionalProperties": False,
}

SCRIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "hook_3s": {"type": "string"},
        "body_text": {"type": "string"},
        "cta_text": {"type": "string"},
        "post_caption": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["hook_3s", "body_text", "cta_text", "post_caption", "hashtags"],
    "additionalProperties": False,
}

ANALYSIS_SYSTEM = """Bạn là chuyên viên thời trang của một sàn TMĐT Việt Nam. Nhiệm vụ: xem ảnh sản phẩm do người bán tải lên và mô tả lại chính xác để tạo video review.

Quy tắc:
- Chỉ mô tả những gì nhìn thấy trong ảnh. Không bịa công dụng (ví dụ "giấu bụng", "chống nhăn") nếu ảnh không thể hiện.
- Viết bằng tiếng Việt, ngắn gọn. key_features gồm 3 đến 6 điểm nổi bật, mỗi điểm dưới 12 từ.
- category là tên loại sản phẩm tiếng Việt thông dụng (ví dụ: Đầm, Áo sơ mi, Quần jean, Áo khoác).
- garment_type: "tops" cho áo, "bottoms" cho quần/váy rời, "one-pieces" cho đầm/jumpsuit/bộ liền, "other" cho giày, túi, phụ kiện.
- material_guess: đoán chất liệu từ bề mặt vải, kèm chữ "có thể" nếu không chắc.
- image_quality_score từ 0 đến 100: ảnh có đủ rõ, đủ sáng, thấy trọn sản phẩm, nền gọn để AI ghép lên người mẫu không. image_issues liệt kê vấn đề cụ thể bằng tiếng Việt (để trống nếu ảnh tốt).
- is_fashion_item = false nếu ảnh không phải sản phẩm thời trang."""

SCRIPT_SYSTEM = """Bạn là KOC thời trang trên TikTok Việt Nam, viết lời thoại cho video review dọc dài 20 đến 35 giây.

Quy tắc:
- Tiếng Việt tự nhiên, dễ đọc thành tiếng. Không dùng emoji, ký hiệu hay hashtag trong lời thoại (hook_3s, body_text, cta_text).
- hook_3s: một câu mở đầu gây tò mò, dưới 15 từ.
- body_text: 2 đến 3 câu nói về điểm nổi bật CÓ THẬT của sản phẩm (chỉ dùng thông tin được cung cấp, không bịa công dụng hay số liệu).
- cta_text: một câu kêu gọi mua, nhắc đúng giá được cung cấp.
- post_caption: caption đăng kèm video, 1 đến 2 câu, có thể dùng 1 đến 2 emoji.
- hashtags: 5 đến 8 hashtag tiếng Việt không dấu, viết thường, bắt đầu bằng #, liên quan đến sản phẩm.
- Giọng văn theo yêu cầu: genz = trẻ trung, bắt trend; office = thanh lịch, chuyên nghiệp; honest = review thật lòng, cân bằng, nêu cả lưu ý (ví dụ nên xem bảng size)."""

STYLE_LABELS = {"genz": "genz", "office": "office", "honest": "honest"}


def _client() -> anthropic.Anthropic:
    # Tách thành hàm để test thay bằng client giả
    return anthropic.Anthropic(max_retries=2, timeout=120.0)


def _image_block(path: str) -> dict:
    with Image.open(path) as img:
        img = img.convert("RGB")
        img.thumbnail((1568, 1568))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=90)
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                        "data": base64.standard_b64encode(buf.getvalue()).decode()}}


def _structured_call(system: str, content: list, schema: dict, effort: str) -> dict:
    try:
        response = _client().beta.messages.create(
            model=config.anthropic_model(),
            max_tokens=16000,
            betas=[_FALLBACK_BETA],
            fallbacks="default",
            output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
            system=system,
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.AuthenticationError as e:
        raise ProviderError("ANTHROPIC_API_KEY không hợp lệ") from e
    except anthropic.RateLimitError as e:
        raise ProviderError("Claude đang quá tải hoặc hết hạn mức, thử lại sau") from e
    except anthropic.APIStatusError as e:
        raise ProviderError(f"Claude trả lỗi HTTP {e.status_code}") from e
    except anthropic.APIConnectionError as e:
        raise ProviderError("Không kết nối được tới Claude") from e

    if response.stop_reason == "refusal":
        raise ProviderError("Claude từ chối xử lý nội dung này")
    if response.stop_reason == "max_tokens":
        raise ProviderError("Claude trả lời bị cắt ngang")
    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        raise ProviderError("Claude không trả về nội dung")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ProviderError("Claude trả về JSON không hợp lệ") from e


def analyze_product_image(image_path: str, hint_title: str = None) -> dict:
    content = [_image_block(image_path)]
    text = "Phân tích ảnh sản phẩm này."
    if hint_title:
        text += f" Người bán đặt tên: {hint_title!r} (dùng làm gợi ý, ưu tiên những gì thấy trong ảnh)."
    content.append({"type": "text", "text": text})
    result = _structured_call(ANALYSIS_SYSTEM, content, ANALYSIS_SCHEMA, effort="low")
    result["image_quality_score"] = max(0, min(100, int(result.get("image_quality_score", 0))))
    return result


def write_review_script(product: dict, analysis: dict, style: str, image_path: str = None) -> dict:
    facts = {
        "ten_san_pham": product["title"],
        "gia_ban_vnd": f"{product['price']:,}".replace(",", "."),
        "loai": product.get("category") or analysis.get("category"),
        "chat_lieu": product.get("fabric_type") or analysis.get("material_guess"),
        "mau_sac": analysis.get("colors", []),
        "diem_noi_bat": analysis.get("key_features", []),
        "dip_mac": analysis.get("suitable_occasions", []),
        "phong_cach": analysis.get("style_tags", []),
    }
    content = []
    if image_path:
        content.append(_image_block(image_path))
    content.append({"type": "text", "text": (
        f"Giọng văn: {STYLE_LABELS.get(style, 'genz')}.\n"
        f"Thông tin sản phẩm (JSON):\n{json.dumps(facts, ensure_ascii=False)}"
    )})
    result = _structured_call(SCRIPT_SYSTEM, content, SCRIPT_SCHEMA, effort="medium")
    tags = []
    for tag in result.get("hashtags", []):
        tag = "#" + tag.strip().lstrip("#").replace(" ", "").lower()
        if len(tag) > 1 and tag not in tags:
            tags.append(tag)
    result["hashtags"] = tags[:8]
    return result
