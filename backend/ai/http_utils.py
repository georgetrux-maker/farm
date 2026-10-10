"""Helper HTTP dùng chung cho các nhà cung cấp AI (FASHN, Replicate)."""
import base64
import io
import os
import time
from typing import Callable, Optional

import httpx
from PIL import Image

from backend import config
from backend.media_paths import media_path


class ProviderError(RuntimeError):
    """Lỗi từ dịch vụ AI bên ngoài; thông điệp đã được viết để hiển thị cho người dùng."""


def http_client() -> httpx.Client:
    # Tách thành hàm để test thay bằng httpx.MockTransport
    return httpx.Client(timeout=httpx.Timeout(60.0, connect=15.0), follow_redirects=True)


def image_data_uri(path: str, max_side: int = 2048) -> str:
    """Ảnh -> data URI JPEG/PNG, thu nhỏ nếu quá lớn để request không nặng."""
    with Image.open(path) as img:
        img.load()
        has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
        if max(img.size) > max_side:
            img.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        if has_alpha:
            img.convert("RGBA").save(buf, "PNG")
            mime = "image/png"
        else:
            img.convert("RGB").save(buf, "JPEG", quality=92)
            mime = "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(buf.getvalue()).decode()}"


def public_media_url(path: str) -> Optional[str]:
    """URL công khai của file media nếu server được cấu hình PUBLIC_BASE_URL."""
    base = config.public_base_url()
    if not base:
        return None
    rel = os.path.relpath(os.path.realpath(path), os.path.realpath(config.media_dir())).replace(os.sep, "/")
    return f"{base.rstrip('/')}/media/{rel}"



def download_to_media(url: str, output_name: str, max_bytes: int = 300 * 1024 * 1024) -> str:
    """Tải kết quả từ nhà cung cấp về thư mục media (giới hạn dung lượng)."""
    if not url.startswith("https://"):
        raise ProviderError("Nhà cung cấp trả về đường dẫn kết quả không hợp lệ")
    path = media_path(output_name)
    total = 0
    with http_client() as client, client.stream("GET", url) as res:
        if res.status_code != 200:
            raise ProviderError(f"Không tải được kết quả (HTTP {res.status_code})")
        with open(path, "wb") as f:
            for chunk in res.iter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    f.close()
                    os.remove(path)
                    raise ProviderError("File kết quả quá lớn")
                f.write(chunk)
    return path


def poll(fetch: Callable[[], dict], is_done: Callable[[dict], bool], timeout_sec: int, interval: float = 3.0) -> dict:
    """Gọi `fetch` định kỳ cho tới khi `is_done` hoặc hết thời gian."""
    deadline = time.monotonic() + timeout_sec
    while True:
        state = fetch()
        if is_done(state):
            return state
        if time.monotonic() > deadline:
            raise ProviderError(f"Dịch vụ AI không trả kết quả sau {timeout_sec} giây")
        time.sleep(interval)
