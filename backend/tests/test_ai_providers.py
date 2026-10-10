"""Test tích hợp với FASHN, Replicate và Claude bằng phản hồi giả lập (không gọi mạng, không tốn phí)."""
import io
import json
import subprocess
import tempfile
from types import SimpleNamespace

import httpx
import pytest
from PIL import Image

from backend.ai import claude_client, http_utils
from backend.ai.http_utils import ProviderError
from backend.ffmpeg_utils import ffmpeg_available, probe_duration
from backend.media_paths import resolve_media_ref
from backend.services import queue_manager
from backend.tests.conftest import DEMO_AUTH, create_product, wait_for_job

needs_ffmpeg = pytest.mark.skipif(not ffmpeg_available(), reason="Cần ffmpeg")

ANALYSIS = {
    "is_fashion_item": True,
    "title_suggestion": "Áo khoác dạ dáng dài màu đỏ",
    "category": "Áo khoác",
    "garment_type": "tops",
    "photo_type": "flat-lay",
    "colors": ["đỏ đô"],
    "material_guess": "có thể là dạ lông cừu",
    "style_tags": ["thanh lịch"],
    "key_features": ["Dáng dài qua gối", "Cổ bẻ ve", "Hai túi ốp"],
    "suitable_occasions": ["đi làm", "dạo phố"],
    "image_quality_score": 88,
    "image_issues": ["Nền hơi nhăn"],
}
SCRIPT = {
    "hook_3s": "Áo khoác dạ này đang cháy hàng!",
    "body_text": "Dáng dài qua gối, cổ bẻ ve cực sang. Hai túi ốp tiện lợi.",
    "cta_text": "Chỉ 350.000đ, bấm giỏ hàng ngay nhé!",
    "post_caption": "Áo khoác dạ dáng dài cho mùa lạnh ❄️",
    "hashtags": ["#aokhoacda", "aokhoac", "#AoKhoacDa", "#outfit mua dong"],
}


def _jpeg_bytes(color=(200, 40, 80)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (864, 1296), color).save(buf, "JPEG")
    return buf.getvalue()


def _mp4_bytes() -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".mp4") as f:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=red:s=720x1080:r=24",
                        "-t", "2", "-pix_fmt", "yuv420p", f.name], check=True)
        return open(f.name, "rb").read()


class FakeProviders:
    """Giả lập API FASHN + Replicate; ghi lại request để kiểm tra."""

    def __init__(self, fashn_result="completed", replicate_result="succeeded"):
        self.requests = []
        self.fashn_result = fashn_result
        self.replicate_result = replicate_result
        self.polls = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = str(request.url)
        if url == "https://api.fashn.ai/v1/run":
            return httpx.Response(200, json={"id": "fashn_1", "error": None})
        if url == "https://api.fashn.ai/v1/status/fashn_1":
            self.polls += 1
            if self.polls == 1:
                return httpx.Response(200, json={"id": "fashn_1", "status": "processing"})
            if self.fashn_result == "completed":
                return httpx.Response(200, json={"id": "fashn_1", "status": "completed",
                                                 "output": ["https://cdn.fashn.ai/out/1.jpg"], "error": None})
            return httpx.Response(200, json={"id": "fashn_1", "status": "failed", "output": None,
                                             "error": {"name": "PoseError", "message": "no pose"}})
        if url == "https://cdn.fashn.ai/out/1.jpg":
            return httpx.Response(200, content=_jpeg_bytes())
        if url == "https://api.replicate.com/v1/files":
            return httpx.Response(201, json={"id": "f1", "urls": {"get": "https://api.replicate.com/v1/files/f1"}})
        if url.startswith("https://api.replicate.com/v1/models/") and url.endswith("/predictions"):
            return httpx.Response(201, json={"id": "r1", "status": "starting",
                                             "urls": {"get": "https://api.replicate.com/v1/predictions/r1"}})
        if url == "https://api.replicate.com/v1/predictions/r1":
            if self.replicate_result == "succeeded":
                return httpx.Response(200, json={"id": "r1", "status": "succeeded",
                                                 "output": "https://replicate.delivery/r1/out.mp4"})
            return httpx.Response(200, json={"id": "r1", "status": "failed", "error": "NSFW content detected"})
        if url == "https://replicate.delivery/r1/out.mp4":
            return httpx.Response(200, content=_mp4_bytes())
        return httpx.Response(404, json={"detail": f"unexpected {url}"})

    def json_body(self, url_part: str) -> dict:
        req = next(r for r in self.requests if url_part in str(r.url) and r.method == "POST")
        return json.loads(req.content)


class FakeClaude:
    def __init__(self, responses):
        self.calls = []
        self.responses = list(responses)

    @property
    def beta(self):
        return SimpleNamespace(messages=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.calls.append(kwargs)
        stop_reason, payload = self.responses.pop(0)
        return SimpleNamespace(stop_reason=stop_reason,
                               content=[SimpleNamespace(type="text", text=json.dumps(payload, ensure_ascii=False))])


@pytest.fixture()
def providers(monkeypatch):
    fake = FakeProviders()
    monkeypatch.setattr(http_utils, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(fake.handler)))
    monkeypatch.setattr(http_utils.time, "sleep", lambda s: None)
    monkeypatch.setenv("FASHN_API_KEY", "fa-test")
    monkeypatch.setenv("REPLICATE_API_TOKEN", "r8-test")
    return fake


@pytest.fixture()
def claude(monkeypatch):
    def install(*responses):
        fake = FakeClaude(responses)
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        monkeypatch.setattr(claude_client, "_client", lambda: fake)
        return fake
    return install


def _upload(client, color=(200, 40, 80), size=(600, 800)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    res = client.post("/api/uploads/image", headers=DEMO_AUTH, files={"file": ("a.png", buf.getvalue(), "image/png")})
    return res.json()["media_url"]


# ---------------------------------------------------------------- Claude
def test_analyze_uses_claude_vision_with_structured_output(client, claude):
    fake = claude(("end_turn", ANALYSIS))
    res = client.post("/api/products/analyze", headers=DEMO_AUTH,
                      json={"image_url": _upload(client), "title": "Áo dạ"}).json()

    call = fake.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["fallbacks"] == "default" and call["betas"] == ["server-side-fallback-2026-07-01"]
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert call["messages"][0]["content"][0]["type"] == "image"
    assert res["engine"] == "claude"
    assert res["ai"]["key_features"] == ANALYSIS["key_features"]
    # Điểm chất lượng = min(đo tại chỗ, AI); nhận xét được gộp
    assert res["quality"]["score"] <= 88
    assert "Nền hơi nhăn" in res["quality"]["issues"]


def test_analyze_without_claude_still_checks_quality(client):
    res = client.post("/api/products/analyze", headers=DEMO_AUTH,
                      json={"image_url": _upload(client, color=(10, 10, 10), size=(300, 300))}).json()
    assert res["engine"] == "local" and res["ai"] is None
    issues = " ".join(res["quality"]["issues"])
    assert "Ảnh nhỏ" in issues and "quá tối" in issues
    assert res["quality"]["score"] < 50


def test_non_fashion_image_is_flagged(client, claude):
    claude(("end_turn", {**ANALYSIS, "is_fashion_item": False}))
    res = client.post("/api/products/analyze", headers=DEMO_AUTH, json={"image_url": _upload(client)}).json()
    assert res["quality"]["score"] <= 20
    assert "không phải sản phẩm thời trang" in res["quality"]["issues"][0]


def test_script_from_claude_normalizes_hashtags(client, claude):
    claude(("end_turn", SCRIPT))
    res = client.post("/api/ai/script", headers=DEMO_AUTH,
                      json={"product_title": "Áo khoác dạ", "price": 350000}).json()
    assert res["engine"] == "claude"
    assert res["hashtags"] == ["#aokhoacda", "#aokhoac", "#outfitmuadong"]
    assert res["full_script"].startswith(SCRIPT["hook_3s"])


def test_script_falls_back_to_template_when_claude_refuses(client, claude):
    claude(("refusal", {}))
    res = client.post("/api/ai/script", headers=DEMO_AUTH,
                      json={"product_title": "Áo khoác dạ", "price": 350000}).json()
    assert res["engine"] == "template"
    assert "từ chối" in res["warning"]
    assert "350.000đ" in res["full_script"]


# ---------------------------------------------------------------- FASHN
def test_fashn_tryon_request_and_result(client, providers, claude):
    claude(("end_turn", ANALYSIS))
    product = create_product(client, DEMO_AUTH)
    res = client.post("/api/ai/tryon", headers=DEMO_AUTH, json={"product_id": product["id"], "avatar_id": "model_02"})
    assert res.status_code == 200, res.text
    assert res.json()["engine"] == "fashn"

    body = providers.json_body("api.fashn.ai/v1/run")
    run_req = next(r for r in providers.requests if str(r.url).endswith("/v1/run"))
    assert run_req.headers["Authorization"] == "Bearer fa-test"
    assert body["model_name"] == "tryon-v1.6"
    assert body["inputs"]["category"] == "tops"             # từ phân tích của Claude
    assert body["inputs"]["garment_photo_type"] == "flat-lay"
    assert body["inputs"]["model_image"].startswith("https://images.unsplash.com/")  # ảnh của Bảo Anh
    assert body["inputs"]["garment_image"].startswith("data:image/")
    with Image.open(resolve_media_ref(res.json()["media_url"])) as img:
        assert img.size == (864, 1296)


def test_fashn_pose_error_is_readable(client, providers):
    providers.fashn_result = "failed"
    product = create_product(client, DEMO_AUTH)
    res = client.post("/api/ai/tryon", headers=DEMO_AUTH, json={"product_id": product["id"]})
    assert res.status_code == 502
    assert "dáng người" in res.json()["detail"]


# ---------------------------------------------------------------- Replicate / Kling
@needs_ffmpeg
def test_replicate_video_request_and_output_is_vertical(client, providers):
    image = _upload(client)
    res = client.post("/api/ai/motion", headers=DEMO_AUTH,
                      json={"image_url": image, "duration_sec": 5, "template": "spin_360"})
    assert res.status_code == 200, res.text
    body = providers.json_body("/predictions")
    pred_req = next(r for r in providers.requests if str(r.url).endswith("/predictions"))
    assert "/models/kwaivgi/kling-v3-video/predictions" in str(pred_req.url)
    assert pred_req.headers["Authorization"] == "Bearer r8-test"
    assert body["input"]["start_image"] == "https://api.replicate.com/v1/files/f1"
    assert body["input"]["duration"] == 5
    assert "turns around" in body["input"]["prompt"]

    out = res.json()
    assert out["engine"] == "replicate:kwaivgi/kling-v3-video"
    info = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                           "-of", "csv=p=0", out["video_path"]], capture_output=True, text=True).stdout.strip()
    assert info == "720,1280"


def test_public_base_url_skips_upload(client, providers, monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://shop.example.vn")
    monkeypatch.setattr("backend.ai.motion.run_ffmpeg", lambda args: open(args[-1], "wb").close())
    image = _upload(client)
    client.post("/api/ai/motion", headers=DEMO_AUTH, json={"image_url": image, "template": "catwalk"})
    assert not any(str(r.url).endswith("/v1/files") for r in providers.requests)
    assert providers.json_body("/predictions")["input"]["start_image"] == "https://shop.example.vn" + image


# ---------------------------------------------------------------- Toàn bộ pipeline
@needs_ffmpeg
def test_full_pipeline_with_ai_providers(client, shop, providers, claude):
    fake_claude = claude(("end_turn", ANALYSIS), ("end_turn", SCRIPT))
    product = create_product(client, shop["headers"])
    job_id = client.post("/api/pipeline/run", headers=shop["headers"],
                         json={"product_id": product["id"], "template": "catwalk"}).json()["job_id"]
    job = wait_for_job(client, job_id, shop["headers"])
    assert job["status"] == "completed", job["error_message"]
    assert job["script"]["engine"] == "claude"
    assert job["script"]["motion_engine"].startswith("replicate:")
    assert len(fake_claude.calls) == 2  # 1 lần phân tích ảnh + 1 lần viết kịch bản

    # Phân tích được lưu lại, lần sau không gọi Claude phân tích nữa
    saved = client.get(f"/api/products/{product['id']}", headers=shop["headers"]).json()
    assert saved["analysis"]["category"] == "Áo khoác"

    export = client.post("/api/publisher/export", headers=shop["headers"], json={"job_id": job_id}).json()
    assert export["seo_caption"] == SCRIPT["post_caption"]
    assert probe_duration(resolve_media_ref(export["download_url"])) > 1


def test_provider_failure_fails_job_and_refunds(client, shop, providers):
    providers.fashn_result = "failed"
    product = create_product(client, shop["headers"])
    job_id = client.post("/api/pipeline/run", headers=shop["headers"], json={"product_id": product["id"]}).json()["job_id"]
    job = wait_for_job(client, job_id, shop["headers"])
    assert job["status"] == "failed" and job["refunded"]
    assert client.get("/api/user/profile", headers=shop["headers"]).json()["credits"] == 100


# ---------------------------------------------------------------- Bước duyệt ảnh thử đồ
@needs_ffmpeg
def test_approval_flow_approve(client, shop):
    product = create_product(client, shop["headers"])
    job_id = client.post("/api/pipeline/run", headers=shop["headers"],
                         json={"product_id": product["id"], "require_approval": True}).json()["job_id"]
    job = wait_for_job(client, job_id, shop["headers"])
    assert job["status"] == "awaiting_approval"
    assert job["output_image_url"] and job["output_video_url"] is None

    assert client.post(f"/api/jobs/{job_id}/approve", headers=shop["headers"]).status_code == 200
    # Ngay sau khi duyệt, tiến độ không còn nằm ở "Chờ duyệt ảnh thử đồ 40%"
    right_after = client.get(f"/api/jobs/{job_id}", headers=shop["headers"]).json()
    assert right_after["status"] != "awaiting_approval" and right_after["progress"] >= 45
    assert client.post(f"/api/jobs/{job_id}/approve", headers=shop["headers"]).status_code == 409
    job = wait_for_job(client, job_id, shop["headers"])
    assert job["status"] == "completed", job["error_message"]
    assert job["output_video_url"]


def test_approval_flow_reject_refunds_all_but_preview_cost(client, shop, monkeypatch):
    product = create_product(client, shop["headers"])
    job_id = client.post("/api/pipeline/run", headers=shop["headers"],
                         json={"product_id": product["id"], "require_approval": True}).json()["job_id"]
    assert wait_for_job(client, job_id, shop["headers"])["status"] == "awaiting_approval"

    res = client.post(f"/api/jobs/{job_id}/reject", headers=shop["headers"]).json()
    assert res["credits_refunded"] == 25           # 30 - 5 phí thử đồ
    assert res["remaining_credits"] == 95
    assert client.post(f"/api/jobs/{job_id}/reject", headers=shop["headers"]).status_code == 409
    job = client.get(f"/api/jobs/{job_id}", headers=shop["headers"]).json()
    assert job["status"] == "rejected" and job["cost_credits"] == 30

    # Người dùng thấy rõ khoản trừ và khoản hoàn trong lịch sử credit
    history = client.get("/api/wallet/transactions", headers=shop["headers"]).json()
    assert [(t["transaction_type"], t["amount_credits"]) for t in history] == [("refund", 25), ("usage", -30)]


def test_cannot_approve_someone_elses_job(client, shop):
    product = create_product(client, DEMO_AUTH)
    job_id = client.post("/api/pipeline/run", headers=DEMO_AUTH,
                         json={"product_id": product["id"], "require_approval": True}).json()["job_id"]
    wait_for_job(client, job_id, DEMO_AUTH)
    assert client.post(f"/api/jobs/{job_id}/approve", headers=shop["headers"]).status_code == 409
    assert client.post(f"/api/jobs/{job_id}/reject", headers=shop["headers"]).status_code == 409


def test_awaiting_jobs_survive_restart(client, shop):
    product = create_product(client, shop["headers"])
    job_id = client.post("/api/pipeline/run", headers=shop["headers"],
                         json={"product_id": product["id"], "require_approval": True}).json()["job_id"]
    wait_for_job(client, job_id, shop["headers"])
    queue_manager.recover_stale_jobs()
    assert client.get(f"/api/jobs/{job_id}", headers=shop["headers"]).json()["status"] == "awaiting_approval"


def test_health_report_shows_configured_providers(client, providers, claude):
    claude()
    report = {r["module"]: r for r in client.get("/api/system/audit-25-tasks", headers=DEMO_AUTH).json()["report"]}
    assert report["ai/vton.py"]["status"] == "PASSED"
    assert report["ai/motion.py"]["status"] == "PASSED"
    assert report["ai/claude_client.py"]["status"] == "PASSED"


def test_download_rejects_non_https():
    with pytest.raises(ProviderError):
        http_utils.download_to_media("http://evil.example/x.mp4", "x.mp4")
