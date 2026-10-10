import io
import os
import tempfile
import time

import pytest

# Cấu hình môi trường test TRƯỚC khi import app (thư mục media được mount lúc import)
_TMP = tempfile.mkdtemp(prefix="aura-test-")
os.environ.update({
    "AURA_DB_PATH": os.path.join(_TMP, "test.db"),
    "AURA_MEDIA_DIR": os.path.join(_TMP, "media"),
    "ALLOW_DEMO_USER": "0",
    "DEMO_USER_TOKEN": "demo-token",
    "ADMIN_TOKEN": "admin-secret",
    "VIETQR_ACCOUNT_NO": "0123456789",
    "RATE_LIMIT_PER_MINUTE": "1000",
    "PIPELINE_COST_CREDITS": "30",
})

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

from backend import database  # noqa: E402
from backend.main import app  # noqa: E402
from backend.services.security import reset_rate_limits  # noqa: E402

DEMO_AUTH = {"Authorization": "Bearer demo-token"}


@pytest.fixture()
def client():
    db = os.environ["AURA_DB_PATH"]
    for suffix in ("", "-wal", "-shm"):
        if os.path.exists(db + suffix):
            os.remove(db + suffix)
    reset_rate_limits()
    with TestClient(app, base_url="https://testserver") as c:
        yield c


@pytest.fixture()
def shop(client):
    """Một tài khoản shop thường (không phải admin) với 100 credit."""
    user = database.create_user("Shop Test", "shop@test.vn", role="shop", credits=100)
    return {**user, "headers": {"Authorization": f"Bearer {user['api_token']}"}}


def dress_png_bytes() -> bytes:
    img = Image.new("RGB", (300, 400), "white")
    ImageDraw.Draw(img).polygon([(120, 50), (180, 50), (240, 350), (60, 350)], fill=(180, 30, 60))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def create_product(client, headers, title="Áo khoác dạ", price=350000) -> dict:
    up = client.post("/api/uploads/image", files={"file": ("dress.png", dress_png_bytes(), "image/png")},
                     headers=headers)
    assert up.status_code == 200, up.text
    res = client.post("/api/products", headers=headers, json={
        "title": title, "price": price, "image_url": up.json()["media_url"],
        "category": "Áo khoác", "fabric_type": "dạ lông cừu",
    })
    assert res.status_code == 200, res.text
    return res.json()


def wait_for_job(client, job_id, headers, timeout=90) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = client.get(f"/api/jobs/{job_id}", headers=headers).json()
        if job["status"] in ("completed", "failed", "awaiting_approval", "rejected"):
            return job
        time.sleep(0.3)
    raise AssertionError(f"Job {job_id} không xong sau {timeout}s")


@pytest.fixture()
def celery_eager(monkeypatch):
    """Chế độ QUEUE_BACKEND=celery; task chạy ngay trong tiến trình test nên không cần Redis."""
    from backend.worker import celery_app
    monkeypatch.setenv("QUEUE_BACKEND", "celery")
    celery_app.conf.task_always_eager = True
    yield celery_app
    celery_app.conf.task_always_eager = False
