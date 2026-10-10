import asyncio
import logging
import os
import shutil
import subprocess

from backend.ffmpeg_utils import probe_duration, run_ffmpeg
from backend.media_paths import media_path, media_url

log = logging.getLogger(__name__)

VOICES = {
    "vi-VN-HoaiMyNeural": "Hoài My (nữ)",
    "vi-VN-NamMinhNeural": "Nam Minh (nam)",
}
DEFAULT_VOICE = "vi-VN-HoaiMyNeural"
# Tên cũ mà frontend/DB từng dùng
_VOICE_ALIASES = {"mai_anh": DEFAULT_VOICE, "hoai_my": DEFAULT_VOICE, "nam_minh": "vi-VN-NamMinhNeural"}
_TICKS_PER_SEC = 10_000_000  # edge-tts trả offset theo đơn vị 100 nano giây


def resolve_voice(voice: str) -> str:
    voice = _VOICE_ALIASES.get(voice, voice)
    return voice if voice in VOICES else DEFAULT_VOICE


def _fmt_ts(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def build_vtt(cues: list) -> str:
    """cues: [(start_sec, end_sec, text)] -> nội dung WebVTT hợp lệ."""
    lines = ["WEBVTT", ""]
    for i, (start, end, text) in enumerate(cues, 1):
        lines += [str(i), f"{_fmt_ts(start)} --> {_fmt_ts(max(end, start + 0.05))}", text, ""]
    return "\n".join(lines)


_PHRASE_END = (".", ",", "!", "?", ";", ":", "…")


def group_phrases(cues: list, max_words: int = 6, max_sec: float = 2.8) -> list:
    """Gom phụ đề theo từng từ thành cụm ngắn dễ đọc trên video (kiểu TikTok).

    Ngắt cụm ở dấu câu, hoặc khi đủ `max_words` từ / dài quá `max_sec` giây.
    Trả về [(bắt đầu, kết thúc, chữ)], các cụm nối liền nhau để chữ không nhấp nháy.
    """
    phrases, words, start = [], [], None
    for i, (w_start, w_end, word) in enumerate(cues):
        if start is None:
            start = w_start
        words.append(word)
        last = i == len(cues) - 1
        if last or word.endswith(_PHRASE_END) or len(words) >= max_words or w_end - start >= max_sec:
            phrases.append([start, w_end, " ".join(words)])
            words, start = [], None
    # Kéo dài cụm tới lúc cụm sau bắt đầu (nếu khoảng nghỉ ngắn) để phụ đề không chớp tắt
    for cur, nxt in zip(phrases, phrases[1:]):
        if 0 < nxt[0] - cur[1] < 0.6:
            cur[1] = nxt[0]
    return [tuple(p) for p in phrases]


def _attach_punctuation(cues: list, text: str) -> list:
    """edge-tts trả từng từ không kèm dấu câu; nếu số từ khớp với kịch bản thì lấy lại chữ có dấu câu."""
    tokens = text.split()
    if len(tokens) != len(cues):
        return cues
    return [(start, end, token) for (start, end, _), token in zip(cues, tokens)]


def _estimate_cues(text: str, total_sec: float) -> list:
    words = text.split()
    if not words:
        return []
    step = total_sec / len(words)
    return [(i * step, (i + 1) * step, w) for i, w in enumerate(words)]


def _edge_tts(text: str, voice: str, audio_path: str) -> list:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice, rate="+5%", boundary="WordBoundary")
    cues = []

    async def _run():
        with open(audio_path, "wb") as f:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    start = chunk["offset"] / _TICKS_PER_SEC
                    cues.append((start, start + chunk["duration"] / _TICKS_PER_SEC, chunk["text"]))

    asyncio.run(_run())
    if os.path.getsize(audio_path) == 0:
        raise RuntimeError("edge-tts không trả về âm thanh")
    return cues


def _local_tts(text: str, audio_path: str) -> str:
    """Giọng đọc offline: macOS `say` hoặc espeak-ng trên Linux. Trả về tên engine."""
    wav_tmp = audio_path + ".tmp.aiff"
    try:
        if shutil.which("say"):
            subprocess.run(["say", "-v", "Linh", "-o", wav_tmp, text], check=True, timeout=120)
            engine = "macos-say"
        elif shutil.which("espeak-ng"):
            wav_tmp = audio_path + ".tmp.wav"
            subprocess.run(["espeak-ng", "-v", "vi", "-w", wav_tmp, text], check=True, timeout=120)
            engine = "espeak-ng"
        else:
            raise RuntimeError("Không có engine đọc offline")
        run_ffmpeg(["-i", wav_tmp, "-b:a", "192k", audio_path])
        return engine
    finally:
        if os.path.exists(wav_tmp):
            os.remove(wav_tmp)


def _silent_audio(text: str, audio_path: str) -> None:
    seconds = max(3.0, len(text.split()) * 0.35)
    run_ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", f"{seconds:.2f}", "-b:a", "128k", audio_path])


def generate_speech(text: str, voice_key: str = DEFAULT_VOICE, output_name: str = "review_voice.mp3") -> dict:
    """
    Task 5: Lồng tiếng tiếng Việt và tạo phụ đề đồng bộ (WebVTT + danh sách cụm để gắn vào video).
    Thứ tự thử: edge-tts (cần internet) -> giọng offline -> âm thanh im lặng kèm phụ đề,
    để pipeline không bao giờ chết chỉ vì TTS. Kết quả cho biết engine nào đã được dùng.
    """
    text = (text or "").strip()
    if not text:
        raise ValueError("Nội dung lồng tiếng trống")
    voice = resolve_voice(voice_key)
    audio_path = media_path(output_name)
    vtt_path = os.path.splitext(audio_path)[0] + ".vtt"
    warning = None

    try:
        cues = _edge_tts(text, voice, audio_path)
        engine = "edge-tts"
    except Exception as e:  # mạng bị chặn, dịch vụ đổi API...
        log.warning("edge-tts lỗi, chuyển sang phương án dự phòng: %s", e)
        cues = None
        try:
            engine = _local_tts(text, audio_path)
            warning = "Không kết nối được edge-tts, đã dùng giọng đọc offline"
        except Exception as e2:
            log.warning("TTS offline lỗi: %s", e2)
            _silent_audio(text, audio_path)
            engine = "silent"
            warning = "Không có dịch vụ lồng tiếng khả dụng, video chỉ có phụ đề"

    duration = probe_duration(audio_path) or len(text.split()) * 0.35
    cues = _attach_punctuation(cues, text) if cues else _estimate_cues(text, duration)
    phrases = group_phrases(cues)
    with open(vtt_path, "w", encoding="utf-8") as f:
        f.write(build_vtt(phrases))

    return {
        "status": "success",
        "engine": engine,
        "warning": warning,
        "audio_path": audio_path,
        "audio_url": media_url(audio_path),
        "vtt_path": vtt_path,
        "vtt_url": media_url(vtt_path),
        "voice_used": VOICES[voice] if engine == "edge-tts" else engine,
        "file_size_bytes": os.path.getsize(audio_path),
        "text_length": len(text),
        "duration_sec": round(duration, 3),
        # Cụm phụ đề [(bắt đầu, kết thúc, chữ)] để gắn thẳng vào video
        "phrases": phrases,
    }
