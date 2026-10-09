from backend import config
from backend.tests.conftest import DEMO_AUTH, create_product


def test_repo_files_are_not_served(client):
    for path in ("/backend/fashion_ai.db", "/backend/main.py", "/backend/.env", "/.gitignore", "/README.md"):
        assert client.get(path).status_code == 404, path
    assert client.get("/").status_code == 200
    assert client.get("/app.js").status_code == 200


def test_requests_without_token_are_rejected(client):
    assert client.get("/api/user/profile").status_code == 401
    assert client.get("/api/user/profile", headers={"Authorization": "Bearer sai"}).status_code == 401
    assert client.post("/api/pipeline/run", json={}).status_code == 401


def test_demo_user_only_when_explicitly_allowed(client, monkeypatch):
    monkeypatch.setenv("ALLOW_DEMO_USER", "1")
    res = client.get("/api/user/profile")
    assert res.status_code == 200
    assert res.json()["id"] == "user_linh_chi"


def test_profile_does_not_leak_token_hash(client):
    body = client.get("/api/user/profile", headers=DEMO_AUTH).json()
    assert "api_token_hash" not in body


def test_settings_require_admin_and_mask_secrets(client, shop, monkeypatch):
    assert client.get("/api/settings", headers=shop["headers"]).status_code == 403
    assert client.post("/api/settings", headers=shop["headers"], json={"fps_setting": "60"}).status_code == 403

    client.post("/api/settings", headers=DEMO_AUTH, json={"kling_api_key": "kl_live_supersecret1234"})
    settings = client.get("/api/settings", headers=DEMO_AUTH).json()
    assert "supersecret" not in settings["kling_api_key"]
    assert settings["kling_api_key"].endswith("1234")

    # Gửi lại giá trị đã che không được ghi đè key thật
    client.post("/api/settings", headers=DEMO_AUTH, json={"kling_api_key": settings["kling_api_key"]})
    from backend.database import get_system_settings
    assert get_system_settings(mask_secrets=False)["kling_api_key"] == "kl_live_supersecret1234"

    # Khóa lạ bị bỏ qua
    client.post("/api/settings", headers=DEMO_AUTH, json={"evil_key": "x"})
    assert "evil_key" not in client.get("/api/settings", headers=DEMO_AUTH).json()


def test_media_refs_cannot_escape_media_dir(client):
    for ref in ("/media/../../../../etc/passwd", "/etc/passwd", "http://169.254.169.254/latest", "../config.py"):
        res = client.post("/api/ai/segment", headers=DEMO_AUTH, json={"image_url": ref})
        assert res.status_code == 400, ref
    res = client.post("/api/ai/render", headers=DEMO_AUTH,
                      json={"video_url": "/etc/hostname", "audio_url": "/etc/hostname"})
    assert res.status_code == 400


def test_upload_rejects_non_images_and_large_files(client, monkeypatch):
    res = client.post("/api/uploads/image", headers=DEMO_AUTH,
                      files={"file": ("x.png", b"not an image", "image/png")})
    assert res.status_code == 415
    monkeypatch.setenv("MAX_UPLOAD_MB", "0")
    from backend.tests.conftest import dress_png_bytes
    res = client.post("/api/uploads/image", headers=DEMO_AUTH,
                      files={"file": ("x.png", dress_png_bytes(), "image/png")})
    assert res.status_code == 413


def test_users_cannot_see_each_others_products(client, shop):
    product = create_product(client, DEMO_AUTH)
    assert client.get(f"/api/products/{product['id']}", headers=shop["headers"]).status_code == 404
    res = client.post("/api/pipeline/run", headers=shop["headers"], json={"product_id": product["id"]})
    assert res.status_code == 404


def test_rate_limit_returns_429_not_500(client, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "5")
    codes = [client.get("/api/avatars").status_code for _ in range(8)]
    assert codes[:5] == [200] * 5
    assert codes[5:] == [429] * 3
    assert config.rate_limit_per_minute() == 5


def test_avatar_management_requires_admin(client, shop):
    body = {"name": "A", "style": "B", "height": "1m60", "weight": "45kg", "measurements": "80-60-88",
            "avatar_url": "https://example.com/a.jpg"}
    assert client.post("/api/avatars", headers=shop["headers"], json=body).status_code == 403
    assert client.post("/api/avatars", headers=DEMO_AUTH, json=body).status_code == 200
    assert client.post("/api/avatars/set-default", headers=DEMO_AUTH,
                       json={"avatar_id": "khong_ton_tai"}).status_code == 404
