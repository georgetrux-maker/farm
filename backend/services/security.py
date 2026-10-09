import time

# Simple in-memory sliding window rate limiter
_REQUEST_HISTORY = {}

def check_rate_limit(client_ip: str, max_requests: int = 60, window_sec: int = 60) -> dict:
    """
    Task 24: Bảo Mật, Chống Spam & Giới Hạn Tần Suất (Rate Limiter Engine)
    Giới hạn số lượt gọi API trên mỗi IP/User để chống bot spam cào dữ liệu và bảo vệ GPU.
    """
    now = time.time()
    if client_ip not in _REQUEST_HISTORY:
        _REQUEST_HISTORY[client_ip] = []

    # Filter out old requests
    _REQUEST_HISTORY[client_ip] = [t for t in _REQUEST_HISTORY[client_ip] if now - t < window_sec]

    if len(_REQUEST_HISTORY[client_ip]) >= max_requests:
        return {
            "allowed": False,
            "error": "Quá giới hạn tần suất yêu cầu (Rate limit exceeded). Vui lòng thử lại sau 60 giây."
        }

    _REQUEST_HISTORY[client_ip].append(now)
    return {
        "allowed": True,
        "remaining": max_requests - len(_REQUEST_HISTORY[client_ip])
    }
