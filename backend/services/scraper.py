import re
import urllib.parse


def scrape_product_url(product_url: str) -> dict:
    """
    Task 11: Đọc thông tin sản phẩm từ link Shopee / TikTok Shop.

    Hiện CHƯA cào dữ liệu thật: chỉ nhận diện nền tảng và đoán tên từ đường dẫn.
    Giá, chất liệu, ảnh để trống cho người bán tự nhập (`needs_manual_input = True`).
    """
    parsed = urllib.parse.urlparse(product_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Đường dẫn sản phẩm không hợp lệ")
    domain = parsed.netloc.lower()
    platform = "shopee" if "shopee" in domain else ("tiktok" if "tiktok" in domain else "custom")

    slug = urllib.parse.unquote(parsed.path.rstrip("/").split("/")[-1])
    slug = re.sub(r"-i\.\d+\.\d+$", "", slug)  # đuôi mã sản phẩm của Shopee
    title = re.sub(r"[-_]+", " ", slug).strip()
    if len(title) < 4 or title.replace(" ", "").isdigit():
        title = None

    return {
        "status": "success",
        "platform": platform,
        "product_url": product_url,
        "title": title.title() if title else None,
        "price": None,
        "fabric": None,
        "category": None,
        "images": [],
        "needs_manual_input": True,
    }
