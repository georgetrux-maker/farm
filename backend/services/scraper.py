import html
import io
import json
import logging
import os
import re
import urllib.parse
import uuid

import httpx
from PIL import Image

from backend import config
from backend.media_paths import media_path, media_url

log = logging.getLogger(__name__)

FABRIC_KEYWORDS = [
    "cotton", "lụa", "tơ tằm", "voan", "tuyết mưa", "linen", "đũi", "denim",
    "kaki", "dạ", "len", "nỉ", "ren", "thun co giãn", "kate", "chiffon", "satin"
]

CATEGORY_KEYWORDS = [
    ("đầm", "Đầm / Váy"),
    ("váy", "Chân váy"),
    ("blazer", "Áo Blazer"),
    ("sơ mi", "Áo sơ mi"),
    ("áo thun", "Áo thun"),
    ("áo khoác", "Áo khoác"),
    ("polo", "Áo Polo"),
    ("quần jean", "Quần Jeans"),
    ("quần tây", "Quần tây"),
    ("set", "Set bộ thời trang"),
]


def _extract_meta(html_text: str, prop: str) -> str:
    patterns = [
        rf'<meta\s+[^>]*property=["\'](?:og:|product:|twitter:)?{re.escape(prop)}["\'][^>]*content=["\']([^"\']+)["\']',
        rf'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*property=["\'](?:og:|product:|twitter:)?{re.escape(prop)}["\']',
        rf'<meta\s+[^>]*name=["\'](?:og:|product:|twitter:)?{re.escape(prop)}["\'][^>]*content=["\']([^"\']+)["\']',
        rf'<meta\s+[^>]*content=["\']([^"\']+)["\'][^>]*name=["\'](?:og:|product:|twitter:)?{re.escape(prop)}["\']',
    ]
    for pat in patterns:
        m = re.search(pat, html_text, re.IGNORECASE)
        if m:
            return html.unescape(m.group(1).strip())
    return ""


def _extract_json_ld(html_text: str) -> dict:
    blocks = re.findall(r'<script\s+[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html_text, re.DOTALL | re.IGNORECASE)
    for b in blocks:
        try:
            data = json.loads(b.strip())
            if isinstance(data, dict):
                if data.get("@type") == "Product" or "name" in data:
                    return data
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and (item.get("@type") == "Product" or "name" in item):
                        return item
        except Exception:
            continue
    return {}


def _save_image_from_url(url: str) -> str:
    """Tải ảnh gốc về server và lưu vào media/uploads để AI xử lý."""
    if not url or not url.startswith("http"):
        return ""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": url,
    }
    try:
        with httpx.Client(timeout=12.0, follow_redirects=True, headers=headers) as client:
            res = client.get(url)
            if res.status_code != 200 or len(res.content) < 500:
                return ""
            img = Image.open(io.BytesIO(res.content))
            img.verify()
            img = Image.open(io.BytesIO(res.content))
            os.makedirs(media_path("uploads"), exist_ok=True)
            fname = f"scraped_{uuid.uuid4().hex[:12]}.jpg"
            out_file = media_path(os.path.join("uploads", fname))
            img.convert("RGB").save(out_file, "JPEG", quality=92)
            return media_url(out_file)
    except Exception as e:
        log.warning("Không tải được ảnh từ %s: %s", url, e)
        return ""


def scrape_product_url(product_url: str) -> dict:
    """
    Đọc thông tin sản phẩm từ link Shopee / TikTok Shop / Website thời trang bất kỳ.
    Bóc tách OpenGraph, Schema JSON-LD và tải ảnh sản phẩm chất lượng cao về hệ thống.
    """
    parsed = urllib.parse.urlparse(product_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Đường dẫn sản phẩm không hợp lệ")

    domain = parsed.netloc.lower()
    platform = "shopee" if "shopee" in domain else ("tiktok" if "tiktok" in domain else ("lazada" if "lazada" in domain else "website"))

    # Dự phòng đoán tên từ URL slug
    slug = urllib.parse.unquote(parsed.path.rstrip("/").split("/")[-1])
    slug = re.sub(r"-i\.\d+\.\d+$", "", slug)
    title_from_slug = re.sub(r"[-_]+", " ", slug).strip()
    if len(title_from_slug) < 4 or title_from_slug.replace(" ", "").isdigit():
        title_from_slug = None

    title = title_from_slug.title() if title_from_slug else None
    price = None
    fabric = None
    category = None
    image_url = None
    raw_img_url = None

    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    try:
        with httpx.Client(timeout=10.0, follow_redirects=True, headers=headers) as client:
            res = client.get(product_url)
            if res.status_code == 200:
                html_text = res.text

                # 1. Bóc tách JSON-LD Schema
                json_ld = _extract_json_ld(html_text)
                if json_ld:
                    if json_ld.get("name"):
                        title = str(json_ld["name"]).strip()
                    offers = json_ld.get("offers")
                    if isinstance(offers, dict) and offers.get("price"):
                        try:
                            price = int(float(offers["price"]))
                        except (ValueError, TypeError):
                            pass
                    img = json_ld.get("image")
                    if isinstance(img, str):
                        raw_img_url = img
                    elif isinstance(img, list) and img and isinstance(img[0], str):
                        raw_img_url = img[0]

                # 2. Bóc tách OpenGraph tags nếu chưa có
                if not title:
                    og_title = _extract_meta(html_text, "title")
                    if og_title and len(og_title) > 3:
                        title = og_title

                if not raw_img_url:
                    og_img = _extract_meta(html_text, "image") or _extract_meta(html_text, "image:secure_url")
                    if og_img and og_img.startswith("http"):
                        raw_img_url = og_img

                if not price:
                    price_str = _extract_meta(html_text, "price:amount") or _extract_meta(html_text, "amount")
                    if price_str:
                        clean_p = re.sub(r"[^\d.]", "", price_str).split(".")[0]
                        if clean_p.isdigit() and int(clean_p) > 1000:
                            price = int(clean_p)

                # Tìm chất liệu và danh mục trong nội dung
                full_text = (html_text[:10000] + " " + (title or "")).lower()
                for kw in FABRIC_KEYWORDS:
                    if kw in full_text:
                        fabric = kw.title()
                        break
                for kw, cat_name in CATEGORY_KEYWORDS:
                    if kw in full_text:
                        category = cat_name
                        break
    except Exception as e:
        log.warning("Lỗi cào URL %s: %s", product_url, e)

    # Nếu tìm thấy ảnh trực tiếp thì tải về máy chủ
    if raw_img_url:
        image_url = _save_image_from_url(raw_img_url)

    return {
        "status": "success",
        "platform": platform,
        "product_url": product_url,
        "title": title,
        "price": price,
        "fabric": fabric,
        "category": category,
        "image_url": image_url,
        "images": [image_url] if image_url else [],
        "needs_manual_input": not bool(image_url and title),
    }

