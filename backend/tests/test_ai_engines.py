import pytest

from backend.ai import motion, tts
from backend.ai.script import generate_koc_script
from backend.ffmpeg_utils import ffmpeg_available, probe_duration
from backend.tests.conftest import DEMO_AUTH, create_product

needs_ffmpeg = pytest.mark.skipif(not ffmpeg_available(), reason="Cần ffmpeg")


def test_vtt_timestamps_are_valid_webvtt():
    vtt = tts.build_vtt([(0, 0.4, "Xin"), (61.25, 62.5, "chào"), (3725.0, 3726.0, "bạn")])
    assert vtt.startswith("WEBVTT\n")
    assert "00:00:00.000 --> 00:00:00.400" in vtt
    assert "00:01:01.250 --> 00:01:02.500" in vtt
    assert "01:02:05.000 --> 01:02:06.000" in vtt
    assert "," not in vtt.split("\n")[3]


def test_voice_aliases_resolve():
    assert tts.resolve_voice("mai_anh") == "vi-VN-HoaiMyNeural"
    assert tts.resolve_voice("vi-VN-NamMinhNeural") == "vi-VN-NamMinhNeural"
    assert tts.resolve_voice("la-hoac") == "vi-VN-HoaiMyNeural"


@needs_ffmpeg
def test_tts_falls_back_when_edge_tts_fails(client, monkeypatch):
    def offline(*a, **k):
        raise OSError("không có mạng")

    monkeypatch.setattr(tts, "_edge_tts", offline)
    monkeypatch.setattr(tts, "_local_tts", offline)
    res = tts.generate_speech("Chất vải mềm mại dễ chịu", output_name="t_fallback.mp3")
    assert res["engine"] == "silent"
    assert res["warning"]
    assert probe_duration(res["audio_path"]) >= 3
    assert open(res["vtt_path"], encoding="utf-8").read().startswith("WEBVTT")


@needs_ffmpeg
@pytest.mark.parametrize("template", list(motion.TEMPLATES))
def test_every_motion_template_renders(client, template):
    product = create_product(client, DEMO_AUTH)
    tryon = client.post("/api/ai/tryon", headers=DEMO_AUTH, json={"product_id": product["id"]}).json()
    res = client.post("/api/ai/motion", headers=DEMO_AUTH,
                      json={"image_url": tryon["media_url"], "duration_sec": 2, "template": template})
    assert res.status_code == 200, res.text
    assert res.json()["template"] == template
    assert 1.5 < probe_duration(res.json()["video_path"]) < 2.5


def test_tryon_cache_hits_on_second_call(client):
    product = create_product(client, DEMO_AUTH)
    body = {"product_id": product["id"], "avatar_id": "model_01", "height": 160, "weight": 50}
    first = client.post("/api/ai/tryon", headers=DEMO_AUTH, json=body).json()
    second = client.post("/api/ai/tryon", headers=DEMO_AUTH, json=body).json()
    other_avatar = client.post("/api/ai/tryon", headers=DEMO_AUTH, json={**body, "avatar_id": "model_03"}).json()
    assert first["cached"] is False
    assert second["cached"] is True and second["media_url"] == first["media_url"]
    assert other_avatar["cached"] is False


def test_script_uses_product_data():
    s = generate_koc_script("Quần jean ống rộng", 259000, "denim", "honest", category="Quần")
    assert "Quần jean ống rộng" in s["full_script"]
    assert "259.000đ" in s["full_script"]
    assert "#quan" in s["hashtags"]
    assert "đầm" not in s["full_script"].lower()


def test_health_report_is_honest(client):
    report = client.get("/api/system/audit-25-tasks").json()
    tryon = next(r for r in report["report"] if r["module"] == "ai/vton.py")
    assert tryon["status"] == "WARNING"
    assert report["passed_tasks"] < report["total_tasks"]
