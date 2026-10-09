"""Chuyển đổi an toàn giữa đường dẫn file trên đĩa và URL /media/...

Mọi file mà client tham chiếu tới đều phải nằm trong thư mục media, để client
không thể bắt server đọc file tùy ý (ví dụ /etc/passwd) hoặc URL bên ngoài.
"""
import os

from backend import config


class MediaPathError(ValueError):
    pass


def media_path(name: str) -> str:
    """Đường dẫn tuyệt đối cho một file output mới trong thư mục media."""
    return os.path.join(config.media_dir(), name)


def media_url(path: str) -> str:
    rel = os.path.relpath(os.path.abspath(path), config.media_dir())
    return "/media/" + rel.replace(os.sep, "/")


def resolve_media_ref(ref: str) -> str:
    """Nhận "/media/x.png" hoặc "x.png", trả về đường dẫn tuyệt đối đã kiểm tra.

    Raise MediaPathError nếu tham chiếu thoát ra ngoài thư mục media hoặc file không tồn tại.
    """
    if not ref or "\x00" in ref:
        raise MediaPathError("Tham chiếu file trống hoặc không hợp lệ")
    if "://" in ref:
        raise MediaPathError("Chỉ chấp nhận file đã upload lên hệ thống (/media/...)")
    rel = ref[len("/media/"):] if ref.startswith("/media/") else ref
    root = config.media_dir()
    path = os.path.realpath(os.path.join(root, rel))
    if os.path.commonpath([path, os.path.realpath(root)]) != os.path.realpath(root):
        raise MediaPathError("Đường dẫn nằm ngoài thư mục media")
    if not os.path.isfile(path):
        raise MediaPathError(f"Không tìm thấy file: {ref}")
    return path


def try_resolve_media_ref(ref: str):
    try:
        return resolve_media_ref(ref)
    except MediaPathError:
        return None
