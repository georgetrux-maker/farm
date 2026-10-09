import os

from backend.ffmpeg_utils import probe_duration, run_ffmpeg
from backend.media_paths import media_path, media_url


def render_final_video(video_path: str, audio_path: str, output_name: str = "final_fashion_review.mp4") -> dict:
    """
    Task 6: Ghép video chuyển động + lồng tiếng thành MP4 (H.264/AAC) cho TikTok/Reels.
    Video được lặp lại cho đủ độ dài lời thoại. Cả hai đường dẫn phải nằm trong thư mục media.
    """
    output_path = media_path(output_name)
    # Cắt theo độ dài âm thanh bằng -t: dùng -shortest với -stream_loop có thể khiến ffmpeg lặp vô hạn
    duration = probe_duration(audio_path) or probe_duration(video_path)
    if duration <= 0:
        raise ValueError("Không đọc được độ dài file âm thanh")
    run_ffmpeg([
        "-stream_loop", "-1", "-i", video_path,
        "-i", audio_path,
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-t", f"{duration:.3f}",
        "-movflags", "+faststart",
        output_path,
    ])

    return {
        "status": "success",
        "output_path": output_path,
        "video_url": media_url(output_path),
        "file_size_bytes": os.path.getsize(output_path),
        "duration_sec": round(probe_duration(output_path), 2),
        "format": "mp4 (H.264 / AAC)",
        "aspect_ratio": "9:16",
    }
