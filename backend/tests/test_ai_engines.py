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
    report = client.get("/api/system/audit-25-tasks", headers=DEMO_AUTH).json()
    tryon = next(r for r in report["report"] if r["module"] == "ai/vton.py")
    assert tryon["status"] == "WARNING"
    assert report["passed_tasks"] < report["total_tasks"]


def _gray_frames(path: str, w: int = 36, h: int = 64) -> list:
    import subprocess
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-vf", f"scale={w}:{h},format=gray",
                          "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    n = w * h
    return [raw[i:i + n] for i in range(0, len(raw) - n + 1, n)]


def _frame_png(path: str, at_sec: float, out: str):
    import subprocess
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(at_sec), "-i", path, "-frames:v", "1", out],
                   check=True)
    from PIL import Image
    return Image.open(out).convert("L")


@needs_ffmpeg
def test_render_burns_subtitles_720p_without_jump_cuts(client, monkeypatch, tmp_path):
    from backend.ai.render import render_final_video
    from backend.media_paths import resolve_media_ref

    def offline(*a, **k):
        raise OSError("không có mạng")

    monkeypatch.setattr(tts, "_edge_tts", offline)
    monkeypatch.setattr(tts, "_local_tts", offline)
    product = create_product(client, DEMO_AUTH)
    clip = motion.generate_motion(resolve_media_ref(product["image_url"]), 2, "catwalk", output_name="clip2s.mp4")
    speech = tts.generate_speech("Áo khoác dạ dáng dài cực sang. Mặc đi làm hay đi chơi đều đẹp nha cả nhà!",
                                 output_name="speech.mp3")
    assert speech["phrases"] and speech["duration_sec"] > clip["duration_sec"]

    with_subs = render_final_video(clip["video_path"], speech["audio_path"], "with_subs.mp4", speech["phrases"],
                                   title="Áo khoác dạ", price_text="350.000đ")
    without = render_final_video(clip["video_path"], speech["audio_path"], "without_subs.mp4")
    assert with_subs["resolution"] == "720x1280" and with_subs["subtitles_burned"] and with_subs["title_tag"]
    assert abs(with_subs["duration_sec"] - (speech["duration_sec"] + 0.4)) < 0.2

    # Phụ đề nằm trong hình: vùng chữ ở phần dưới khung khác hẳn bản không có phụ đề
    a = _frame_png(with_subs["output_path"], 1.0, str(tmp_path / "a.png"))
    b = _frame_png(without["output_path"], 1.0, str(tmp_path / "b.png"))
    assert a.size == (720, 1280)
    band = (0, 800, 720, 1100)
    diff = [abs(x - y) for x, y in zip(a.crop(band).tobytes(), b.crop(band).tobytes())]
    assert sum(1 for d in diff if d > 60) > 2000
    # Thẻ tên + giá ở phần trên khung trong vài giây đầu
    top = (0, 60, 720, 260)
    diff = [abs(x - y) for x, y in zip(a.crop(top).tobytes(), b.crop(top).tobytes())]
    assert sum(1 for d in diff if d > 60) > 1500

    # Đoạn 2 giây được nối bằng mờ chéo: không có khung nào nhảy đột ngột (cách lặp cũ cho độ chênh ~37)
    frames = _gray_frames(without["output_path"])
    jumps = [sum(abs(p - q) for p, q in zip(f1, f2)) / len(f1) for f1, f2 in zip(frames, frames[1:])]
    assert max(jumps) < 10


def test_phrases_break_on_punctuation_and_length():
    cues = tts._estimate_cues("Một hai ba bốn năm sáu bảy tám chín. Mười!", 5.0)
    phrases = tts.group_phrases(cues)
    texts = [p[2] for p in phrases]
    assert texts == ["Một hai ba bốn năm sáu", "bảy tám chín.", "Mười!"]
    # Các cụm nối liền nhau
    assert all(abs(p1[1] - p2[0]) < 1e-6 for p1, p2 in zip(phrases, phrases[1:]))


def test_ass_subtitles_escape_control_characters():
    from backend.ai.render import build_ass

    ass = build_ass([(0.0, 1.5, "Giá {chỉ} 99k \\N hôm nay")])
    line = [x for x in ass.splitlines() if x.startswith("Dialogue:")][0]
    assert "{" not in line and "\\" not in line
    assert line.startswith("Dialogue: 0,0:00:00.00,0:00:01.50,Default")
    assert "PlayResX: 720" in ass and "Be Vietnam Pro ExtraBold" in ass


def test_title_and_price_tags_fit_on_one_line():
    from backend.ai import render

    assert render._bundled_fonts() and render._fonts_dir_for_filter() == render.FONTS_DIR
    ass = render.build_ass([], title="Áo {dạ} " + "rất dài " * 20, price="350.000đ")
    title = [x for x in ass.splitlines() if x.startswith("Dialogue: 1,") and ",Title," in x][0]
    price = [x for x in ass.splitlines() if x.startswith("Dialogue: 1,") and ",Price," in x][0]
    text = title.split(",,", 1)[1]
    assert "\\q2" in text and text.endswith("…") and "{dạ}" not in text  # không xuống dòng, quá dài thì cắt
    assert price.endswith("350.000đ") and int(price.split(",")[7]) > 96  # thẻ giá nằm dưới thẻ tên
    short = render.build_ass([], title="Áo khoác dạ")
    assert "\\fs51}Áo khoác dạ" in short and ",Price," not in short


def test_long_phrases_break_by_time():
    cues = tts._estimate_cues("một hai ba bốn năm sáu", 6.0)  # 1 giây mỗi từ
    phrases = tts.group_phrases(cues)
    assert all(p[1] - p[0] <= 3.0 + 1e-6 for p in phrases)
    assert len(phrases) == 2


def _product_photo(blur: float = 0, flat: bool = False):
    import random
    from PIL import Image, ImageDraw, ImageFilter

    random.seed(7)
    img = Image.new("RGB", (900, 1200), (240, 238, 232))
    draw = ImageDraw.Draw(img)
    draw.polygon([(300, 120), (600, 120), (740, 300), (660, 350), (620, 300), (620, 1100), (280, 1100),
                  (280, 300), (240, 350), (160, 300)], fill=(150, 40, 60))
    if not flat:
        for _ in range(800):
            x, y, r = random.randint(290, 610), random.randint(310, 1090), random.randint(2, 5)
            draw.ellipse([x - r, y - r, x + r, y + r], fill=(230, 200, 120))
    return img.filter(ImageFilter.GaussianBlur(blur)) if blur else img


@pytest.mark.parametrize("flat", [False, True])
def test_blur_detection_works_for_detailed_and_plain_photos(tmp_path, flat):
    from backend.ai.product_analysis import check_image_quality

    results = {}
    for blur in (0, 2.5, 8):
        path = tmp_path / f"p{blur}.jpg"
        _product_photo(blur, flat).save(path, quality=88)
        results[blur] = check_image_quality(str(path))
    assert results[0]["issues"] == [] and results[0]["score"] == 100
    assert any("hơi mờ" in i for i in results[2.5]["issues"])
    assert any("bị mờ" in i for i in results[8]["issues"])
    assert results[8]["score"] < 50 < results[2.5]["score"] < 100


def test_large_phone_photo_with_tiny_blur_is_fine(tmp_path):
    from PIL import ImageFilter

    from backend.ai.product_analysis import check_image_quality

    # Ảnh 3600px nhòe 2px: thu về cỡ video thì vẫn nét
    img = _product_photo().resize((2700, 3600)).filter(ImageFilter.GaussianBlur(2))
    path = tmp_path / "big.jpg"
    img.save(path, quality=90)
    assert check_image_quality(str(path))["issues"] == []
