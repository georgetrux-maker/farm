from typing import Optional

from backend.ffmpeg_utils import run_ffmpeg
from backend.media_paths import media_path, media_url

# Engine hiện tại tạo chuyển động máy quay (zoom/pan) từ ảnh tĩnh bằng FFmpeg.
# Đợt 2 sẽ thay bằng API image-to-video thật (Kling / Veo / Hailuo...).
ENGINE = "placeholder-ffmpeg-camera"

FPS = 30
WIDTH, HEIGHT = 540, 960

# Mỗi mẫu video là một kiểu chuyển động máy quay khác nhau.
# Biến trong biểu thức zoompan: on = số thứ tự khung hình; N được thay bằng tổng số khung hình.
TEMPLATES = {
    "catwalk": {
        "label": "Catwalk: tiến dần vào người mẫu",
        "z": "1+0.15*on/N",
        "x": "(iw-iw/zoom)/2",
        "y": "(ih-ih/zoom)*(0.6-0.3*on/N)",
    },
    "spin_360": {
        "label": "Xoay tôn dáng: lia ngang qua lại",
        "z": "1.15",
        "x": "(iw-iw/zoom)/2*(1+sin(2*PI*on/N))",
        "y": "(ih-ih/zoom)/2",
    },
    "street": {
        "label": "Dạo phố: lùi ra toàn thân",
        "z": "1.25-0.25*on/N",
        "x": "(iw-iw/zoom)/2",
        "y": "(ih-ih/zoom)/2",
    },
    "fabric_closeup": {
        "label": "Cận chất liệu: zoom sát vào vải",
        "z": "1+0.8*on/N",
        "x": "(iw-iw/zoom)/2",
        "y": "(ih-ih/zoom)*0.4",
    },
}
DEFAULT_TEMPLATE = "catwalk"


def generate_motion(image_path: Optional[str], duration_sec: int = 5, template: str = DEFAULT_TEMPLATE,
                    output_name: str = "catwalk_motion.mp4") -> dict:
    """
    Task 3: Sinh video dọc 9:16 từ ảnh try-on theo mẫu chuyển động đã chọn.
    `image_path` phải là đường dẫn đã kiểm tra trong thư mục media, hoặc None để tạo nền trống.
    """
    if template not in TEMPLATES:
        raise ValueError(f"Mẫu video không hợp lệ: {template}")
    duration_sec = max(1, min(int(duration_sec), 30))
    output_path = media_path(output_name)
    frames = duration_sec * FPS
    tpl = {k: v.replace("N", str(frames)) for k, v in TEMPLATES[template].items() if k != "label"}

    if image_path:
        vf = (
            f"scale={WIDTH * 2}:{HEIGHT * 2}:force_original_aspect_ratio=decrease,"
            f"pad={WIDTH * 2}:{HEIGHT * 2}:(ow-iw)/2:(oh-ih)/2:color=0x12141D,"
            f"zoompan=z='{tpl['z']}':x='{tpl['x']}':y='{tpl['y']}':d={frames}:s={WIDTH}x{HEIGHT}:fps={FPS},"
            "format=yuv420p"
        )
        args = ["-i", image_path, "-vf", vf, "-frames:v", str(frames)]
    else:
        args = ["-f", "lavfi", "-i", f"color=c=0x12141D:s={WIDTH}x{HEIGHT}:r={FPS}", "-t", str(duration_sec),
                "-pix_fmt", "yuv420p"]

    run_ffmpeg([*args, "-c:v", "libx264", "-preset", "veryfast", "-r", str(FPS), output_path])

    return {
        "status": "success",
        "engine": ENGINE,
        "video_path": output_path,
        "video_url": media_url(output_path),
        "duration_sec": duration_sec,
        "resolution": f"{WIDTH}x{HEIGHT}",
        "fps": FPS,
        "template": template,
        "motion_style": TEMPLATES[template]["label"],
    }
