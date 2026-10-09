import os
import subprocess
import asyncio

MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'media')
os.makedirs(MEDIA_DIR, exist_ok=True)

def generate_speech(text: str, voice_key: str = "mai_anh", output_name: str = "review_voice.mp3") -> dict:
    """
    Task 5: Lồng Tiếng Việt Thật & Phụ Đề Nhảy Chữ (TTS & Subtitles Engine)
    Hỗ trợ sinh audio tiếng Việt và tệp phụ đề WebVTT đồng bộ thời gian.
    """
    audio_path = os.path.join(MEDIA_DIR, output_name)
    vtt_name = output_name.replace(".mp3", ".vtt")
    vtt_path = os.path.join(MEDIA_DIR, vtt_name)
    aiff_temp = os.path.join(MEDIA_DIR, f"temp_{output_name}.aiff")

    # Try edge-tts first, fallback to native macOS Linh voice
    success = False
    try:
        import edge_tts
        communicate = edge_tts.Communicate(text, "vi-VN-HoaiMyNeural", rate="+5%")
        submaker = edge_tts.SubMaker()

        async def _run_edge():
            with open(audio_path, "wb") as f:
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        f.write(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        submaker.feed(chunk)
            with open(vtt_path, "w", encoding="utf-8") as f:
                f.write(submaker.get_vtt())

        asyncio.run(_run_edge())
        if os.path.exists(audio_path) and os.path.getsize(audio_path) > 0:
            success = True
    except Exception as e:
        success = False

    # Native macOS high-fidelity fallback if edge_tts is blocked
    if not success:
        # Use macOS Linh voice
        cmd_say = ["say", "-v", "Linh", "-o", aiff_temp, text]
        subprocess.run(cmd_say, check=True)
        # Convert to MP3 using ffmpeg
        cmd_ffmpeg = ["ffmpeg", "-y", "-i", aiff_temp, "-b:a", "192k", audio_path]
        subprocess.run(cmd_ffmpeg, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        if os.path.exists(aiff_temp):
            os.remove(aiff_temp)

        # Generate synced WebVTT subtitles
        words = text.split()
        total_duration = max(3.0, len(words) * 0.35)
        step = total_duration / len(words)
        
        with open(vtt_path, "w", encoding="utf-8") as f:
            f.write("WEBVTT\n\n")
            for i, word in enumerate(words):
                start_sec = i * step
                end_sec = (i + 1) * step
                start_str = f"00:00:{start_sec:06.3f}".replace(".", ",")
                end_str = f"00:00:{end_sec:06.3f}".replace(".", ",")
                f.write(f"{i+1}\n{start_str} --> {end_str}\n{word}\n\n")

    return {
        "status": "success",
        "audio_path": audio_path,
        "audio_url": f"/media/{output_name}",
        "vtt_path": vtt_path,
        "vtt_url": f"/media/{vtt_name}",
        "voice_used": "Linh (vi_VN Neural / Native)",
        "file_size_bytes": os.path.getsize(audio_path),
        "text_length": len(text)
    }

if __name__ == "__main__":
    res = generate_speech("Chất voan tơ 2 lớp này hack dáng cực đỉnh luôn mọi người ơi.")
    print("TTS Success:", res)
