import json
import logging
import os
import uuid

from backend import config
from backend.ai.motion import DEFAULT_TEMPLATE, generate_motion
from backend.ai.render import TRANSITION_SEC, concat_scenes, extract_keyframes, render_final_video
from backend.ai.scenes import DEFAULT_SCENE
from backend.ai.script import caption_and_hashtags, generate_koc_script
from backend.ai.segmentation import segment_garment
from backend.ai.product_analysis import analyze_product
from backend.ai.tts import DEFAULT_VOICE, generate_speech
from backend.ai.vton import engine_name as vton_engine_name
from backend.ai.vton import generate_tryon, restage_placeholder
from backend.database import get_brand_avatar, get_db, get_product, save_product_analysis, search_key
from backend.media_paths import media_path, try_resolve_media_ref
from backend.services.plans import sync_user_plan
from backend.services.task_queue import QueueUnavailable, enqueue_job
from backend.services.wallet import deduct_credits, refund_credits

log = logging.getLogger(__name__)

class InsufficientCredits(Exception):
    pass


def create_ai_jobs(user_id: str, product_ids: list, params: dict, cost_per_job: int) -> dict:
    """Trừ credit và tạo job trong cùng một transaction (đủ tiền cho tất cả thì mới tạo)."""
    total = cost_per_job * len(product_ids)
    job_ids = [f"JOB_{uuid.uuid4().hex[:10]}" for _ in product_ids]
    sync_user_plan(user_id)  # credit tháng mới của gói (nếu tới mốc) được cộng trước khi trừ
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

    try:
        for job_id in job_ids:
            enqueue_job(job_id)
    except QueueUnavailable:
        # Không đưa được vào hàng đợi: hủy các job vừa tạo và hoàn lại toàn bộ credit
        for job_id in job_ids:
            fail_job(job_id, "Hàng đợi xử lý không hoạt động, credit đã được hoàn lại")
        raise
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
        updated_at = CURRENT_TIMESTAMP,
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


def _load_job(job_id: str) -> dict:
    conn = get_db()
    row = conn.execute("SELECT * FROM ai_jobs WHERE id = ?", (job_id,)).fetchone()
    conn.close()
    if row is None:
        raise ValueError(f"Job {job_id} không tồn tại")
    return dict(row)


def ensure_product_analysis(product: dict) -> dict:
    """Phân tích ảnh sản phẩm một lần rồi lưu lại (dùng cho thử đồ và viết kịch bản)."""
    if product.get("analysis_json"):
        return json.loads(product["analysis_json"])
    image_path = try_resolve_media_ref(product["image_url"])
    if not image_path:
        return {}
    analysis = analyze_product(image_path, product["title"]).get("ai") or {}
    if analysis:
        save_product_analysis(product["id"], analysis)
    return analysis


def _run_tryon_stage(job_id: str, params: dict, product: dict) -> dict:
    avatar_id = params.get("avatar_id") or "model_01"
    product_image = try_resolve_media_ref(product["image_url"])

    _update_job(job_id, 'processing', 5, 'Bước 1/5: Phân tích ảnh sản phẩm')
    analysis = ensure_product_analysis(product)

    _update_job(job_id, 'processing', 15, 'Bước 2/5: Tách nền trang phục')
    seg = segment_garment(product_image, output_name=f"seg_{job_id}.png")

    _update_job(job_id, 'processing', 25, 'Bước 3/5: Ghép trang phục lên người mẫu')
    # Thử đồ thật dùng ảnh gốc (nhà cung cấp tự tách nền); ảnh minh họa dùng ảnh đã tách nền
    garment = product_image if vton_engine_name() == "fashn" else seg["output_path"]
    return generate_tryon(garment, avatar_id=avatar_id, avatar_row=get_brand_avatar(avatar_id),
                          output_name=f"tryon_{job_id}.jpg",
                          garment_type=analysis.get("garment_type", "auto"),
                          photo_type=analysis.get("photo_type", "auto"),
                          scene=params.get("scene") or DEFAULT_SCENE)


def _run_video_stage(job_id: str, params: dict, product: dict, tryon_path: str):
    avatar_id = params.get("avatar_id") or "model_01"
    analysis = json.loads(product["analysis_json"]) if product.get("analysis_json") else {}

    # Viết kịch bản và lồng tiếng trước để biết video cần dài bao nhiêu
    _update_job(job_id, 'processing', 50, 'Bước 4/5: Viết kịch bản và lồng tiếng')
    if params.get("custom_script") and str(params["custom_script"]).strip():
        custom_txt = str(params["custom_script"]).strip()
        lines = [line.strip() for line in custom_txt.split("\n") if line.strip()]
        script = {
            "hook": lines[0] if lines else "",
            "body": lines[1] if len(lines) > 1 else "",
            "cta": lines[2] if len(lines) > 2 else (lines[-1] if len(lines) > 1 else ""),
            "full_script": custom_txt,
            "engine": "custom_user_script",
            # Người bán tự viết lời: vẫn kèm caption + hashtag để đăng mạng xã hội
            **caption_and_hashtags(product["title"], product["price"], product.get("category")),
        }
    else:
        script = generate_koc_script(product["title"], product["price"], product.get("fabric_type"),
                                     style=params.get("script_style") or "genz", category=product.get("category"),
                                     analysis=analysis, image_path=try_resolve_media_ref(product["image_url"]))
    tts = generate_speech(script["full_script"], params.get("voice") or DEFAULT_VOICE, output_name=f"tts_{job_id}.mp3")
    script.update({"tts_engine": tts["engine"], "tts_warning": tts["warning"], "subtitles_vtt": tts["vtt_url"]})
    _update_job(job_id, 'processing', 65, 'Bước 5/5: Tạo chuyển động video 9:16 (AI có thể mất vài phút)',
                audio=tts["audio_url"], script=json.dumps(script, ensure_ascii=False))

    scenes = params.get("scenes") or []
    effects = params.get("effects") or {}
    min_total = 0.0
    if len(scenes) > 1:
        motion, min_total = _render_scenes(job_id, params, tryon_path, scenes, effects.get("transition") or "fade",
                                           voice_sec=tts["duration_sec"] + 0.4)
    else:
        motion = generate_motion(tryon_path, duration_sec=int(params.get("duration_sec") or 5),
                                 template=params.get("template") or DEFAULT_TEMPLATE, output_name=f"motion_{job_id}.mp4",
                                 fill_duration_sec=tts["duration_sec"] + 0.4, scene=params.get("scene"))

    _update_job(job_id, 'processing', 85, 'Bước 5/5: Ghép video, phụ đề và âm thanh')
    show_tag = effects.get("title_card", True)
    price_text = f"{int(product['price']):,}đ".replace(",", ".") if product.get("price") and show_tag else None
    final = render_final_video(motion["video_path"], tts["audio_path"], output_name=f"final_{job_id}.mp4",
                               subtitle_phrases=tts["phrases"] if effects.get("subtitles", True) else None,
                               title=product["title"] if show_tag else None, price_text=price_text,
                               min_total_sec=min_total)
    script.update({"motion_engine": motion["engine"], "video_resolution": final["resolution"],
                   "video_duration_sec": final["duration_sec"], "subtitles_burned": final["subtitles_burned"],
                   "scenes": _scenes(final["output_path"], tts["phrases"], job_id)})

    conn = get_db()
    conn.execute("UPDATE brand_avatars SET renders_count = renders_count + 1 WHERE id = ?", (avatar_id,))
    conn.commit()
    conn.close()
    _update_job(job_id, 'completed', 100, 'Hoàn tất, video sẵn sàng xuất bản', video=final["video_url"],
                script=json.dumps(script, ensure_ascii=False))


def _render_scenes(job_id: str, params: dict, tryon_path: str, scenes: list, transition: str, voice_sec: float):
    """Pro Studio: mỗi cảnh một đoạn chuyển động (kiểu, bối cảnh, thời lượng riêng) rồi nối bằng hiệu ứng chuyển cảnh.

    Ảnh thử đồ minh họa được dựng lại với phông nền của từng bối cảnh (rẻ, chạy tại chỗ);
    ảnh thử đồ thật chỉ tạo một lần, bối cảnh của từng cảnh do model video đảm nhận.
    Lời thoại dài hơn tổng các cảnh: engine FFmpeg kéo dài cảnh cuối cho vừa (AI video thì nối lặp khi ghép).
    """
    seg_path = media_path(f"seg_{job_id}.png")
    images = {params.get("scene") or DEFAULT_SCENE: tryon_path}
    overlap = 0 if transition == "cut" else TRANSITION_SEC
    planned = sum(int(spec.get("duration_sec") or 5) for spec in scenes) - overlap * (len(scenes) - 1)
    clips, engine = [], None
    for i, spec in enumerate(scenes):
        _update_job(job_id, 'processing', 65 + round(18 * i / len(scenes)),
                    f'Bước 5/5: Tạo cảnh {i + 1}/{len(scenes)} (AI có thể mất vài phút mỗi cảnh)')
        scene = spec.get("scene") or DEFAULT_SCENE
        if scene not in images:
            images[scene] = restage_placeholder(seg_path if os.path.exists(seg_path) else None,
                                                f"tryon_{job_id}_{scene}.jpg", scene) or tryon_path
        duration = int(spec.get("duration_sec") or 5)
        last = i == len(scenes) - 1
        motion = generate_motion(images[scene], duration_sec=duration,
                                 template=spec.get("template") or DEFAULT_TEMPLATE,
                                 output_name=f"motion_{job_id}_{i + 1}.mp4", scene=scene,
                                 fill_duration_sec=duration + max(0.0, voice_sec - planned) if last else None)
        clips.append(motion["video_path"])
        engine = motion["engine"]
    joined = concat_scenes(clips, transition, output_name=f"motion_{job_id}.mp4")
    for path in clips:
        try:
            os.remove(path)
        except OSError:
            pass
    return {"video_path": joined["video_path"], "engine": engine}, joined["duration_sec"]


def _scenes(video_path: str, phrases: list, job_id: str) -> list:
    """5 khung hình trong video kèm câu phụ đề đang đọc lúc đó. Lỗi thì bỏ qua, không làm hỏng video."""
    try:
        frames = extract_keyframes(video_path, prefix=f"scene_{job_id}")
    except Exception:
        log.exception("Không chụp được khung hình cho job %s", job_id)
        return []
    for frame in frames:
        current = [text for start, end, text in phrases if start <= frame["time"]]
        frame["caption"] = current[-1] if current else ""
    return frames


def run_job(job_id: str, resume_after_approval: bool = False):
    """Điểm vào chung cho luồng nền (QUEUE_BACKEND=thread) và worker Celery."""
    if resume_after_approval:
        _process_job_worker(job_id, True)
    else:
        _process_job_worker(job_id)


def _process_job_worker(job_id: str, resume_after_approval: bool = False):
    """Worker: thử đồ -> (chờ duyệt nếu được yêu cầu) -> tạo video."""
    try:
        job = _load_job(job_id)
        if job["status"] not in ("queued", "processing"):
            # Việc được giao lại sau khi đã xong (vd. worker mất kết nối lúc báo nhận): không làm lại
            log.info("Bỏ qua job %s ở trạng thái %s", job_id, job["status"])
            return
        params = json.loads(job["params_json"] or "{}")
        product = get_product(job["product_id"])
        if product is None:
            raise ValueError(f"Sản phẩm {job['product_id']} không tồn tại")

        if resume_after_approval:
            tryon_path = try_resolve_media_ref(job["output_image_url"] or "")
            if not tryon_path:
                raise ValueError("Không tìm thấy ảnh thử đồ đã duyệt")
        else:
            tryon = _run_tryon_stage(job_id, params, product)
            tryon_path = tryon["output_path"]
            if params.get("require_approval"):
                _update_job(job_id, 'awaiting_approval', 40, 'Chờ duyệt ảnh thử đồ', image=tryon["media_url"])
                return
            _update_job(job_id, 'processing', 40, 'Đã thử đồ xong', image=tryon["media_url"])

        product = get_product(job["product_id"])  # đọc lại để lấy phân tích vừa lưu
        _run_video_stage(job_id, params, product, tryon_path)
    except Exception as e:
        log.exception("Job %s thất bại", job_id)
        fail_job(job_id, str(e) or e.__class__.__name__)


def approve_job(job_id: str, user_id: str) -> bool:
    """Người bán đồng ý ảnh thử đồ: tiếp tục tạo video."""
    conn = get_db()
    cur = conn.execute(
        "UPDATE ai_jobs SET status = 'queued', progress = 45, current_step = 'Đã duyệt, đang chờ tạo video', "
        "updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND status = 'awaiting_approval'", (job_id, user_id))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        return False
    try:
        enqueue_job(job_id, resume_after_approval=True)
    except QueueUnavailable:
        conn = get_db()
        conn.execute("UPDATE ai_jobs SET status = 'awaiting_approval', progress = 40, current_step = 'Chờ duyệt ảnh thử đồ' "
                     "WHERE id = ? AND status = 'queued'", (job_id,))
        conn.commit()
        conn.close()
        raise
    return True


def reject_job(job_id: str, user_id: str):
    """Người bán không ưng ảnh thử đồ: dừng job, hoàn credit trừ phần phí thử đồ đã dùng."""
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT cost_credits, refunded FROM ai_jobs WHERE id = ? AND user_id = ? AND status = 'awaiting_approval'",
            (job_id, user_id)).fetchone()
        if row is None:
            conn.rollback()
            return None
        refund = max(0, row["cost_credits"] - config.tryon_preview_cost_credits())
        conn.execute("UPDATE ai_jobs SET status = 'rejected', current_step = 'Đã hủy sau khi xem ảnh thử đồ', "
                     "refunded = 1 WHERE id = ?", (job_id,))
        if refund and not row["refunded"]:
            refund_credits(user_id, refund, f"Hoàn credit job {job_id} bị hủy ở bước duyệt", conn)
        conn.commit()
    finally:
        conn.close()
    return {"status": "rejected", "credits_refunded": refund}


def recover_stale_jobs() -> int:
    """Đánh dấu lỗi và hoàn credit cho job không bao giờ chạy tiếp.

    - thread: job nằm trong bộ nhớ tiến trình web nên khởi động lại là mất hết việc đang dở.
    - celery: việc nằm trong Redis và được giao lại khi worker chết, nên chỉ xử lý job không cập nhật tiến độ
      quá lâu (job đang chạy cập nhật updated_at mỗi bước; job duyệt muộn tính từ lúc duyệt).
    """
    conn = get_db()
    if config.queue_backend() == "celery":
        rows = conn.execute("SELECT id FROM ai_jobs WHERE status IN ('queued', 'processing') "
                            "AND COALESCE(updated_at, created_at) < datetime('now', ?)", (f"-{config.stale_job_minutes()} minutes",))
        message = "Job bị treo quá lâu trong hàng đợi, credit đã được hoàn lại"
    else:
        rows = conn.execute("SELECT id FROM ai_jobs WHERE status IN ('queued', 'processing')")
        message = "Máy chủ khởi động lại khi job đang chạy, credit đã được hoàn lại"
    ids = [r[0] for r in rows]
    conn.close()
    for job_id in ids:
        fail_job(job_id, message)
    return len(ids)


def _job_dict(row) -> dict:
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
        "cost_credits": row["cost_credits"],
        "params": json.loads(row["params_json"] or "{}"),
        "script": json.loads(row["script_json"]) if row["script_json"] else None,
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
    }


def get_job_status(job_id: str, user_id: str = None):
    conn = get_db()
    row = conn.execute("SELECT * FROM ai_jobs WHERE id = ?", (job_id,)).fetchone()
    conn.close()
    if not row or (user_id is not None and row["user_id"] != user_id):
        return None
    return _job_dict(row)


# Nhóm trạng thái dùng cho bộ lọc trên trang "Video của tôi"
STATUS_GROUPS = {
    "completed": ("completed",),
    "busy": ("queued", "pending", "processing"),
    "awaiting_approval": ("awaiting_approval",),
    "other": ("failed", "rejected"),
}
SORTS = {
    "newest": "j.created_at DESC, j.rowid DESC",
    "oldest": "j.created_at ASC, j.rowid ASC",
    "title": "search_key(p.title) ASC, j.created_at DESC, j.rowid DESC",
}


def list_jobs(user_id: str, page: int = 1, page_size: int = 24, q: str = None, status: str = None,
              sort: str = "newest") -> dict:
    """Video của một người dùng, có phân trang, tìm theo tên sản phẩm (không cần gõ dấu),
    lọc theo nhóm trạng thái và sắp xếp. Kèm số lượng theo từng nhóm để hiện trên bộ lọc."""
    where, args = ["j.user_id = ?"], [user_id]
    key = search_key(q)
    if key:
        escaped = key.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("search_key(p.title) LIKE ? ESCAPE '\\'")
        args.append(f"%{escaped}%")
    base = "FROM ai_jobs j LEFT JOIN products p ON p.id = j.product_id WHERE " + " AND ".join(where)

    conn = get_db()
    try:
        by_status = dict(conn.execute(f"SELECT j.status, COUNT(*) {base} GROUP BY j.status", args).fetchall())
        counts = {group: sum(by_status.get(s, 0) for s in members) for group, members in STATUS_GROUPS.items()}
        counts["all"] = sum(by_status.values())

        filtered, filter_args = base, list(args)
        if status in STATUS_GROUPS:
            members = STATUS_GROUPS[status]
            filtered += f" AND j.status IN ({','.join('?' * len(members))})"
            filter_args += list(members)
        total = conn.execute(f"SELECT COUNT(*) {filtered}", filter_args).fetchone()[0]
        rows = conn.execute(f'''
        SELECT j.*, p.title AS product_title, p.image_url AS product_image_url, p.price AS product_price,
               p.original_price AS product_original_price, p.category AS product_category,
               p.fabric_type AS product_fabric,
               (SELECT COUNT(*) FROM publications pb WHERE pb.job_id = j.id AND pb.status = 'published') AS published_count,
               (SELECT GROUP_CONCAT(DISTINCT pb.platform) FROM publications pb
                 WHERE pb.job_id = j.id AND pb.status = 'published') AS published_platforms
        {filtered}
        ORDER BY {SORTS.get(sort, SORTS["newest"])}
        LIMIT ? OFFSET ?
        ''', filter_args + [page_size, (page - 1) * page_size]).fetchall()
    finally:
        conn.close()

    items = []
    for row in rows:
        job = _job_dict(row)
        job.update({"product_title": row["product_title"], "product_image_url": row["product_image_url"],
                    "product_price": row["product_price"], "product_original_price": row["product_original_price"],
                    "product_category": row["product_category"], "product_fabric": row["product_fabric"],
                    "published_count": row["published_count"],
                    "published_platforms": sorted(filter(None, (row["published_platforms"] or "").split(",")))})
        items.append(job)
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "has_more": page * page_size < total, "counts": counts}
