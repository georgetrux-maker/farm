"""Ảnh sản phẩm mẫu, thư viện mẫu video, nghe thử giọng, xem trước kịch bản. Không gọi mạng thật."""
import io
import shutil

import pytest
from PIL import Image

from backend.ai import tts
from backend.media_paths import media_path
from backend.services import safe_http, samples
from backend.tests.conftest import DEMO_AUTH


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (900, 1200), (210, 80, 120)).save(buf, "JPEG")
    return buf.getvalue()


def test_showcase_templates_are_distinct_and_honest(client):
    templates = client.get("/api/templates/showcase").json()["templates"]
    assert len(templates) == 4
    assert len({t["motion_template"] for t in templates}) == 4          # mỗi mẫu một góc quay riêng
    for t in templates:
        assert t["voice_label"] and t["image_url"] and t["caption_lines"]
        assert "music_name" not in t                                     # pipeline không có nhạc nền
        assert t["video_url"] is None                                    # chưa đặt video mẫu thật


def test_showcase_uses_real_sample_video_when_present(client, tmp_path, monkeypatch):
    monkeypatch.setattr(samples, "SHOWCASE_DIR", str(tmp_path))
    (tmp_path / "flash-sale.mp4").write_bytes(b"\x00")
    templates = {t["id"]: t for t in client.get("/api/templates/showcase").json()["templates"]}
    assert templates["flash-sale"]["video_url"] == "/samples/showcase/flash-sale.mp4"
    assert templates["quy-co-cong-so"]["video_url"] is None


@pytest.fixture()
def no_cached_previews():
    shutil.rmtree(media_path("voice_previews"), ignore_errors=True)


def test_voice_preview_is_the_real_voice_and_cached(client, monkeypatch, no_cached_previews):
    calls = []

    def fake_edge(text, voice, path):
        calls.append(voice)
        with open(path, "wb") as f:
            f.write(b"ID3" + voice.encode())
        return []

    monkeypatch.setattr(tts, "_edge_tts", fake_edge)
    voices = client.get("/api/ai/tts/voices-preview").json()["voices"]
    urls = {v["id"]: v["preview_url"] for v in voices}
    assert len(set(urls.values())) == 2
    a = client.get(urls["vi-VN-HoaiMyNeural"])
    b = client.get(urls["vi-VN-NamMinhNeural"])
    assert a.status_code == b.status_code == 200 and a.headers["content-type"] == "audio/mpeg"
    assert a.content != b.content                                        # hai giọng nghe khác nhau
    client.get(urls["vi-VN-HoaiMyNeural"])
    assert calls == ["vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"]          # lần sau dùng lại file
    assert client.get("/api/ai/tts/preview/khong-co").status_code == 404


def test_voice_preview_reports_when_tts_unreachable(client, monkeypatch, no_cached_previews):
    def broken(text, voice, path):
        raise OSError("network down")

    monkeypatch.setattr(tts, "_edge_tts", broken)
    res = client.get("/api/ai/tts/preview/vi-VN-NamMinhNeural")
    assert res.status_code == 503 and "Video vẫn tạo được" in res.json()["detail"]


@pytest.fixture()
def no_cached_samples():
    shutil.rmtree(media_path("samples"), ignore_errors=True)


def test_sample_product_can_be_turned_into_a_video(client, shop, monkeypatch, no_cached_samples):
    fetched = []

    def fake_fetch(url, **kwargs):
        fetched.append(url)
        return safe_http.FetchResult(url, 200, "image/jpeg", _jpeg())

    monkeypatch.setattr(safe_http, "fetch", fake_fetch)
    products = client.get("/api/samples/products").json()["products"]
    assert [p["id"] for p in products] == list(samples.SAMPLE_PRODUCTS)

    url = "/api/samples/products/dam-voan-hoa-nhi/use"
    assert client.post(url).status_code == 401
    data = client.post(url, headers=shop["headers"]).json()
    assert data["image_url"] == "/media/samples/dam-voan-hoa-nhi.jpg" and data["price"] == 289_000
    client.post(url, headers=shop["headers"])
    assert len(fetched) == 1                                               # tải một lần, sau dùng lại

    # Ảnh mẫu đi tiếp được các bước như ảnh tự tải lên
    assert client.post("/api/products/analyze", headers=shop["headers"],
                       json={"image_url": data["image_url"], "title": data["title"]}).status_code == 200
    created = client.post("/api/products", headers=shop["headers"],
                          json={"title": data["title"], "price": data["price"], "image_url": data["image_url"]})
    assert created.status_code == 200
    assert client.post("/api/samples/products/khong-co/use", headers=shop["headers"]).status_code == 404


def test_sample_product_explains_when_unsplash_unreachable(client, shop, monkeypatch, no_cached_samples):
    def offline(url, **kwargs):
        raise safe_http.FetchError("Không mở được link")

    monkeypatch.setattr(safe_http, "fetch", offline)
    res = client.post("/api/samples/products/ao-thun-basic/use", headers=shop["headers"])
    assert res.status_code == 503 and "tải ảnh sản phẩm của mình" in res.json()["detail"]


def test_script_preview_and_custom_script_limits(client, shop):
    res = client.post("/api/ai/script/preview", headers=shop["headers"],
                      json={"title": "Đầm voan hoa nhí", "price": 289000, "fabric": "Voan", "style": "genz"})
    assert res.status_code == 200 and len(res.json()["full_script"]) > 10
    for bad in ({"title": "Đ", "price": 289000}, {"title": "Đầm voan", "price": 0}, {"title": "Đầm voan", "price": 1, "style": "x"}):
        assert client.post("/api/ai/script/preview", headers=shop["headers"], json=bad).status_code in (400, 422)
    res = client.post("/api/pipeline/run", headers=DEMO_AUTH, json={"product_id": "prod_dam_voan_to", "custom_script": "a" * 601})
    assert res.status_code == 422
