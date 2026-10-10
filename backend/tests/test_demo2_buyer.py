"""Demo 2 phần 4: feed công khai, tài khoản người mua, thích/lưu/lượt xem, thử đồ ảo (shop trả credit)."""
import os

import pytest

from backend import database
from backend.media_paths import media_path
from backend.tests.conftest import dress_png_bytes


def _exists(url: str) -> bool:
    return os.path.exists(media_path(url.removeprefix("/media/")))


def _upload(client, headers) -> str:
    up = client.post("/api/uploads/image", files={"file": ("x.png", dress_png_bytes(), "image/png")}, headers=headers)
    assert up.status_code == 200, up.text
    return up.json()["media_url"]


def _product(client, shop, **extra):
    res = client.post("/api/products/library", headers=shop["headers"], json={
        "title": "Đầm maxi đi biển", "price": 420_000, "image_url": _upload(client, shop["headers"]),
        "sizes": ["S", "M"], "product_url": "https://shopee.vn/dam-maxi", **extra})
    assert res.status_code == 200, res.text
    return res.json()


def _job(shop, product, job_id="JOB_FEED_1", status="completed"):
    conn = database.get_db()
    conn.execute("INSERT INTO ai_jobs (id, user_id, product_id, status, output_video_url, output_image_url, completed_at) "
                 "VALUES (?, ?, ?, ?, '/media/final_demo.mp4', NULL, CURRENT_TIMESTAMP)",
                 (job_id, shop["id"], product["id"], status))
    conn.commit()
    conn.close()
    return job_id


def _buyer(client, email="mua@test.vn"):
    res = client.post("/api/auth/register", json={"name": "Lan", "email": email, "password": "matkhau123", "role": "buyer"})
    assert res.status_code == 200, res.text
    assert res.json()["user"]["role"] == "buyer" and res.json()["user"]["credits"] == 0
    return {"Authorization": f"Bearer {res.json()['token']}"}


@pytest.fixture(autouse=True)
def allow_signup(monkeypatch):
    monkeypatch.setenv("ALLOW_SIGNUP", "1")
    monkeypatch.setenv("SIGNUP_BONUS_CREDITS", "50")


def test_feed_shows_only_videos_the_shop_opted_in(client, shop):
    product = _product(client, shop)
    job = _job(shop, product)
    _job(shop, product, "JOB_BUSY", status="processing")
    assert client.get("/api/feed").json()["items"] == []
    other = database.create_user("Shop B", "b@test.vn", role="shop")
    other_h = {"Authorization": f"Bearer {other['api_token']}"}
    assert client.put(f"/api/jobs/{job}/feed", headers=other_h, json={"visible": True}).status_code == 404
    assert client.put("/api/jobs/JOB_BUSY/feed", headers=shop["headers"], json={"visible": True}).status_code == 409
    assert client.put(f"/api/jobs/{job}/feed", headers=shop["headers"], json={"visible": True}).json()["feed_visible"] is True

    item = client.get("/api/feed").json()["items"][0]
    assert item["id"] == job and item["shop"]["name"] == "Shop Test"
    assert item["product"]["sizes"] == ["S", "M"] and item["product"]["product_url"] == "https://shopee.vn/dam-maxi"
    assert item["liked"] is False and item["likes"] == 0
    assert client.get(f"/api/feed/{job}").json()["id"] == job
    assert client.get("/api/jobs", headers=shop["headers"]).json()["items"][0]["feed_visible"] in (True, False)

    # Ẩn sản phẩm thì video cũng rời feed
    client.delete(f"/api/products/{product['id']}", headers=shop["headers"])
    assert client.get("/api/feed").json()["items"] == []
    assert client.get(f"/api/feed/{job}").status_code == 404


def test_views_likes_saves(client, shop):
    product = _product(client, shop)
    job = _job(shop, product)
    client.put(f"/api/jobs/{job}/feed", headers=shop["headers"], json={"visible": True})
    assert client.post(f"/api/feed/{job}/view").json()["counted"] is True
    assert client.post(f"/api/feed/{job}/view").json()["counted"] is False       # cùng máy xem lại: không tính
    assert client.get("/api/dashboard/stats", headers=shop["headers"]).json()["feed_views"] == 1

    assert client.put(f"/api/feed/{job}/reactions/like", json={"active": True}).status_code == 401
    buyer = _buyer(client)
    assert client.put(f"/api/feed/{job}/reactions/like", headers=buyer, json={"active": True}).json()["count"] == 1
    assert client.put(f"/api/feed/{job}/reactions/like", headers=buyer, json={"active": True}).json()["count"] == 1
    assert client.put(f"/api/feed/{job}/reactions/save", headers=buyer, json={"active": True}).json()["count"] == 1
    item = client.get("/api/feed", headers=buyer).json()["items"][0]
    assert item["liked"] and item["saved"] and item["likes"] == 1 and item["views"] == 1
    assert [i["id"] for i in client.get("/api/feed/saved", headers=buyer).json()["items"]] == [job]
    assert client.put(f"/api/feed/{job}/reactions/like", headers=buyer, json={"active": False}).json()["count"] == 0
    assert client.put(f"/api/feed/{job}/reactions/wow", headers=buyer, json={"active": True}).status_code == 422


def test_public_feed_info(client):
    assert client.get("/api/feed/info").json() == {"photo_hours": 24, "daily_limit": 5}


def test_buyer_account_cannot_use_shop_features(client, shop):
    buyer = _buyer(client)
    profile = client.get("/api/user/profile", headers=buyer).json()
    assert profile["role"] == "buyer" and "plan" not in profile
    assert client.get("/api/products", headers=buyer).status_code == 403
    assert client.get("/api/products/library", headers=buyer).status_code == 403
    assert client.post("/api/uploads/image", headers=buyer, files={"file": ("x.png", dress_png_bytes(), "image/png")}).status_code == 403
    assert client.post("/api/plans/subscribe", headers=buyer, json={"plan_id": "starter"}).status_code == 403
    assert client.post("/api/wallet/deposit", headers=buyer, json={"amount_vnd": 50_000}).status_code == 403
    assert client.get("/api/feed", headers=buyer).status_code == 200
    assert client.post("/api/auth/register", json={"name": "X", "email": "x@test.vn", "password": "matkhau123",
                                                  "role": "admin"}).status_code == 422


def _photo(client, headers) -> str:
    res = client.post("/api/buyer/photo", headers=headers, files={"file": ("me.png", dress_png_bytes(), "image/png")})
    assert res.status_code == 200, res.text
    return res.json()["photo_url"]


def test_buyer_tryon_charges_shop_and_respects_limits(client, shop, monkeypatch):
    monkeypatch.setenv("BUYER_TRYON_DAILY_LIMIT", "2")
    product = _product(client, shop)
    buyer = _buyer(client)
    photo = _photo(client, buyer)
    body = {"product_id": product["id"], "photo_url": photo, "consent": True, "size": "m"}
    assert client.post("/api/buyer/tryon", headers=buyer, json=body).status_code == 400          # shop chưa bật
    client.patch(f"/api/products/{product['id']}", headers=shop["headers"], json={"tryon_enabled": True})
    assert client.post("/api/buyer/tryon", headers=buyer, json={**body, "consent": False}).status_code == 422
    assert client.post("/api/buyer/tryon", headers=buyer, json={**body, "photo_url": product["image_url"]}).status_code == 400

    res = client.post("/api/buyer/tryon", headers=buyer, json=body)
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["size"] == "M" and out["before_url"] == photo and out["product"]["product_url"].startswith("https://")
    assert _exists(out["after_url"])
    assert database.get_user(shop["id"])["credits"] == 100 - 19                  # shop trả, khách không mất gì
    assert database.get_user_by_email("mua@test.vn")["credits"] == 0
    info = client.get("/api/buyer/tryon/info", headers=buyer).json()
    assert info["used_24h"] == 1 and info["daily_limit"] == 2 and "24 giờ" in info["privacy_text"]

    assert client.post("/api/buyer/tryon", headers=buyer, json=body).status_code == 200
    limited = client.post("/api/buyer/tryon", headers=buyer, json=body)
    assert limited.status_code == 429 and "2 lần" in limited.json()["detail"]
    assert database.get_user(shop["id"])["credits"] == 100 - 2 * 19
    assert client.get("/api/dashboard/stats", headers=shop["headers"]).json()["buyer_tryons"] == 2


def test_shop_without_credit_pauses_tryon(client, shop):
    product = _product(client, shop, tryon_enabled=True)
    conn = database.get_db()
    conn.execute("UPDATE users SET credits = 5 WHERE id = ?", (shop["id"],))
    conn.commit()
    conn.close()
    buyer = _buyer(client)
    res = client.post("/api/buyer/tryon", headers=buyer,
                      json={"product_id": product["id"], "photo_url": _photo(client, buyer), "consent": True})
    assert res.status_code == 402 and "tạm dừng" in res.json()["detail"]
    assert database.get_user(shop["id"])["credits"] == 5


def test_buyer_photos_are_deleted_on_request_and_after_expiry(client, shop):
    product = _product(client, shop, tryon_enabled=True)
    buyer = _buyer(client)
    photo = _photo(client, buyer)
    body = {"product_id": product["id"], "photo_url": photo, "consent": True}
    first = client.post("/api/buyer/tryon", headers=buyer, json=body).json()
    second = client.post("/api/buyer/tryon", headers=buyer, json=body).json()
    other = _buyer(client, "khac@test.vn")
    assert client.delete(f"/api/buyer/tryons/{first['id']}", headers=other).status_code == 404

    # Xóa lượt đầu: ảnh kết quả mất, ảnh gốc còn vì lượt thứ hai vẫn dùng
    assert client.delete(f"/api/buyer/tryons/{first['id']}", headers=buyer).json()["status"] == "deleted"
    assert not _exists(first["after_url"])
    assert _exists(photo)
    # Lượt thứ hai hết hạn: lần gọi kế tiếp tự dọn cả ảnh gốc
    conn = database.get_db()
    conn.execute("UPDATE buyer_tryons SET expires_at = datetime('now', '-1 minute') WHERE id = ?", (second["id"],))
    conn.commit()
    conn.close()
    assert client.get("/api/buyer/tryons", headers=buyer).json()["items"] == []
    assert not _exists(photo)
    assert not _exists(second["after_url"])
