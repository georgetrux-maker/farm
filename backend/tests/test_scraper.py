"""Đọc thông tin sản phẩm từ link: chặn địa chỉ nội bộ, bóc đúng tên/giá/chất liệu, không bịa dữ liệu.

Không gọi mạng thật: safe_http.fetch được thay bằng trang giả.
"""
import io

import httpx
import pytest
from PIL import Image

from backend.services import safe_http, scraper

PRODUCT_PAGE = """<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Áo thun basic | Shop Hoa</title>
<script>var items=[];for(var i=0;i<items.length;i++){} window.renderCurrentParent=function(){};</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Shop Hoa Official"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Shop Hoa"},
 {"@type":"Product","name":"Áo thun cotton basic form rộng","image":["https://cdn.shophoa.vn/ao.jpg"],
  "offers":{"@type":"Offer","price":"149000.00","priceCurrency":"VND"}}]}</script>
<meta property="og:title" content="Áo thun cotton basic form rộng - Shop Hoa">
</head><body><h1>Áo thun</h1></body></html>"""

PARTY_DRESS_PAGE = """<html><head><meta charset="utf-8">
<meta property="og:title" content="Đầm dạ hội đuôi cá đính kết | Shopee Việt Nam">
<meta property="og:image" content="https://cf.shopee.vn/file/dam.jpg">
<meta property="product:price:amount" content="1.290.000">
<script>function n(){return document.links.length}</script></head></html>"""


def _image_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (600, 800), (200, 40, 80)).save(buf, "JPEG")
    return buf.getvalue()


@pytest.fixture()
def fake_web(monkeypatch):
    """Thay mạng thật: dict url -> (content-type, bytes) hoặc Exception."""
    pages = {}

    def fetch(url, **kwargs):
        safe_http.parse_public_url(url)
        item = pages.get(url)
        if item is None:
            raise safe_http.FetchError("Trang trả về lỗi HTTP 404")
        if isinstance(item, Exception):
            raise item
        ctype, body = item
        return safe_http.FetchResult(url, 200, ctype, body)

    monkeypatch.setattr(safe_http, "fetch", fetch)
    return pages


def test_product_data_beats_shop_name_and_price_is_parsed():
    data = scraper.extract_product(PRODUCT_PAGE, "https://shophoa.vn/san-pham/ao-thun")
    assert data["title"] == "Áo thun cotton basic form rộng"
    assert data["price"] == 149_000
    assert data["fabric"] == "Cotton" and data["category"] == "Áo thun"
    assert data["image"] == "https://cdn.shophoa.vn/ao.jpg"


def test_keywords_match_whole_words_in_product_text_only():
    data = scraper.extract_product(PARTY_DRESS_PAGE, "https://shopee.vn/dam-i.1.2")
    assert data["title"] == "Đầm dạ hội đuôi cá đính kết"       # bỏ đuôi "| Shopee Việt Nam"
    assert data["price"] == 1_290_000
    assert data["fabric"] is None                              # "dạ hội" không phải vải dạ, "length" không phải len
    assert data["category"] == "Đầm / Váy"
    page = '<meta charset="utf-8"><meta property="og:title" content="Quần ống suông nữ">'
    assert scraper.extract_product(page, "https://x.vn/a")["category"] == "Quần"   # không thành "set" vì "charset"
    page = '<meta property="og:title" content="Áo khoác dạ dáng dài"><meta name="description" content="Vải dạ ép">'
    assert scraper.extract_product(page, "https://x.vn/a")["fabric"] == "Dạ"


@pytest.mark.parametrize("raw, expected", [
    ("1.290.000", 1_290_000), ("1,290,000", 1_290_000), ("149000.00", 149_000), ("₫199.000", 199_000),
    (149000, 149_000), ("199.000 ₫", 199_000), ("12", None), ("abc", None), ("", None), (None, None),
])
def test_vietnamese_price_formats(raw, expected):
    assert scraper.parse_vnd(raw) == expected


def test_title_from_shopee_link_keeps_accents():
    url = "https://shopee.vn/%C3%81o-thun-n%E1%BB%AF-form-r%E1%BB%99ng-i.123.456"
    assert scraper._title_from_url(url) == "Áo thun nữ form rộng"
    assert scraper._title_from_url("https://shopee.vn/product/123/456") is None


@pytest.mark.parametrize("url", [
    "http://127.0.0.1/", "http://localhost:80/admin", "http://169.254.169.254/latest/meta-data/",
    "http://10.1.2.3/", "http://[::1]/", "http://2130706433/", "file:///etc/passwd", "http://shop.vn:6379/",
    "http://user:pass@shop.vn/",
])
def test_scrape_rejects_internal_or_odd_links(client, shop, url):
    res = client.post("/api/scraper/product", headers=shop["headers"], json={"url": url})
    assert res.status_code == 400


def test_safe_fetch_rechecks_redirects_and_limits_size(monkeypatch):
    def handler(request):
        assert request.headers["host"] == "shop.vn"          # kết nối tới IP đã kiểm tra, giữ tên miền
        if request.url.path == "/redirect":
            return httpx.Response(302, headers={"location": "http://127.0.0.1/secret"})
        return httpx.Response(200, content=b"x" * 5000)

    real_client = httpx.Client
    monkeypatch.setattr(safe_http.httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw))
    monkeypatch.setattr(safe_http, "resolve_public",   # shop.vn giả làm IP công khai; host khác kiểm tra thật
                        lambda host, port: "93.184.216.34" if host == "shop.vn" else safe_http._check_ip(host))
    with pytest.raises(safe_http.UnsafeURL):
        safe_http.fetch("http://shop.vn/redirect", max_bytes=10_000)
    with pytest.raises(safe_http.FetchError, match="quá lớn"):
        safe_http.fetch("http://shop.vn/big", max_bytes=1000)
    assert len(safe_http.fetch("http://shop.vn/ok", max_bytes=10_000).content) == 5000


def test_scrape_saves_product_image_locally(client, shop, fake_web):
    fake_web["https://shophoa.vn/ao"] = ("text/html; charset=utf-8", PRODUCT_PAGE.encode())
    fake_web["https://cdn.shophoa.vn/ao.jpg"] = ("image/jpeg", _image_bytes())
    data = client.post("/api/scraper/product", headers=shop["headers"], json={"url": "https://shophoa.vn/ao"}).json()
    assert data["status"] == "success" and not data["needs_manual_input"]
    assert data["title"] == "Áo thun cotton basic form rộng" and data["price"] == 149_000
    assert data["image_url"].startswith("/media/uploads/scraped_")
    assert client.get(data["image_url"]).status_code == 200


def test_blocked_page_returns_partial_without_made_up_values(client, shop, fake_web):
    url = "https://shopee.vn/%C4%90%E1%BA%A7m-voan-hoa-nh%C3%AD-i.12345.67890"
    fake_web[url] = safe_http.FetchError("Trang trả về lỗi HTTP 403 (có thể trang chặn truy cập tự động)")
    data = client.post("/api/scraper/product", headers=shop["headers"], json={"url": url}).json()
    assert data["status"] == "partial" and data["platform"] == "shopee"
    assert data["title"] == "Đầm voan hoa nhí"
    assert data["price"] is None and data["fabric"] is None and data["image_url"] is None
    assert "tải ảnh" in data["message"]


def test_image_that_is_not_an_image_is_ignored(client, shop, fake_web):
    fake_web["https://shophoa.vn/ao"] = ("text/html", PRODUCT_PAGE.encode())
    fake_web["https://cdn.shophoa.vn/ao.jpg"] = ("image/jpeg", b"<html>not an image</html>")
    data = client.post("/api/scraper/product", headers=shop["headers"], json={"url": "https://shophoa.vn/ao"}).json()
    assert data["status"] == "partial" and data["image_url"] is None and data["price"] == 149_000
