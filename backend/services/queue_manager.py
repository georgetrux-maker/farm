import uuid
import threading
import time
from backend.database import get_db
from backend.ai.segmentation import segment_garment
from backend.ai.vton import generate_tryon
from backend.ai.motion import generate_motion
from backend.ai.script import generate_koc_script
from backend.ai.tts import generate_speech
from backend.ai.render import render_final_video

def create_ai_job(user_id: str, product_id: str, job_type: str = "full_pipeline") -> str:
    """Tạo mới một job trong hàng đợi"""
    job_id = f"JOB_{uuid.uuid4().hex[:10]}"
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
    INSERT INTO ai_jobs (id, user_id, product_id, job_type, status, progress, current_step)
    VALUES (?, ?, ?, ?, 'queued', 0, 'Đang chờ xử lý trong hàng đợi')
    ''', (job_id, user_id, product_id, job_type))

    conn.commit()
    conn.close()

    # Trigger background worker thread
    thread = threading.Thread(target=_process_job_worker, args=(job_id, user_id, product_id))
    thread.daemon = True
    thread.start()

    return job_id

def _update_job(job_id: str, status: str, progress: int, step: str, output_video: str = None, output_image: str = None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
    UPDATE ai_jobs
    SET status = ?, progress = ?, current_step = ?, output_video_url = COALESCE(?, output_video_url), output_image_url = COALESCE(?, output_image_url)
    WHERE id = ?
    ''', (status, progress, step, output_video, output_image, job_id))
    conn.commit()
    conn.close()

def _process_job_worker(job_id: str, user_id: str, product_id: str):
    """Worker xử lý ngầm tuần tự 6 bước của pipeline AI"""
    try:
        # Step 1: Segmentation
        _update_job(job_id, 'processing', 15, 'Bước 1/6: Bóc tách lớp trang phục SAM 2')
        seg_res = segment_garment(product_id, output_name=f"seg_{job_id}.png")
        time.sleep(0.5)

        # Step 2: Try-On
        _update_job(job_id, 'processing', 35, 'Bước 2/6: VTON ghép trang phục lên người mẫu AI', output_image=f"/media/tryon_{job_id}.jpg")
        tryon_res = generate_tryon(product_id, avatar_id="linh_dan", output_name=f"tryon_{job_id}.jpg")
        time.sleep(0.5)

        # Step 3: Motion
        _update_job(job_id, 'processing', 55, 'Bước 3/6: Kling I2V sinh chuyển động catwalk 9:16')
        motion_res = generate_motion(tryon_res["output_path"], duration_sec=5, output_name=f"motion_{job_id}.mp4")
        time.sleep(0.5)

        # Step 4 & 5: Script & TTS
        _update_job(job_id, 'processing', 75, 'Bước 4/6: Lồng tiếng review KOC tiếng Việt và phụ đề')
        script_res = generate_koc_script("Đầm Voan Tơ Hoa Nhí", 189000, style="genz")
        tts_res = generate_speech(script_res["hook_3s"] + " " + script_res["body_text"], output_name=f"tts_{job_id}.mp3")
        time.sleep(0.5)

        # Step 6: Render Final Video
        _update_job(job_id, 'processing', 90, 'Bước 5/6: Render ghép video, audio và nén bit-rate')
        final_res = render_final_video(motion_res["video_path"], tts_res["audio_path"], output_name=f"final_{job_id}.mp4")

        # Completed
        _update_job(job_id, 'completed', 100, 'Bước 6/6: Hoàn tất video tương tác sẵn sàng xuất bản',
                    output_video=final_res["video_url"], output_image=tryon_res["media_url"])

    except Exception as e:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("UPDATE ai_jobs SET status = 'failed', error_message = ? WHERE id = ?", (str(e), job_id))
        conn.commit()
        conn.close()

def get_job_status(job_id: str) -> dict:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM ai_jobs WHERE id = ?", (job_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return {"status": "error", "message": "Job không tồn tại"}

    return {
        "job_id": row["id"],
        "user_id": row["user_id"],
        "product_id": row["product_id"],
        "status": row["status"],
        "progress": row["progress"],
        "current_step": row["current_step"],
        "output_video_url": row["output_video_url"],
        "output_image_url": row["output_image_url"],
        "created_at": row["created_at"]
    }
