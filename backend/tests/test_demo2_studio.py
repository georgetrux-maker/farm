"""Demo 2 phần 2: bối cảnh video (Auto Mode) và Pro Studio nhiều cảnh."""
import os

import pytest
from PIL import Image

from backend.ai.render import concat_scenes
from backend.ffmpeg_utils import ffmpeg_available, probe_duration, run_ffmpeg
from backend.media_paths import media_path, resolve_media_ref
from backend.tests.conftest import DEMO_AUTH, create_product, wait_for_job

needs_ffmpeg = pytest.mark.skipif(not ffmpeg_available(), reason="Cần ffmpeg")


def _balance(client, headers):
    return client.get("/api/user/profile", headers=headers).json()["credits"]


def test_options_list_scenes_and_scene_price(client, monkeypatch):
    opts = client.get("/api/ai/templates").json()
    assert [s["id"] for s in opts["scenes"]] == ["studio", "street", "cafe", "beach", "indoor"]
    assert opts["scenes"][3]["label"] == "Biển"
    assert opts["max_scenes"] == 5 and set(opts["transitions"]) == {"fade", "slide", "zoom", "cut"}
    assert opts["extra_scene_cost_credits"] == 20
    monkeypatch.setenv("EXTRA_SCENE_COST_CREDITS", "15")
    assert client.get("/api/ai/templates").json()["extra_scene_cost_credits"] == 15
    keys = {s["key"]: s for s in client.get("/api/admin/api-keys", headers=DEMO_AUTH).json()["settings"]}
    assert keys["extra_scene_cost_credits"]["provider"] == "pricing"


def test_scene_changes_tryon_backdrop(client, shop):
    product = create_product(client, shop["headers"])
    res = client.post("/api/pipeline/run", headers=shop["headers"], json={
        "product_id": product["id"], "scene": "beach", "require_approval": True})
    assert res.status_code == 200, res.text
    assert res.json()["credits_deducted"] == 30
    job = wait_for_job(client, res.json()["job_id"], shop["headers"])
    assert job["status"] == "awaiting_approval", job["error_message"]
    assert job["params"]["scene"] == "beach"
    with Image.open(resolve_media_ref(job["output_image_url"])) as img:
        sky = img.convert("RGB").getpixel((10, 10))
    assert sky[2] > sky[0] + 30          # trời xanh, không phải phông ngà của studio


def test_invalid_scene_options_are_rejected(client, shop):
    product = create_product(client, shop["headers"])
    run = lambda body: client.post("/api/pipeline/run", headers=shop["headers"], json={"product_id": product["id"], **body})
    assert run({"scene": "moon"}).status_code == 400
    assert run({"scenes": [{"template": "catwalk", "scene": "moon"}]}).status_code == 400
    assert run({"scenes": [{"template": "bay", "scene": "beach"}]}).status_code == 400
    assert run({"scenes": [{"duration_sec": 11}]}).status_code == 422
    assert run({"scenes": [{}] * 6}).status_code == 422
    assert run({"scenes": []}).status_code == 422
    assert run({"effects": {"transition": "spin"}}).status_code == 422
    assert _balance(client, shop["headers"]) == 100


@needs_ffmpeg
def test_pro_studio_multi_scene_video(client, shop):
    product = create_product(client, shop["headers"], title="Đầm maxi đi biển", price=420000)
    res = client.post("/api/pipeline/run", headers=shop["headers"], json={
        "product_id": product["id"], "voice": "vi-VN-NamMinhNeural",
        "custom_script": "Đầm maxi bay bổng.\nVải voan mát.\nChốt đơn ngay!",
        "scenes": [
            {"template": "catwalk", "scene": "studio", "duration_sec": 3},
            {"template": "street", "scene": "beach", "duration_sec": 3},
            {"template": "spin_360", "scene": "cafe", "duration_sec": 4},
        ],
        "effects": {"transition": "slide", "subtitles": False, "title_card": False},
    })
    assert res.status_code == 200, res.text
    assert res.json()["credits_deducted"] == 30 + 2 * 20
    assert res.json()["remaining_credits"] == 30

    job = wait_for_job(client, res.json()["job_id"], shop["headers"], timeout=180)
    assert job["status"] == "completed", job["error_message"]
    params = job["params"]
    assert [s["scene"] for s in params["scenes"]] == ["studio", "beach", "cafe"]
    assert params["template"] == "catwalk" and params["scene"] == "studio"          # cảnh đầu
    assert params["effects"] == {"transition": "slide", "subtitles": False, "title_card": False}
    assert job["script"]["subtitles_burned"] is False

    video = resolve_media_ref(job["output_video_url"])
    assert probe_duration(video) >= 3 + 3 + 4 - 2 * 0.5 - 0.1                      # đủ các cảnh, trừ phần chuyển cảnh
    # Đoạn từng cảnh đã được dọn sau khi ghép; ảnh minh họa có phông riêng cho từng bối cảnh
    assert not os.path.exists(media_path(f"motion_{job['job_id']}_1.mp4"))
    assert os.path.exists(media_path(f"tryon_{job['job_id']}_beach.jpg"))
    assert os.path.exists(media_path(f"tryon_{job['job_id']}_cafe.jpg"))


@needs_ffmpeg
def test_concat_scenes_transitions(client):
    clips = []
    for i, color in enumerate(("red", "blue")):
        path = media_path(f"clip_test_{i}.mp4")
        run_ffmpeg(["-f", "lavfi", "-i", f"color=c={color}:s=360x640:r=30", "-t", "3", "-pix_fmt", "yuv420p", path])
        clips.append(path)
    cut = concat_scenes(clips, "cut", output_name="concat_cut.mp4")
    assert abs(probe_duration(cut["video_path"]) - 6) < 0.15
    fade = concat_scenes(clips, "fade", output_name="concat_fade.mp4")
    assert abs(probe_duration(fade["video_path"]) - 5.5) < 0.15 and fade["duration_sec"] == 5.5
    with pytest.raises(ValueError):
        concat_scenes(clips, "spin")
