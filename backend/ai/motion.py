"""Sinh video chuyển động 9:16 từ ảnh thử đồ.

- Có REPLICATE_API_TOKEN: gọi model image-to-video trên Replicate (mặc định Kling 3.0),
  mỗi mẫu video là một câu mô tả chuyển động riêng.
- Chưa có: tạo chuyển động máy quay (zoom/pan) từ ảnh tĩnh bằng FFmpeg.
"""
import logging
from typing import Optional

from backend import config
from backend.ai import http_utils
from backend.ai.http_utils import ProviderError
from backend.ffmpeg_utils import probe_duration, run_ffmpeg
from backend.media_paths import media_path, media_url

log = logging.getLogger(__name__)

REPLICATE_BASE_URL = "https://api.replicate.com/v1"
FPS = 30
WIDTH, HEIGHT = 720, 1280
MAX_PLACEHOLDER_SEC = 90  # giới hạn Reels

# z/x/y: biểu thức zoompan cho engine FFmpeg (on = số thứ tự khung hình; N được thay bằng tổng số khung hình)
# prompt: mô tả chuyển động cho model image-to-video
TEMPLATES = {
    "catwalk": {
        "label": "Catwalk: người mẫu sải bước về phía máy quay",
        "z": "1+0.15*on/N",
        "x": "(iw-iw/zoom)/2",
        "y": "(ih-ih/zoom)*(0.6-0.3*on/N)",
        "prompt": ("The fashion model walks confidently toward the camera like on a runway, natural stride, "
                   "the outfit moves naturally with each step, clean studio lighting, steady camera, full body in frame."),
    },
    "spin_360": {
        "label": "Xoay tôn dáng: người mẫu xoay một vòng khoe trang phục",
        "z": "1.15",
        "x": "(iw-iw/zoom)/2*(1+sin(2*PI*on/N))",
        "y": "(ih-ih/zoom)/2",
        "prompt": ("The fashion model slowly turns around in place to show the outfit from the front, side and back, "
                   "then faces the camera again and smiles, steady camera, full body in frame, studio lighting."),
    },
    "street": {
        "label": "Dạo phố: người mẫu đi dạo tự nhiên",
        "z": "1.25-0.25*on/N",
        "x": "(iw-iw/zoom)/2",
        "y": "(ih-ih/zoom)/2",
        "prompt": ("The fashion model strolls casually and naturally, glancing at the camera, relaxed street-style vibe, "
                   "soft daylight, camera slowly tracks backward, full body in frame."),
    },
    "fabric_closeup": {
        "label": "Cận chất liệu: máy quay tiến sát vào vải",
        "z": "1+0.8*on/N",
        "x": "(iw-iw/zoom)/2",
        "y": "(ih-ih/zoom)*0.4",
        "prompt": ("The camera slowly pushes in from a full body shot to a close-up of the garment fabric, "
                   "showing texture, stitching and how the fabric drapes as the model moves gently. Soft studio light."),
    },
}
DEFAULT_TEMPLATE = "catwalk"
NEGATIVE_PROMPT = ("changing the garment design, different clothes, distorted clothing, warped logo, extra limbs, "
                   "deformed hands, blurry, text, watermark")


def engine_name() -> str:
    return "replicate:" + config.replicate_video_model() if config.replicate_api_token() else "placeholder-ffmpeg-camera"


def _ffmpeg_motion(image_path: Optional[str], duration_sec: float, template: str, output_path: str) -> None:
    frames = max(1, round(duration_sec * FPS))
    tpl = {k: TEMPLATES[template][k].replace("N", str(frames)) for k in ("z", "x", "y")}
    # Phóng ảnh lớn hơn khung ra 1,5 lần để khi zoom vẫn nét
    big_w, big_h = WIDTH * 3 // 2, HEIGHT * 3 // 2
    if image_path:
        vf = (
            f"scale={big_w}:{big_h}:force_original_aspect_ratio=decrease,"
            f"pad={big_w}:{big_h}:(ow-iw)/2:(oh-ih)/2:color=0x12141D,"
            f"zoompan=z='{tpl['z']}':x='{tpl['x']}':y='{tpl['y']}':d={frames}:s={WIDTH}x{HEIGHT}:fps={FPS},"
            "format=yuv420p"
        )
        args = ["-i", image_path, "-vf", vf, "-frames:v", str(frames)]
    else:
        args = ["-f", "lavfi", "-i", f"color=c=0x12141D:s={WIDTH}x{HEIGHT}:r={FPS}", "-t", f"{duration_sec:.3f}",
                "-pix_fmt", "yuv420p"]
    run_ffmpeg([*args, "-c:v", "libx264", "-preset", "veryfast", "-r", str(FPS), output_path])


def _replicate_headers() -> dict:
    return {"Authorization": f"Bearer {config.replicate_api_token()}"}


def _replicate_image_input(client, image_path: str) -> str:
    """Ưu tiên URL công khai của server; nếu không có thì upload qua Files API của Replicate."""
    public = http_utils.public_media_url(image_path)
    if public:
        return public
    with open(image_path, "rb") as f:
        res = client.post(f"{REPLICATE_BASE_URL}/files", headers=_replicate_headers(),
                          files={"content": ("start.jpg", f, "image/jpeg")})
    if res.status_code < 300:
        url = (res.json().get("urls") or {}).get("get")
        if url:
            return url
    log.warning("Upload ảnh lên Replicate lỗi (HTTP %s), gửi dạng data URI", res.status_code)
    return http_utils.image_data_uri(image_path, max_side=1536)


def _replicate_motion(image_path: str, duration_sec: int, template: str, output_name: str) -> str:
    owner_name = config.replicate_video_model()
    with http_utils.http_client() as client:
        payload = {"input": {
            "prompt": TEMPLATES[template]["prompt"],
            "negative_prompt": NEGATIVE_PROMPT,
            "start_image": _replicate_image_input(client, image_path),
            "duration": duration_sec,
            "mode": config.kling_mode(),
        }}
        res = client.post(f"{REPLICATE_BASE_URL}/models/{owner_name}/predictions",
                          headers=_replicate_headers(), json=payload)
        if res.status_code == 401:
            raise ProviderError("REPLICATE_API_TOKEN không hợp lệ")
        if res.status_code == 402:
            raise ProviderError("Tài khoản Replicate hết tiền, cần nạp thêm")
        if res.status_code == 429:
            raise ProviderError("Replicate đang giới hạn tần suất, thử lại sau")
        if res.status_code >= 400:
            raise ProviderError(f"Replicate từ chối yêu cầu (HTTP {res.status_code}): {res.text[:200]}")
        prediction = res.json()
        get_url = (prediction.get("urls") or {}).get("get") or f"{REPLICATE_BASE_URL}/predictions/{prediction['id']}"

        def fetch():
            r = client.get(get_url, headers=_replicate_headers())
            if r.status_code >= 400:
                raise ProviderError(f"Không đọc được trạng thái Replicate (HTTP {r.status_code})")
            return r.json()

        state = http_utils.poll(fetch, lambda s: s.get("status") in ("succeeded", "failed", "canceled", "aborted"),
                                timeout_sec=config.ai_timeout_sec(), interval=5.0)

    if state.get("status") != "succeeded":
        raise ProviderError(f"Tạo video thất bại: {state.get('error') or state.get('status')}")
    output = state.get("output")
    url = output[0] if isinstance(output, list) and output else output
    if not isinstance(url, str):
        raise ProviderError("Model video không trả về file")
    raw_path = http_utils.download_to_media(url, "raw_" + output_name)
    # Đưa về đúng khung 9:16, 30fps để ghép tiếng ở bước sau
    out = media_path(output_name)
    run_ffmpeg(["-i", raw_path, "-an",
                "-vf", f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,"
                       f"pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x12141D,fps={FPS},format=yuv420p",
                "-c:v", "libx264", "-preset", "veryfast", out])
    return out


def generate_motion(image_path: Optional[str], duration_sec: float = 5, template: str = DEFAULT_TEMPLATE,
                    output_name: str = "catwalk_motion.mp4", fill_duration_sec: Optional[float] = None) -> dict:
    """
    Task 3: Sinh video dọc 9:16 (720x1280) từ ảnh thử đồ theo mẫu chuyển động đã chọn.
    `image_path` phải là đường dẫn đã kiểm tra trong thư mục media, hoặc None để tạo nền trống.

    `duration_sec` là độ dài đoạn AI (3-15 giây, tính phí theo giây). Engine FFmpeg miễn phí thì tạo
    luôn đủ `fill_duration_sec` (thường bằng độ dài lời thoại) để video không phải nối lặp.
    """
    if template not in TEMPLATES:
        raise ValueError(f"Mẫu video không hợp lệ: {template}")
    engine = engine_name()
    if engine.startswith("replicate:") and image_path:
        clip_sec = max(3, min(int(round(duration_sec)), 15))
        output_path = _replicate_motion(image_path, clip_sec, template, output_name)
    else:
        engine = "placeholder-ffmpeg-camera"
        output_path = media_path(output_name)
        clip_sec = max(1.0, min(max(float(duration_sec), fill_duration_sec or 0), MAX_PLACEHOLDER_SEC))
        _ffmpeg_motion(image_path, clip_sec, template, output_path)

    return {
        "status": "success",
        "engine": engine,
        "video_path": output_path,
        "video_url": media_url(output_path),
        "duration_sec": round(probe_duration(output_path), 2) or clip_sec,
        "resolution": f"{WIDTH}x{HEIGHT}",
        "fps": FPS,
        "template": template,
        "motion_style": TEMPLATES[template]["label"],
    }
