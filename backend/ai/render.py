import logging
import math
import os
from typing import Optional

from backend.ffmpeg_utils import ffmpeg_has_filter, probe_duration, run_ffmpeg
from backend.media_paths import media_path, media_url

log = logging.getLogger(__name__)

# Khung chuẩn cho TikTok / Reels / Shorts
WIDTH, HEIGHT = 720, 1280
FPS = 30
TAIL_SEC = 0.4          # giữ hình thêm một chút sau câu thoại cuối
MAX_LOOPS = 12          # số lần nối đoạn chuyển động tối đa (phần còn thiếu giữ khung cuối)

# Font đóng gói sẵn (giấy phép SIL OFL, có đủ dấu tiếng Việt); thiếu file thì dùng DejaVu Sans của hệ thống
FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts")
SUBTITLE_FONT = "Be Vietnam Pro ExtraBold"
TITLE_FONT = "Playfair Display"
FALLBACK_FONT = "DejaVu Sans"
TAG_START, TAG_END = 0.3, 4.3  # thẻ tên + giá hiện ở đầu video
CROSSFADE_SEC = 0.4            # nối các đoạn chuyển động: đủ để không giật, ngắn để không thấy hình chồng


def _ass_time(seconds: float) -> str:
    cs = int(round(max(0.0, seconds) * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _ass_text(text: str) -> str:
    # Ngoặc nhọn và gạch chéo ngược là ký tự điều khiển trong ASS
    return " ".join(text.replace("\\", "/").replace("{", "(").replace("}", ")").split())


def _bundled_fonts() -> bool:
    return all(os.path.exists(os.path.join(FONTS_DIR, f))
               for f in ("BeVietnamPro-ExtraBold.ttf", "PlayfairDisplay-Bold.ttf"))


def _fonts_dir_for_filter() -> Optional[str]:
    """Đường dẫn thư mục font dùng được trong bộ lọc ffmpeg (bỏ qua nếu có ký tự đặc biệt của bộ lọc)."""
    if not _bundled_fonts() or any(c in FONTS_DIR for c in ":\\',;[]= "):
        return None
    return FONTS_DIR


def _fit_one_line(text: str, font_file: str, size: int, max_width: float, min_size: int):
    """Thu nhỏ cỡ chữ (tối đa tới min_size) để `text` nằm trên một dòng, vẫn dài thì cắt bớt và thêm "…".

    libass quy đổi cỡ chữ theo khoảng ascender..descender của font, nên đo bằng Pillow rồi nhân tỉ lệ đó.
    """
    try:
        from PIL import ImageFont
        probe = ImageFont.truetype(font_file, 200)
        ascent, descent = probe.getmetrics()
    except (OSError, ImportError):
        return text, size

    def width(t: str, s: int) -> float:
        return probe.getlength(t) / (ascent + descent) * s

    while size > min_size and width(text, size) > max_width:
        size -= 1
    while len(text) > 4 and width(text, size) > max_width:
        text = text[:-2].rstrip() + "…"
    return text, size


def build_ass(phrases: list, width: int = WIDTH, height: int = HEIGHT,
              title: Optional[str] = None, price: Optional[str] = None) -> str:
    """Phụ đề kiểu TikTok (chữ trắng đậm viền tối, nằm cao hơn vùng nút bấm của ứng dụng)
    và thẻ tên sản phẩm + giá ở đầu video, phong cách nhãn mác thời trang."""
    bundled = _bundled_fonts()
    sub_font = SUBTITLE_FONT if bundled else FALLBACK_FONT
    title_font = TITLE_FONT if bundled else FALLBACK_FONT
    sub_bold = 0 if bundled else -1  # file font đã là nét đậm
    font_size = round(height * 0.042)
    margin_v = round(height * 0.23)
    margin_h = round(width * 0.08)
    tag_size = round(height * 0.04)
    price_size = round(height * 0.034)
    tag_pad = round(height * 0.012)
    tag_left = round(width * 0.06)
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
        # Màu ASS dạng &HAABBGGRR: chữ trắng, viền nâu mực, bóng mờ
        f"Style: Default,{sub_font},{font_size},&H00FFFFFF,&H00FFFFFF,&H0016191E,&H80000000,{sub_bold},0,0,0,"
        f"100,100,0,0,1,4,2,2,{margin_h},{margin_h},{margin_v},1",
        # Thẻ tên: chữ serif trắng trên nền mực; thẻ giá: chữ mực trên nền hồng phấn
        # Thẻ nằm góc trên bên trái để không che mặt người mẫu (thường ở giữa khung)
        f"Style: Title,{title_font},{tag_size},&H00FFFFFF,&H00FFFFFF,&H0016191E,&H00000000,-1,0,0,0,"
        f"100,100,1,0,3,{tag_pad},0,7,{tag_left},{margin_h},{round(height * 0.075)},1",
        f"Style: Price,{sub_font},{price_size},&H0016191E,&H0016191E,&H00C8B6F3,&H00000000,{sub_bold},0,0,0,"
        f"100,100,0,0,3,{tag_pad},0,7,{tag_left},{margin_h},{round(height * 0.075)},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    # Thẻ tên nằm gọn một dòng, thẻ giá ngay bên dưới (mỗi thẻ là một khung màu riêng)
    top = round(height * 0.075)
    max_tag_width = width * 0.62 - 2 * tag_pad  # chừa phần giữa khung cho người mẫu
    start, end = _ass_time(TAG_START), _ass_time(TAG_END)
    name = _ass_text(title or "")
    if name:
        size = tag_size
        if bundled:
            name, size = _fit_one_line(name, os.path.join(FONTS_DIR, "PlayfairDisplay-Bold.ttf"), tag_size,
                                       max_tag_width, round(tag_size * 0.7))
        lines.append(f"Dialogue: 1,{start},{end},Title,,0,0,0,,{{\\fad(350,350)\\q2\\fs{size}}}{name}")
        top += size + 2 * tag_pad + round(height * 0.008)
    if price:
        lines.append(f"Dialogue: 1,{start},{end},Price,,0,0,{top},,{{\\fad(350,350)\\q2}}{_ass_text(price)}")
    for start, end, text in phrases:
        if end > start and text.strip():
            lines.append(f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Default,,0,0,0,,{_ass_text(text)}")
    return "\n".join(lines) + "\n"


def _video_graph(n_inputs: int, clip_sec: float, total_sec: float, subtitle_file: Optional[str]) -> str:
    """Nối `n_inputs` bản của cùng một đoạn chuyển động bằng hiệu ứng mờ chéo (không nhảy cảnh),
    đưa về khung 720x1280, gắn phụ đề và cắt đúng độ dài lời thoại."""
    norm = (f"scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=decrease,"
            f"pad={WIDTH}:{HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x16120F,setsar=1,fps={FPS},format=yuv420p,settb=AVTB")
    parts = [f"[{i}:v]{norm}[c{i}]" for i in range(n_inputs)]
    fade = min(CROSSFADE_SEC, clip_sec / 4)
    prev = "c0"
    for i in range(1, n_inputs):
        parts.append(f"[{prev}][c{i}]xfade=transition=fade:duration={fade:.3f}:offset={i * (clip_sec - fade):.3f}[x{i}]")
        prev = f"x{i}"
    covered = clip_sec + (n_inputs - 1) * (clip_sec - fade)
    tail = [f"tpad=stop_mode=clone:stop_duration={max(0.0, total_sec - covered) + 0.5:.3f}"]
    if subtitle_file and not ffmpeg_has_filter("ass"):
        log.warning("FFmpeg thiếu libass: video sẽ không có phụ đề in sẵn")
    elif subtitle_file:
        fonts_dir = _fonts_dir_for_filter()
        tail.append(f"ass={subtitle_file}" + (f":fontsdir={fonts_dir}" if fonts_dir else ""))
    tail.append(f"trim=duration={total_sec:.3f},setpts=PTS-STARTPTS")
    parts.append(f"[{prev}]{','.join(tail)}[v]")
    return ";".join(parts)


def render_final_video(video_path: str, audio_path: str, output_name: str = "final_fashion_review.mp4",
                       subtitle_phrases: Optional[list] = None, title: Optional[str] = None,
                       price_text: Optional[str] = None) -> dict:
    """
    Task 6: Ghép video chuyển động + lồng tiếng + phụ đề thành MP4 720x1280 (H.264/AAC) cho TikTok/Reels.
    Độ dài video = độ dài lời thoại. Nếu đoạn chuyển động ngắn hơn, nó được nối tiếp bằng hiệu ứng mờ chéo
    thay vì lặp giật. `title`/`price_text` hiện thành thẻ tên + giá trong vài giây đầu.
    Cả hai đường dẫn phải nằm trong thư mục media.
    """
    output_path = media_path(output_name)
    audio_sec = probe_duration(audio_path)
    clip_sec = probe_duration(video_path)
    if audio_sec <= 0 or clip_sec <= 0:
        raise ValueError("Không đọc được độ dài video hoặc âm thanh")
    total_sec = max(3.0, audio_sec + TAIL_SEC)

    n_inputs = 1
    if clip_sec < total_sec - 0.05 and clip_sec >= 1.0:
        fade = min(CROSSFADE_SEC, clip_sec / 4)
        n_inputs = min(MAX_LOOPS, 1 + math.ceil((total_sec - clip_sec) / (clip_sec - fade)))

    media_dir = os.path.dirname(output_path)
    subtitle_file = None
    if subtitle_phrases or title or price_text:
        # File phụ đề nằm cạnh video, gọi bằng tên tương đối (ffmpeg chạy trong thư mục media)
        # để không phải xử lý ký tự đặc biệt của đường dẫn trong bộ lọc
        subtitle_file = os.path.splitext(os.path.basename(output_path))[0] + ".ass"
        with open(os.path.join(media_dir, subtitle_file), "w", encoding="utf-8") as f:
            f.write(build_ass(subtitle_phrases or [], title=title, price=price_text))

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
        "title_tag": bool(title or price_text),
    }
