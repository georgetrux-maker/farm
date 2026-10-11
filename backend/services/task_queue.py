"""Đưa việc nền (tạo video, đăng mạng xã hội) vào hàng đợi.

- QUEUE_BACKEND=thread (mặc định): chạy bằng luồng ngay trong tiến trình web. Không cần cài thêm gì, nhưng
  khởi động lại web là mất việc đang làm (job dở sẽ bị đánh dấu lỗi và hoàn credit).
- QUEUE_BACKEND=celery: gửi qua Redis cho worker Celery chạy riêng (backend/worker.py). Chạy được nhiều worker,
  khởi động lại web không ảnh hưởng việc đang làm, worker chết giữa chừng thì việc được giao lại cho worker khác.
"""
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit, urlunsplit

from backend import config

log = logging.getLogger(__name__)

_pools: dict = {}
_pools_lock = threading.Lock()


class QueueUnavailable(Exception):
    """Không gửi được việc vào hàng đợi (thường do Redis không chạy)."""


def _pool(kind: str, workers: int) -> ThreadPoolExecutor:
    with _pools_lock:
        if kind not in _pools:
            _pools[kind] = ThreadPoolExecutor(max_workers=workers, thread_name_prefix=f"aura-{kind}")
        return _pools[kind]


def _send(task, *args):
    try:
        task.apply_async(args=args, retry=True, retry_policy={"max_retries": 2, "interval_start": 0.2,
                                                              "interval_step": 0.5})
    except Exception as e:  # kombu báo lỗi kết nối theo nhiều kiểu khác nhau
        log.error("Không gửi được việc %s vào Redis: %s", task.name, e)
        raise QueueUnavailable("Hệ thống xử lý đang bận hoặc tạm dừng, vui lòng thử lại sau ít phút") from e


def enqueue_job(job_id: str, resume_after_approval: bool = False) -> None:
    if config.queue_backend() == "celery":
        from backend.worker import process_job
        _send(process_job, job_id, resume_after_approval)
        return
    from backend.services.queue_manager import run_job
    _pool("job", config.max_workers()).submit(run_job, job_id, resume_after_approval)


def enqueue_publication(pub_id: str, user_id: str, account_id: str, video_url: str, caption: str,
                        options: dict) -> None:
    # Chỉ gửi mã tài khoản, không gửi token mạng xã hội qua Redis: worker tự đọc từ cơ sở dữ liệu
    if config.queue_backend() == "celery":
        from backend.worker import publish_video
        _send(publish_video, pub_id, user_id, account_id, video_url, caption, options)
        return
    from backend.services.social import run_publication_for
    _pool("publish", 2).submit(run_publication_for, pub_id, user_id, account_id, video_url, caption, options)


def _redis_url_for_display() -> str:
    """REDIS_URL có thể chứa mật khẩu: chỉ hiện máy chủ, cổng, số database."""
    parts = urlsplit(config.redis_url())
    host = parts.hostname or ""
    netloc = f"{host}:{parts.port}" if parts.port else host
    return urlunsplit((parts.scheme, netloc, parts.path, "", ""))


def health() -> tuple:
    """(trạng thái, ghi chú) cho trang Kiểm tra hệ thống"""
    if config.queue_backend() != "celery":
        return "PASSED", "Chạy trong tiến trình web (QUEUE_BACKEND=thread); khởi động lại web sẽ hủy job đang chạy"
    try:
        import redis
        redis.Redis.from_url(config.redis_url(), socket_timeout=1, socket_connect_timeout=1).ping()
    except Exception as e:
        log.warning("Không kết nối được Redis: %s", e)
        return "FAILED", f"Không kết nối được Redis ({_redis_url_for_display()}), video mới sẽ không tạo được"
    try:
        from backend.worker import celery_app
        workers = celery_app.control.ping(timeout=1.0) or []
    except Exception as e:
        log.warning("Không hỏi được worker Celery: %s", e)
        return "WARNING", "Redis chạy nhưng không hỏi được worker Celery"
    if not workers:
        return "WARNING", "Redis chạy nhưng chưa có worker Celery nào, video sẽ nằm chờ trong hàng đợi"
    return "PASSED", f"Redis + {len(workers)} worker Celery đang chạy"
