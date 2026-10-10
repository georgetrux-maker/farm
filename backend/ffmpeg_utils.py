import os
import shutil
import subprocess

from backend import config


class FFmpegError(RuntimeError):
    pass


def ffmpeg_available() -> bool:
    return shutil.which(config.ffmpeg_bin()) is not None or os.path.isfile(config.ffmpeg_bin())


def run_ffmpeg(args: list, cwd: str = None) -> None:
    """Chạy ffmpeg có timeout; khi lỗi trả về vài dòng stderr cuối để dễ debug."""
    cmd = [config.ffmpeg_bin(), "-y", "-hide_banner", "-loglevel", "error", *args]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=config.ffmpeg_timeout_sec(), cwd=cwd)
    except FileNotFoundError as e:
        raise FFmpegError("Chưa cài ffmpeg trên máy chủ") from e
    except subprocess.TimeoutExpired as e:
        raise FFmpegError(f"ffmpeg chạy quá {config.ffmpeg_timeout_sec()}s") from e
    if proc.returncode != 0:
        tail = "\n".join(proc.stderr.strip().splitlines()[-5:])
        raise FFmpegError(f"ffmpeg lỗi (mã {proc.returncode}): {tail}")


def probe_duration(path: str) -> float:
    ffmpeg = config.ffmpeg_bin()
    probe = None
    if os.path.isabs(ffmpeg):
        cand = os.path.join(os.path.dirname(ffmpeg), "ffprobe")
        if os.path.isfile(cand) and os.access(cand, os.X_OK):
            probe = cand
    if not probe:
        probe = shutil.which("ffprobe") or "ffprobe"
    try:
        out = subprocess.run(
            [probe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
            capture_output=True, text=True, timeout=30,
        )
        return float(out.stdout.strip())
    except (ValueError, OSError, subprocess.TimeoutExpired):
        return 0.0



def ffmpeg_has_filter(filter_name: str) -> bool:
    try:
        proc = subprocess.run([config.ffmpeg_bin(), "-filters"], capture_output=True, text=True, timeout=5)
        names = {line.split()[1] for line in proc.stdout.splitlines() if len(line.split()) >= 2}
        return filter_name in names
    except Exception:
        return False

