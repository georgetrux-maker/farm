import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor

from backend import config
from backend.ai.motion import DEFAULT_TEMPLATE, generate_motion
from backend.ai.render import render_final_video
from backend.ai.script import generate_koc_script
from backend.ai.segmentation import segment_garment
from backend.ai.tts import DEFAULT_VOICE, generate_speech
from backend.ai.vton import generate_tryon
from backend.database import get_brand_avatar, get_db, get_product
from backend.media_paths import try_resolve_media_ref
from backend.services.wallet import deduct_credits, refund_credits

log = logging.getLogger(__name__)

_executor = None


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=config.max_workers(), thread_name_prefix="aura-job")
    return _executor


class InsufficientCredits(Exception):
    pass


def create_ai_jobs(user_id: str, product_ids: list, params: dict, cost_per_job: int) -> dict:
    """Trừ credit và tạo job trong cùng một transaction (đủ tiền cho tất cả thì mới tạo)."""
    total = cost_per_job * len(product_ids)
    job_ids = [f"JOB_{uuid.uuid4().hex[:10]}" for _ in product_ids]
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        res = deduct_credits(user_id, total, f"Tạo {len(product_ids)} video thời trang AI", conn=conn)
        if res["status"] != "success":
            conn.rollback()
            raise InsufficientCredits(res["message"])
        for job_id, product_id in zip(job_ids, product_ids):
            conn.execute('''
            INSERT INTO ai_jobs (id, user_id, product_id, job_type, status, progress, current_step, params_json, cost_credits)
            VALUES (?, ?, ?, 'full_pipeline', 'queued', 0, 'Đang chờ xử lý trong hàng đợi', ?, ?)
            ''', (job_id, user_id, product_id, json.dumps(params, ensure_ascii=False), cost_per_job))
        conn.commit()
    finally:
        conn.close()

    for job_id in job_ids:
        _get_executor().submit(_process_job_worker, job_id)
    return {"job_ids": job_ids, "remaining_credits": res["remaining_credits"], "credits_deducted": total}


def create_ai_job(user_id: str, product_id: str, params: dict = None, cost: int = None) -> dict:
    cost = config.pipeline_cost_credits() if cost is None else cost
    res = create_ai_jobs(user_id, [product_id], params or {}, cost)
    return {"job_id": res["job_ids"][0], "remaining_credits": res["remaining_credits"], "credits_deducted": cost}


def _update_job(job_id: str, status: str, progress: int, step: str, **outputs):
    conn = get_db()
    conn.execute('''
    UPDATE ai_jobs
    SET status = ?, progress = ?, current_step = ?,
        output_video_url = COALESCE(?, output_video_url),
        output_image_url = COALESCE(?, output_image_url),
        output_audio_url = COALESCE(?, output_audio_url),
        script_json = COALESCE(?, script_json),
        completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE id = ?
    ''', (status, progress, step, outputs.get("video"), outputs.get("image"), outputs.get("audio"),
          outputs.get("script"), status, job_id))
    conn.commit()
    conn.close()


def fail_job(job_id: str, message: str):
    """Đánh dấu job thất bại và hoàn credit đúng một lần."""
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT user_id, cost_credits, refunded FROM ai_jobs WHERE id = ?", (job_id,)).fetchone()
        if row is None:
            conn.rollback()
            return
        conn.execute("UPDATE ai_jobs SET status = 'failed', error_message = ?, current_step = 'Thất bại' WHERE id = ?",
                     (message[:1000], job_id))
        if row["cost_credits"] and not row["refunded"]:
            refund_credits(row["user_id"], row["cost_credits"], f"Hoàn credit job lỗi {job_id}", conn)
            conn.execute("UPDATE ai_jobs SET refunded = 1 WHERE id = ?", (job_id,))
        conn.commit()
    finally:
        conn.close()


def _process_job_worker(job_id: str):
    """Worker xử lý tuần tự các bước của pipeline AI."""
    try:
        conn = get_db()
        job = dict(conn.execute("SELECT * FROM ai_jobs WHERE id = ?", (job_id,)).fetchone())
        conn.close()
        params = json.loads(job["params_json"] or "{}")
        product = get_product(job["product_id"])
        if product is None:
            raise ValueError(f"Sản phẩm {job['product_id']} không tồn tại")
        avatar_id = params.get("avatar_id") or "model_01"
        template = params.get("template") or DEFAULT_TEMPLATE

        _update_job(job_id, 'processing', 10, 'Bước 1/5: Tách nền trang phục')
        seg = segment_garment(try_resolve_media_ref(product["image_url"]), output_name=f"seg_{job_id}.png")

        _update_job(job_id, 'processing', 30, 'Bước 2/5: Ghép trang phục lên người mẫu')
        tryon = generate_tryon(seg["output_path"], avatar_id=avatar_id, avatar_row=get_brand_avatar(avatar_id),
                               output_name=f"tryon_{job_id}.jpg")
        _update_job(job_id, 'processing', 45, 'Bước 3/5: Tạo chuyển động video 9:16', image=tryon["media_url"])
        motion = generate_motion(tryon["output_path"], duration_sec=int(params.get("duration_sec") or 5),
                                 template=template, output_name=f"motion_{job_id}.mp4")

        _update_job(job_id, 'processing', 65, 'Bước 4/5: Viết kịch bản và lồng tiếng')
        script = generate_koc_script(product["title"], product["price"], product.get("fabric_type"),
                                     style=params.get("script_style") or "genz", category=product.get("category"))
        tts = generate_speech(script["full_script"], params.get("voice") or DEFAULT_VOICE,
                              output_name=f"tts_{job_id}.mp3")
        script["tts_engine"] = tts["engine"]
        script["tts_warning"] = tts["warning"]
        script["subtitles_vtt"] = tts["vtt_url"]

        _update_job(job_id, 'processing', 85, 'Bước 5/5: Ghép video và âm thanh', audio=tts["audio_url"],
                    script=json.dumps(script, ensure_ascii=False))
        final = render_final_video(motion["video_path"], tts["audio_path"], output_name=f"final_{job_id}.mp4")

        conn = get_db()
        conn.execute("UPDATE brand_avatars SET renders_count = renders_count + 1 WHERE id = ?", (avatar_id,))
        conn.commit()
        conn.close()
        _update_job(job_id, 'completed', 100, 'Hoàn tất, video sẵn sàng xuất bản', video=final["video_url"])
    except Exception as e:
        log.exception("Job %s thất bại", job_id)
        fail_job(job_id, str(e) or e.__class__.__name__)


def recover_stale_jobs() -> int:
    """Khi server khởi động lại, job đang dở sẽ không bao giờ chạy tiếp: đánh dấu lỗi và hoàn credit."""
    conn = get_db()
    ids = [r[0] for r in conn.execute("SELECT id FROM ai_jobs WHERE status IN ('queued', 'processing')")]
    conn.close()
    for job_id in ids:
        fail_job(job_id, "Máy chủ khởi động lại khi job đang chạy, credit đã được hoàn lại")
    return len(ids)


def get_job_status(job_id: str, user_id: str = None):
    conn = get_db()
    row = conn.execute("SELECT * FROM ai_jobs WHERE id = ?", (job_id,)).fetchone()
    conn.close()
    if not row or (user_id is not None and row["user_id"] != user_id):
        return None

    return {
        "job_id": row["id"],
        "user_id": row["user_id"],
        "product_id": row["product_id"],
        "status": row["status"],
        "progress": row["progress"],
        "current_step": row["current_step"],
        "output_video_url": row["output_video_url"],
        "output_image_url": row["output_image_url"],
        "output_audio_url": row["output_audio_url"],
        "error_message": row["error_message"],
        "refunded": bool(row["refunded"]),
        "params": json.loads(row["params_json"] or "{}"),
        "script": json.loads(row["script_json"]) if row["script_json"] else None,
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
    }
