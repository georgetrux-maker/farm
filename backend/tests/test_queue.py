"""Hàng đợi: chế độ celery (Redis) và các tình huống hỏng hóc."""
import pytest
from kombu.exceptions import OperationalError

from backend import database, worker
from backend.ffmpeg_utils import ffmpeg_available
from backend.services import queue_manager
from backend.tests.conftest import create_product, wait_for_job

needs_ffmpeg = pytest.mark.skipif(not ffmpeg_available(), reason="Cần ffmpeg")


def _balance(client, headers):
    return client.get("/api/user/profile", headers=headers).json()["credits"]


@needs_ffmpeg
def test_celery_runs_pipeline_and_resumes_after_approval(client, shop, celery_eager):
    product = create_product(client, shop["headers"])
    res = client.post("/api/pipeline/run", headers=shop["headers"],
                      json={"product_id": product["id"], "require_approval": True})
    assert res.status_code == 200, res.text
    job_id = res.json()["job_id"]
    assert wait_for_job(client, job_id, shop["headers"])["status"] == "awaiting_approval"

    assert client.post(f"/api/jobs/{job_id}/approve", headers=shop["headers"]).status_code == 200
    job = wait_for_job(client, job_id, shop["headers"])
    assert job["status"] == "completed", job["error_message"]
    assert job["output_video_url"]


def test_queue_down_refunds_and_returns_503(client, shop, celery_eager, monkeypatch):
    def broker_down(*a, **k):
        raise OperationalError("Error 111 connecting to redis:6379. Connection refused.")

    monkeypatch.setattr(worker.process_job, "apply_async", broker_down)
    product = create_product(client, shop["headers"])
    res = client.post("/api/pipeline/run", headers=shop["headers"], json={"product_id": product["id"]})
    assert res.status_code == 503 and "thử lại" in res.json()["detail"]
    assert _balance(client, shop["headers"]) == 100
    job = client.get("/api/jobs", headers=shop["headers"]).json()["items"][0]
    assert job["status"] == "failed" and job["refunded"] is True


def test_approve_keeps_job_waiting_when_queue_down(client, shop, celery_eager, monkeypatch):
    product = create_product(client, shop["headers"])
    job_id = client.post("/api/pipeline/run", headers=shop["headers"],
                         json={"product_id": product["id"], "require_approval": True}).json()["job_id"]
    assert wait_for_job(client, job_id, shop["headers"])["status"] == "awaiting_approval"

    monkeypatch.setattr(worker.process_job, "apply_async", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    assert client.post(f"/api/jobs/{job_id}/approve", headers=shop["headers"]).status_code == 503
    assert client.get(f"/api/jobs/{job_id}", headers=shop["headers"]).json()["status"] == "awaiting_approval"


def test_celery_restart_only_recovers_jobs_stuck_too_long(client, shop, monkeypatch):
    monkeypatch.setenv("QUEUE_BACKEND", "celery")
    conn = database.get_db()
    for job_id, created, updated in (("JOB_FRESH", "-5 minutes", "-1 minutes"),
                                     ("JOB_APPROVED_LATE", "-5 hours", "-2 minutes"),  # tạo lâu, mới duyệt
                                     ("JOB_STUCK", "-5 hours", "-4 hours")):
        conn.execute("INSERT INTO ai_jobs (id, user_id, product_id, status, progress, cost_credits, created_at, "
                     "updated_at) VALUES (?, ?, 'p', 'processing', 50, 30, datetime('now', ?), datetime('now', ?))",
                     (job_id, shop["id"], created, updated))
    conn.commit()
    conn.close()

    assert queue_manager.recover_stale_jobs() == 1
    status = lambda j: client.get(f"/api/jobs/{j}", headers=shop["headers"]).json()["status"]
    assert status("JOB_FRESH") == status("JOB_APPROVED_LATE") == "processing"
    assert status("JOB_STUCK") == "failed"
    assert _balance(client, shop["headers"]) == 130  # hoàn credit cho job treo


def test_redelivered_finished_job_is_not_run_again(client, shop, monkeypatch):
    conn = database.get_db()
    conn.execute("INSERT INTO ai_jobs (id, user_id, product_id, status, progress) VALUES "
                 "('JOB_DONE', ?, 'p', 'completed', 100)", (shop["id"],))
    conn.commit()
    conn.close()
    monkeypatch.setattr(queue_manager, "_run_tryon_stage", lambda *a: pytest.fail("không được chạy lại"))
    queue_manager.run_job("JOB_DONE")
    assert client.get("/api/jobs/JOB_DONE", headers=shop["headers"]).json()["status"] == "completed"


def test_health_report_shows_queue(client, monkeypatch):
    from backend.tests.conftest import DEMO_AUTH
    report = {r["name"]: r for r in client.get("/api/system/audit-25-tasks", headers=DEMO_AUTH).json()["report"]}
    assert report["Hàng đợi tạo video"]["status"] == "PASSED"
    monkeypatch.setenv("QUEUE_BACKEND", "celery")
    monkeypatch.setenv("REDIS_URL", "redis://:matkhau-bi-mat@127.0.0.1:1/0")  # không có Redis ở cổng này
    report = {r["name"]: r for r in client.get("/api/system/audit-25-tasks", headers=DEMO_AUTH).json()["report"]}
    assert report["Hàng đợi tạo video"]["status"] == "FAILED"
    assert "127.0.0.1:1" in report["Hàng đợi tạo video"]["note"]
    assert "matkhau-bi-mat" not in report["Hàng đợi tạo video"]["note"]
