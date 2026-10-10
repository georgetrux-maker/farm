"""Worker Celery: chạy job tạo video và đăng mạng xã hội lấy từ Redis.

Chạy:  QUEUE_BACKEND=celery REDIS_URL=redis://localhost:6379/0 \
       celery -A backend.worker worker --loglevel=info --concurrency=2 -Q aura
"""
import logging

from celery import Celery
from celery.signals import worker_init

from backend import config

log = logging.getLogger("aura.worker")

celery_app = Celery("aura", broker=config.redis_url())
celery_app.conf.update(
    task_default_queue="aura",
    task_serializer="json",
    accept_content=["json"],
    # Xong việc mới báo nhận: worker chết giữa chừng thì Redis giao lại việc cho worker khác
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    # Worker bị kill hẳn (không kịp trả việc): sau 1 giờ Redis giao lại việc cho worker khác.
    # Một video thường xong dưới 10 phút; giữ nhỏ hơn STALE_JOB_MINUTES.
    broker_transport_options={"visibility_timeout": 3600},
    broker_connection_retry_on_startup=True,
    task_ignore_result=True,
    worker_hijack_root_logger=False,
)


@worker_init.connect
def _prepare(**_):
    from backend.database import init_db
    from backend.services import social
    from backend.services.queue_manager import recover_stale_jobs

    init_db()
    recovered = recover_stale_jobs() + social.recover_stale_publications()
    if recovered:
        log.warning("Đã xử lý %d việc bị treo quá lâu", recovered)


@celery_app.task(name="aura.process_job")
def process_job(job_id: str, resume_after_approval: bool = False):
    from backend.services.queue_manager import run_job
    run_job(job_id, resume_after_approval)


@celery_app.task(name="aura.publish_video")
def publish_video(pub_id: str, user_id: str, account_id: str, video_url: str, caption: str, options: dict):
    from backend.services.social import run_publication_for
    run_publication_for(pub_id, user_id, account_id, video_url, caption, options)
