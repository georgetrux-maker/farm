"""Đọc thông tin sản phẩm từ link Shopee / TikTok Shop / website thời trang.

Thứ tự ưu tiên: dữ liệu Product trong JSON-LD -> thẻ OpenGraph -> thẻ <title> -> đoán tên từ link.
Không bịa giá trị: thiếu giá/chất liệu thì để trống để người bán tự điền.
Trang được tải qua safe_http (chặn địa chỉ nội bộ, giới hạn dung lượng).

Lưu ý: Shopee và TikTok Shop dựng trang bằng JavaScript và thường chặn truy cập tự động, nên với các link
này nhiều khi chỉ đoán được tên từ đường dẫn; người bán tải ảnh lên là cách chắc chắn nhất.
"""
import html
import json
import logging
import re
import urllib.parse
from html.parser import HTMLParser
from typing import Optional

from backend import config
from backend.services import safe_http
from backend.services.image_store import ImageRejected, MAX_SIDE, store_image_bytes

log = logging.getLogger(__name__)

MAX_PAGE_BYTES = 3 * 1024 * 1024

# (mẫu regex khớp nguyên từ, tên hiển thị). Thứ tự chỉ dùng khi hai từ đứng cùng vị trí.
FABRICS = [
    (r"tơ\s*tằm", "Tơ tằm"), (r"lụa", "Lụa"), (r"voan", "Voan"), (r"chiffon", "Chiffon"),
    (r"tuyết\s*mưa", "Tuyết mưa"), (r"linen|vải\s*lanh", "Linen"), (r"đũi", "Đũi"), (r"denim|vải\s*bò", "Denim"),
    (r"kaki|khaki", "Kaki"), (r"dạ(?!\s*(?:hội|tiệc|quang))", "Dạ"), (r"len", "Len"), (r"nỉ", "Nỉ"),
    (r"ren", "Ren"), (r"thun\s*lạnh", "Thun lạnh"), (r"thun\s*gân", "Thun gân"), (r"cotton", "Cotton"),
    (r"kate", "Kate"), (r"satin", "Satin"), (r"nhung", "Nhung"), (r"tweed", "Tweed"), (r"jeans?", "Denim"),
]
CATEGORIES = [
    (r"chân\s*váy", "Chân váy"), (r"đầm|váy", "Đầm / Váy"), (r"blazer|áo\s*vest", "Áo Blazer"),
    (r"sơ\s*mi", "Áo sơ mi"), (r"áo\s*khoác|jacket|hoodie|cardigan", "Áo khoác"), (r"polo", "Áo Polo"),
    (r"áo\s*thun|áo\s*phông|t-?shirt", "Áo thun"), (r"quần\s*(?:jeans?|bò)", "Quần Jeans"),
    (r"quần\s*(?:tây|âu)", "Quần tây"), (r"quần", "Quần"), (r"set|bộ\s*đồ", "Set bộ thời trang"), (r"áo", "Áo"),
]
_TITLE_SUFFIX = re.compile(r"\s*[|\-–—]\s*(shopee|tiktok|lazada|tiki|sendo)[^|\-–—]*$", re.IGNORECASE)


class _PageParser(HTMLParser):
    """Gom thẻ meta, <title> và các khối JSON-LD; bỏ qua phần còn lại của trang."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta, self.title, self.ld_blocks = {}, "", []
        self._in_title = False
        self._ld = None

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "meta":
            key = (a.get("property") or a.get("name") or a.get("itemprop") or "").strip().lower()
            if key and a.get("content") and key not in self.meta:
                self.meta[key] = a["content"].strip()
        elif tag == "title":
            self._in_title = True
        elif tag == "script" and a.get("type", "").lower() == "application/ld+json":
            self._ld = []

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._ld is not None:
            self.ld_blocks.append("".join(self._ld))
            self._ld = None

    def handle_data(self, data):
        if self._ld is not None:
            self._ld.append(data)
        elif self._in_title and not self.title:
            self.title = data.strip()


def _walk_nodes(data):
    if isinstance(data, list):
        for item in data:
            yield from _walk_nodes(item)
    elif isinstance(data, dict):
        yield data
        for key in ("@graph", "mainEntity", "itemListElement"):
            if key in data:
                yield from _walk_nodes(data[key])


def _is_product(node: dict) -> bool:
    types = node.get("@type")
    types = types if isinstance(types, list) else [types]
    return any(t in ("Product", "ProductGroup", "IndividualProduct") for t in types)


def _product_node(blocks: list) -> dict:
    for block in blocks:
        try:
            data = json.loads(block.strip(), strict=False)
        except ValueError:
            continue
        for node in _walk_nodes(data):
            if _is_product(node):
                return node
    return {}


def parse_vnd(raw) -> Optional[int]:
    """'1.290.000', '1,290,000', '149000.00', '₫199.000', 149000 -> số đồng. Ngoài khoảng hợp lý -> None."""
    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        number = float(raw)
    else:
        text = re.sub(r"[^\d.,]", "", str(raw))
        if not text:
            return None
        if re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", text):
            number = float(re.sub(r"[.,]", "", text))
        elif re.fullmatch(r"\d+(?:[.,]\d{1,2})?", text):
            number = float(text.replace(",", "."))
        else:
            return None
    value = int(round(number))
    return value if 1_000 <= value <= 1_000_000_000 else None


def _offer_price(offers) -> Optional[int]:
    for offer in offers if isinstance(offers, list) else [offers]:
        if not isinstance(offer, dict):
            continue
        currency = str(offer.get("priceCurrency") or "VND").upper()
        if currency not in ("VND", "VNĐ"):
            continue
        for key in ("price", "lowPrice"):
            price = parse_vnd(offer.get(key))
            if price:
                return price
        spec = offer.get("priceSpecification")
        if isinstance(spec, dict):
            price = parse_vnd(spec.get("price"))
            if price:
                return price
    return None


def _first_image(value) -> Optional[str]:
    if isinstance(value, str):
        return value
    if isinstance(value, list) and value:
        return _first_image(value[0])
    if isinstance(value, dict):
        return value.get("url") or value.get("contentUrl")
    return None


def _clean_title(text: str) -> Optional[str]:
    text = " ".join(html.unescape(text or "").split())
    text = _TITLE_SUFFIX.sub("", text).strip(" |-–—")
    return text[:200] if len(text) >= 3 else None


def _title_from_url(url: str) -> Optional[str]:
    path = urllib.parse.urlsplit(url).path.rstrip("/")
    slug = urllib.parse.unquote(path.split("/")[-1]) if path else ""
    slug = re.sub(r"-i\.\d+\.\d+$", "", slug)                      # mã sản phẩm Shopee
    slug = re.sub(r"\.(html?|php|aspx?)$", "", slug, flags=re.IGNORECASE)
    words = re.sub(r"[-_+]+", " ", slug).strip()
    if len(words) < 4 or not re.search(r"[^\W\d_]", words) or words.replace(" ", "").isdigit():
        return None
    return words[:1].upper() + words[1:]


def _find_keyword(patterns: list, *texts: str) -> Optional[str]:
    """Từ khóa xuất hiện sớm nhất (khớp nguyên từ) trong văn bản đầu tiên có chứa từ khóa."""
    for text in texts:
        if not text:
            continue
        best = None
        for pattern, label in patterns:
            m = re.search(rf"(?<!\w)(?:{pattern})(?!\w)", text, re.IGNORECASE)
            if m and (best is None or m.start() < best[0]):
                best = (m.start(), label)
        if best:
            return best[1]
    return None


def extract_product(page_html: str, url: str) -> dict:
    parser = _PageParser()
    try:
        parser.feed(page_html)
    except Exception:  # HTML hỏng: dùng những gì đã đọc được
        pass
    meta, node = parser.meta, _product_node(parser.ld_blocks)

    title = (_clean_title(str(node.get("name") or "")) or _clean_title(meta.get("og:title", ""))
             or _clean_title(meta.get("twitter:title", "")) or _clean_title(parser.title) or _title_from_url(url))
    price = _offer_price(node.get("offers")) if node else None
    if price is None and meta.get("product:price:currency", "VND").upper() in ("VND", "VNĐ"):
        price = parse_vnd(meta.get("product:price:amount") or meta.get("og:price:amount"))
    image = (_first_image(node.get("image")) or meta.get("og:image:secure_url") or meta.get("og:image")
             or meta.get("twitter:image"))
    description = " ".join(str(x) for x in (node.get("description"), meta.get("og:description"),
                                             meta.get("description")) if x)[:3000]
    material = str(node.get("material") or "")
    category_hint = str(node.get("category") or "")
    return {
        "title": title,
        "price": price,
        "fabric": _find_keyword(FABRICS, material, title or "", description),
        "category": _find_keyword(CATEGORIES, title or "", category_hint, description),
        "image": urllib.parse.urljoin(url, image) if image else None,
    }


def _platform(host: str) -> str:
    host = host.lower()
    for name in ("shopee", "tiktok", "lazada", "tiki"):
        if name in host:
            return name
    return "website"


def _download_image(url: str) -> Optional[str]:
    try:
        res = safe_http.fetch(url, max_bytes=config.max_upload_bytes(), accept="image/*")
        return store_image_bytes(res.content, prefix="scraped", max_side=MAX_SIDE)["media_url"]
    except (safe_http.UnsafeURL, safe_http.FetchError, ImageRejected) as e:
        log.info("Không lấy được ảnh sản phẩm %s: %s", url, e)
        return None


def scrape_product_url(product_url: str) -> dict:
    """Trả về title, price, fabric, category, image_url (đã lưu vào /media/uploads) và message nếu thiếu gì.

    Raise safe_http.UnsafeURL nếu link không hợp lệ hoặc trỏ tới địa chỉ nội bộ.
    """
    url = product_url.strip()
    parts = safe_http.parse_public_url(url)
    result = {"title": None, "price": None, "fabric": None, "category": None, "image": None}
    message = None
    try:
        page = safe_http.fetch(url, max_bytes=MAX_PAGE_BYTES, accept="text/html,application/xhtml+xml")
        result = extract_product(page.text, page.url)
    except safe_http.FetchError as e:
        message = f"Không đọc được trang: {e}."
        result["title"] = _title_from_url(url)

    image_url = _download_image(result["image"]) if result["image"] else None
    missing = [name for name, value in (("ảnh", image_url), ("tên", result["title"]), ("giá", result["price"]))
               if not value]
    if missing:
        hint = "Bạn tải ảnh sản phẩm lên" if not image_url else "Bạn kiểm tra lại"
        message = " ".join(filter(None, [message, f"Chưa lấy được {', '.join(missing)}. {hint} và điền phần còn thiếu nhé."]))
    return {
        "status": "success" if not missing else "partial",
        "platform": _platform(parts.hostname),
        "product_url": url,
        "title": result["title"],
        "price": result["price"],
        "fabric": result["fabric"],
        "category": result["category"],
        "image_url": image_url,
        "images": [image_url] if image_url else [],
        "needs_manual_input": bool(missing),
        "message": message,
    }
