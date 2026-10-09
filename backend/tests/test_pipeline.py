import os
import re

import pytest

from backend import database
from backend.ffmpeg_utils import ffmpeg_available, probe_duration
from backend.media_paths import resolve_media_ref
from backend.services import queue_manager
from backend.tests.conftest import DEMO_AUTH, create_product, wait_for_job

needs_ffmpeg = pytest.mark.skipif(not ffmpeg_available(), reason="Cần ffmpeg")


def _balance(client, headers):
    return client.get("/api/user/profile", headers=headers).json()["credits"]


@needs_ffmpeg
def test_full_pipeline_uses_product_avatar_and_template(client, shop):
    product = create_product(client, shop["headers"], title="Áo khoác dạ", price=350000)
    res = client.post("/api/pipeline/run", headers=shop["headers"], json={
        "product_id": product["id"], "avatar_id": "model_02", "template": "spin_360",
        "voice": "vi-VN-NamMinhNeural", "script_style": "office",
    })
    assert res.status_code == 200, res.text
    assert res.json()["remaining_credits"] == 70

    job = wait_for_job(client, res.json()["job_id"], shop["headers"])
    assert job["status"] == "completed", job["error_message"]
    assert job["params"]["avatar_id"] == "model_02"
    assert job["params"]["template"] == "spin_360"
    assert job["completed_at"] is not None

    video = resolve_media_ref(job["output_video_url"])
    assert os.path.getsize(video) > 0
    assert probe_duration(video) > 1

    export = client.post("/api/publisher/export", headers=shop["headers"], json={"job_id": job["job_id"]}).json()
    assert export["download_url"] == job["output_video_url"]
    assert "Áo khoác dạ" in export["seo_caption"]
    assert "350.000đ" in export["seo_caption"]
    assert "#aokhoacda" in export["hashtags"]

    vtt = open(resolve_media_ref(export["subtitles_vtt"]), encoding="utf-8").read()
    assert vtt.startswith("WEBVTT")
    assert re.search(r"\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}", vtt)

    stats = client.get("/api/dashboard/stats", headers=shop["headers"]).json()
    assert stats["completed_renders"] == 1
    assert stats["recent_jobs"][0]["model"] == "Bảo Anh"


def test_failed_job_refunds_credits_once(client, shop, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("GPU hết bộ nhớ")

    monkeypatch.setattr(queue_manager, "segment_garment", boom)
    product = create_product(client, shop["headers"])
    job_id = client.post("/api/pipeline/run", headers=shop["headers"], json={"product_id": product["id"]}).json()["job_id"]
    job = wait_for_job(client, job_id, shop["headers"])
    assert job["status"] == "failed"
    assert "GPU hết bộ nhớ" in job["error_message"]
    assert job["refunded"] is True
    assert _balance(client, shop["headers"]) == 100

    queue_manager.fail_job(job_id, "gọi lại lần hai")
    assert _balance(client, shop["headers"]) == 100


def test_insufficient_credits_returns_402(client):
    user = database.create_user("Nghèo", "ngheo@test.vn", credits=10)
    headers = {"Authorization": f"Bearer {user['api_token']}"}
    product = create_product(client, headers)
    res = client.post("/api/pipeline/run", headers=headers, json={"product_id": product["id"]})
    assert res.status_code == 402


def test_batch_charges_per_video_all_or_nothing(client, shop, monkeypatch):
    monkeypatch.setattr(queue_manager, "_process_job_worker", lambda job_id: None)
    p1 = create_product(client, shop["headers"], title="Áo 1")
    p2 = create_product(client, shop["headers"], title="Áo 2")
    res = client.post("/api/batch/create", headers=shop["headers"], json={"product_ids": [p1["id"], p2["id"]]})
    assert res.status_code == 200
    assert res.json()["credits_deducted"] == 60
    assert _balance(client, shop["headers"]) == 40

    # 40 credit không đủ cho 2 video: không tạo job nào, không trừ đồng nào
    res = client.post("/api/batch/create", headers=shop["headers"], json={"product_ids": [p1["id"], p2["id"]]})
    assert res.status_code == 402
    assert _balance(client, shop["headers"]) == 40


def test_invalid_pipeline_options_are_rejected(client, shop):
    product = create_product(client, shop["headers"])
    for body in ({"template": "khong_co"}, {"voice": "en-US-X"}, {"avatar_id": "khong_co"}):
        res = client.post("/api/pipeline/run", headers=shop["headers"], json={"product_id": product["id"], **body})
        assert res.status_code in (400, 404), body
    assert _balance(client, shop["headers"]) == 100


def test_stale_jobs_are_failed_and_refunded_on_restart(client, shop, monkeypatch):
    monkeypatch.setattr(queue_manager, "_process_job_worker", lambda job_id: None)
    product = create_product(client, shop["headers"])
    job_id = client.post("/api/pipeline/run", headers=shop["headers"], json={"product_id": product["id"]}).json()["job_id"]
    assert _balance(client, shop["headers"]) == 70

    assert queue_manager.recover_stale_jobs() == 1
    job = client.get(f"/api/jobs/{job_id}", headers=shop["headers"]).json()
    assert job["status"] == "failed" and job["refunded"]
    assert _balance(client, shop["headers"]) == 100


def test_jobs_are_private(client, shop, monkeypatch):
    monkeypatch.setattr(queue_manager, "_process_job_worker", lambda job_id: None)
    product = create_product(client, DEMO_AUTH)
    job_id = client.post("/api/pipeline/run", headers=DEMO_AUTH, json={"product_id": product["id"]}).json()["job_id"]
    assert client.get(f"/api/jobs/{job_id}", headers=shop["headers"]).status_code == 404
    assert client.post("/api/publisher/export", headers=shop["headers"], json={"job_id": job_id}).status_code == 404
