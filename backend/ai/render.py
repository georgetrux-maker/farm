import math
import os
from typing import Optional

from backend.ffmpeg_utils import probe_duration, run_ffmpeg
from backend.media_paths import media_path, media_url

# Khung chuẩn cho TikTok / Reels / Shorts
WIDTH, HEIGHT = 720, 1280
FPS = 30
TAIL_SEC = 0.4          # giữ hình thêm một chút sau câu thoại cuối
MAX_LOOPS = 12          # số lần nối đoạn chuyển động tối đa (phần còn thiếu giữ khung cuối)
SUBTITLE_FONT = "DejaVu Sans"  # có đủ dấu tiếng Việt (gói fonts-dejavu-core)


def _ass_time(seconds: float) -> str:
    cs = int(round(max(0.0, seconds) * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _ass_text(text: str) -> str:
    # Ngoặc nhọn và gạch chéo ngược là ký tự điều khiển trong ASS
    return " ".join(text.replace("\\", "/").replace("{", "(").replace("}", ")").split())


def build_ass(phrases: list, width: int = WIDTH, height: int = HEIGHT) -> str:
    """Phụ đề kiểu TikTok: chữ trắng đậm viền đen, nằm cao hơn vùng nút bấm của ứng dụng."""
    font_size = round(height * 0.044)
    margin_v = round(height * 0.23)
    margin_h = round(width * 0.08)
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding",
        f"Style: Default,{SUBTITLE_FONT},{font_size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H78000000,-1,0,0,0,100,100,0,0,"
        f"1,4,2,2,{margin_h},{margin_h},{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for start, end, text in phrases:
        if end > start and text.strip():
            lines.append(f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Default,,0,0,0,,{_ass_text(text)}")
    return "\n".join(lines) + "\n"


def _video_graph(n_inputs: int, clip_sec: float, total_sec: float, subtitle_file: Optional[str]) -> str:
    """Nối `n_inputs` bản của cùng một đoạn chuyển động bằng hiệu ứng mờ chéo (không nhảy cảnh),
    đưa về khung 720x1280, gắn phụ đề và cắt đúng độ dài lời thoại."""
    norm = (f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,"
            f"pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x12141D,setsar=1,fps={FPS},format=yuv420p,settb=AVTB")
    parts = [f"[{i}:v]{norm}[c{i}]" for i in range(n_inputs)]
    fade = min(0.8, clip_sec / 4)
    prev = "c0"
    for i in range(1, n_inputs):
        parts.append(f"[{prev}][c{i}]xfade=transition=fade:duration={fade:.3f}:offset={i * (clip_sec - fade):.3f}[x{i}]")
        prev = f"x{i}"
    covered = clip_sec + (n_inputs - 1) * (clip_sec - fade)
    tail = [f"tpad=stop_mode=clone:stop_duration={max(0.0, total_sec - covered) + 0.5:.3f}"]
    if subtitle_file:
        tail.append(f"ass={subtitle_file}")
    tail.append(f"trim=duration={total_sec:.3f},setpts=PTS-STARTPTS")
    parts.append(f"[{prev}]{','.join(tail)}[v]")
    return ";".join(parts)


def render_final_video(video_path: str, audio_path: str, output_name: str = "final_fashion_review.mp4",
                       subtitle_phrases: Optional[list] = None) -> dict:
    """
    Task 6: Ghép video chuyển động + lồng tiếng + phụ đề thành MP4 720x1280 (H.264/AAC) cho TikTok/Reels.
    Độ dài video = độ dài lời thoại. Nếu đoạn chuyển động ngắn hơn, nó được nối tiếp bằng hiệu ứng mờ chéo
    thay vì lặp giật. Cả hai đường dẫn phải nằm trong thư mục media.
    """
    output_path = media_path(output_name)
    audio_sec = probe_duration(audio_path)
    clip_sec = probe_duration(video_path)
    if audio_sec <= 0 or clip_sec <= 0:
        raise ValueError("Không đọc được độ dài video hoặc âm thanh")
    total_sec = max(3.0, audio_sec + TAIL_SEC)

    n_inputs = 1
    if clip_sec < total_sec - 0.05 and clip_sec >= 1.0:
        fade = min(0.8, clip_sec / 4)
        n_inputs = min(MAX_LOOPS, 1 + math.ceil((total_sec - clip_sec) / (clip_sec - fade)))

    media_dir = os.path.dirname(output_path)
    subtitle_file = None
    if subtitle_phrases:
        # File phụ đề nằm cạnh video, gọi bằng tên tương đối (ffmpeg chạy trong thư mục media)
        # để không phải xử lý ký tự đặc biệt của đường dẫn trong bộ lọc
        subtitle_file = os.path.splitext(os.path.basename(output_path))[0] + ".ass"
        with open(os.path.join(media_dir, subtitle_file), "w", encoding="utf-8") as f:
            f.write(build_ass(subtitle_phrases))

    args = []
    for _ in range(n_inputs):
        args += ["-i", video_path]
    args += ["-i", audio_path,
             "-filter_complex",
             _video_graph(n_inputs, clip_sec, total_sec, subtitle_file) + f";[{n_inputs}:a]apad[a]",
             "-map", "[v]", "-map", "[a]",
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-r", str(FPS),
             "-c:a", "aac", "-b:a", "192k",
             "-t", f"{total_sec:.3f}",
             "-movflags", "+faststart",
             output_path]
    try:
        run_ffmpeg(args, cwd=media_dir)
    finally:
        if subtitle_file:
            try:
                os.remove(os.path.join(media_dir, subtitle_file))
            except OSError:
                pass

    return {
        "status": "success",
        "output_path": output_path,
        "video_url": media_url(output_path),
        "file_size_bytes": os.path.getsize(output_path),
        "duration_sec": round(probe_duration(output_path), 2),
        "format": "mp4 (H.264 / AAC)",
        "resolution": f"{WIDTH}x{HEIGHT}",
        "aspect_ratio": "9:16",
        "subtitles_burned": bool(subtitle_phrases),
    }
