"""Tải trang web/ảnh từ link do người dùng nhập mà không để máy chủ bị lợi dụng (SSRF).

- Chỉ http/https, cổng 80/443.
- Phân giải tên miền rồi từ chối mọi địa chỉ không công khai (127.0.0.1, 10.x, 192.168.x, 169.254.x
  của máy chủ cloud, IPv6 nội bộ...). Kết nối thẳng tới đúng IP đã kiểm tra (SNI/Host giữ tên miền)
  để kẻ xấu không đổi DNS sang IP nội bộ giữa lúc kiểm tra và lúc tải.
- Tự đi theo chuyển hướng (tối đa 3 lần), kiểm tra lại từng bước.
- Giới hạn dung lượng và tổng thời gian tải.
"""
import ipaddress
import socket
import time
import urllib.parse
from dataclasses import dataclass

import httpx

ALLOWED_PORTS = {80, 443}
MAX_REDIRECTS = 3
BROWSER_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
              "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")


class UnsafeURL(ValueError):
    """Link không được phép tải (sai giao thức, địa chỉ nội bộ...)."""


class FetchError(RuntimeError):
    """Tải không được (trang chặn, lỗi mạng, quá lớn...). Thông điệp hiển thị được cho người dùng."""


@dataclass
class FetchResult:
    url: str
    status_code: int
    content_type: str
    content: bytes

    @property
    def text(self) -> str:
        charset = "utf-8"
        for part in self.content_type.split(";")[1:]:
            k, _, v = part.strip().partition("=")
            if k.lower() == "charset" and v:
                charset = v.strip('"')
        try:
            return self.content.decode(charset, errors="replace")
        except LookupError:
            return self.content.decode("utf-8", errors="replace")


def _check_ip(raw: str) -> str:
    ip = ipaddress.ip_address(raw.split("%", 1)[0])
    if ip.version == 6 and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    if not ip.is_global or ip.is_multicast:
        raise UnsafeURL("Link trỏ tới địa chỉ nội bộ, không được phép")
    return str(ip)


def resolve_public(host: str, port: int) -> str:
    """Trả về một IP công khai của host; từ chối nếu host có bất kỳ IP nội bộ nào."""
    try:
        ipaddress.ip_address(host)
        return _check_ip(host)
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError):
        raise FetchError("Không tìm thấy tên miền trong link")
    ips = [_check_ip(info[4][0]) for info in infos]
    if not ips:
        raise FetchError("Không tìm thấy tên miền trong link")
    return ips[0]


def parse_public_url(url: str) -> urllib.parse.SplitResult:
    parts = urllib.parse.urlsplit(url.strip())
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise UnsafeURL("Link phải bắt đầu bằng http:// hoặc https://")
    if parts.username or parts.password:
        raise UnsafeURL("Link không được chứa tên đăng nhập/mật khẩu")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    if port not in ALLOWED_PORTS:
        raise UnsafeURL("Link dùng cổng không được phép")
    return parts


def _pinned_request(parts: urllib.parse.SplitResult, ip: str):
    host = parts.hostname
    ip_host = f"[{ip}]" if ":" in ip else ip
    netloc = ip_host + (f":{parts.port}" if parts.port else "")
    target = urllib.parse.urlunsplit((parts.scheme, netloc, parts.path or "/", parts.query, ""))
    host_header = host + (f":{parts.port}" if parts.port else "")
    return target, host_header, host


def fetch(url: str, *, max_bytes: int, timeout: float = 15.0, accept: str = "*/*",
          verify=True) -> FetchResult:
    deadline = time.monotonic() + timeout
    current = url
    with httpx.Client(timeout=httpx.Timeout(min(timeout, 10.0), connect=5.0), follow_redirects=False,
                      trust_env=False, verify=verify) as client:
        for _ in range(MAX_REDIRECTS + 1):
            parts = parse_public_url(current)
            ip = resolve_public(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80))
            target, host_header, sni = _pinned_request(parts, ip)
            headers = {"Host": host_header, "User-Agent": BROWSER_UA, "Accept": accept,
                       "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.6"}
            request = client.build_request("GET", target, headers=headers,
                                           extensions={"sni_hostname": sni} if parts.scheme == "https" else {})
            try:
                response = client.send(request, stream=True)
            except httpx.HTTPError as e:
                raise FetchError("Không mở được link (trang không phản hồi hoặc chặn truy cập)") from e
            try:
                if response.status_code in (301, 302, 303, 307, 308) and response.headers.get("location"):
                    current = urllib.parse.urljoin(current, response.headers["location"])
                    continue
                if response.status_code != 200:
                    raise FetchError(f"Trang trả về lỗi HTTP {response.status_code} (có thể trang chặn truy cập tự động)")
                declared = response.headers.get("content-length")
                if declared and declared.isdigit() and int(declared) > max_bytes:
                    raise FetchError("Nội dung quá lớn")
                chunks, size = [], 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > max_bytes:
                        raise FetchError("Nội dung quá lớn")
                    if time.monotonic() > deadline:
                        raise FetchError("Trang tải quá lâu")
                    chunks.append(chunk)
            except httpx.HTTPError as e:
                raise FetchError("Mất kết nối khi đang tải trang") from e
            finally:
                response.close()
            return FetchResult(current, response.status_code, response.headers.get("content-type", ""), b"".join(chunks))
    raise FetchError("Link chuyển hướng quá nhiều lần")
