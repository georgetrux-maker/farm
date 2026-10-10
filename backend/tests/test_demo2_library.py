"""Demo 2 phần 1: Sản phẩm của tôi (lọc, sửa, ẩn, link mua, size, thử đồ) và người mẫu riêng của shop."""
from backend import database
from backend.tests.conftest import DEMO_AUTH, dress_png_bytes


def _upload(client, headers) -> str:
    up = client.post("/api/uploads/image", files={"file": ("x.png", dress_png_bytes(), "image/png")}, headers=headers)
    assert up.status_code == 200, up.text
    return up.json()["media_url"]


def _add(client, headers, title, category=None, **extra):
    res = client.post("/api/products/library", headers=headers, json={
        "title": title, "price": 199000, "image_url": _upload(client, headers), "category": category, **extra})
    assert res.status_code == 200, res.text
    return res.json()


def _other_shop():
    user = database.create_user("Shop Khác", "khac@test.vn", role="shop", credits=100)
    return {**user, "headers": {"Authorization": f"Bearer {user['api_token']}"}}


def test_library_counts_search_and_filter(client, shop):
    h = shop["headers"]
    _add(client, h, "Áo len cổ tròn", "Áo")
    _add(client, h, "Áo sơ mi lụa", "Áo ")
    _add(client, h, "Váy hoa nhí", "Váy")
    _add(client, h, "Khăn lụa")
    data = client.get("/api/products/library", headers=h).json()
    assert data["all"] == 4 and data["total"] == 4
    assert data["categories"][0] == {"category": "Áo", "count": 2}            # khoảng trắng thừa được gộp
    assert {"category": None, "count": 1} in data["categories"]
    assert [p["title"] for p in client.get("/api/products/library?category=Váy", headers=h).json()["items"]] == ["Váy hoa nhí"]
    assert len(client.get("/api/products/library?category=__none__", headers=h).json()["items"]) == 1
    assert len(client.get("/api/products/library?q=lụa", headers=h).json()["items"]) == 2
    # Shop khác không thấy sản phẩm của mình
    assert client.get("/api/products/library", headers=_other_shop()["headers"]).json()["all"] == 0


def test_create_and_update_buy_link_sizes_and_tryon(client, shop):
    h = shop["headers"]
    p = _add(client, h, "Đầm voan", "Đầm", product_url="https://shopee.vn/dam-voan-i.1.2", sizes=["s", " M ", "M", "L"],
             tryon_enabled=True)
    assert p["sizes"] == ["S", "M", "L"] and p["tryon_enabled"] is True and p["product_url"].startswith("https://shopee.vn")
    url = f"/api/products/{p['id']}"
    assert client.patch(url, headers=h, json={"original_price": 150000}).status_code == 400   # gốc phải > giá bán
    res = client.patch(url, headers=h, json={"price": 179000, "original_price": 259000, "product_url": "", "sizes": [],
                                              "tryon_enabled": False}).json()
    assert res["price"] == 179000 and res["original_price"] == 259000 and res["product_url"] is None
    assert res["sizes"] == [] and res["tryon_enabled"] is False
    assert client.patch(url, headers=h, json={"product_url": "javascript:alert(1)"}).status_code == 400
    assert client.patch(url, headers=h, json={"sizes": ["S,M"]}).status_code == 422
    assert client.patch(url, headers=_other_shop()["headers"], json={"price": 1000}).status_code == 404


def test_archived_product_hidden_but_videos_kept(client, shop):
    h = shop["headers"]
    p = _add(client, h, "Quần jean", "Quần")
    database.get_db().execute("INSERT INTO ai_jobs (id, user_id, product_id, status) VALUES ('J1', ?, ?, 'completed')",
                              (shop["id"], p["id"])).connection.commit()
    assert client.get("/api/products/library", headers=h).json()["items"][0]["videos_count"] == 1
    assert client.delete(f"/api/products/{p['id']}", headers=h).json()["status"] == "archived"
    assert client.get("/api/products/library", headers=h).json()["all"] == 0
    assert client.get("/api/products", headers=h).json() == []
    assert client.get("/api/jobs", headers=h).json()["items"][0]["product_title"] == "Quần jean"
    assert client.get("/api/dashboard/stats", headers=h).json()["products_count"] == 0


def _model(client, headers, **extra):
    return client.post("/api/my/avatars", headers=headers, json={
        "name": "Mẫu Hạnh", "style": "Công sở", "gender": "female", "avatar_url": _upload(client, headers),
        "consent": True, **extra})


def test_private_model_requires_consent_and_stays_private(client, shop):
    h = shop["headers"]
    no_consent = client.post("/api/my/avatars", headers=h, json={
        "name": "A", "style": "B", "avatar_url": _upload(client, h), "consent": False})
    assert no_consent.status_code == 422
    assert _model(client, h, avatar_url="https://example.com/a.jpg").status_code == 400   # chỉ ảnh đã tải lên
    res = _model(client, h)
    assert res.status_code == 200, res.text
    mine = res.json()
    assert mine["mine"] is True and "owner_id" not in mine
    assert database.get_brand_avatar(mine["id"])["consent_at"]

    ids = {a["id"]: a for a in client.get("/api/avatars", headers=h).json()}
    assert mine["id"] in ids and ids["model_01"]["mine"] is False
    other = _other_shop()
    assert mine["id"] not in {a["id"] for a in client.get("/api/avatars", headers=other["headers"]).json()}
    assert mine["id"] not in {a["id"] for a in client.get("/api/avatars").json()}
    assert mine["id"] not in {a["id"] for a in client.get("/api/avatars?scope=shared", headers=h).json()}

    # Shop khác không dùng được mẫu riêng của mình để tạo video, không sửa/xóa được
    product = _add(client, other["headers"], "Áo thun")
    run = client.post("/api/pipeline/run", headers=other["headers"], json={"product_id": product["id"], "avatar_id": mine["id"]})
    assert run.status_code == 404
    assert client.patch(f"/api/my/avatars/{mine['id']}", headers=other["headers"], json={"name": "X"}).status_code == 404
    assert client.delete(f"/api/my/avatars/{mine['id']}", headers=other["headers"]).status_code == 404
    # Quản trị viên không đặt mẫu riêng làm mặc định cho mọi shop
    assert client.post("/api/avatars/set-default", headers=DEMO_AUTH, json={"avatar_id": mine["id"]}).status_code == 400

    assert client.patch(f"/api/my/avatars/{mine['id']}", headers=h, json={"gender": "male"}).json()["gender"] == "male"
    stats = client.get("/api/dashboard/stats", headers=h).json()
    assert stats["private_models_count"] == 1 and stats["models_count"] == 4 and "videos" in stats["trends"]
    assert client.delete(f"/api/my/avatars/{mine['id']}", headers=h).status_code == 200
    assert mine["id"] not in {a["id"] for a in client.get("/api/avatars", headers=h).json()}


def test_private_model_limit(client, shop, monkeypatch):
    monkeypatch.setenv("PRIVATE_MODELS_LIMIT", "1")
    h = shop["headers"]
    assert client.get("/api/my/avatars/quota", headers=h).json()["limit"] == 1
    assert _model(client, h).status_code == 200
    second = _model(client, h)
    assert second.status_code == 403 and "hết 1" in second.json()["detail"]
