import threading
import time
from collections import deque

# Bộ đếm cửa sổ trượt trong RAM (đủ cho 1 tiến trình; nhiều tiến trình cần Redis)
_REQUEST_HISTORY = {}
_LOCK = threading.Lock()
_LAST_SWEEP = [0.0]


def check_rate_limit(client_key: str, max_requests: int = 120, window_sec: int = 60) -> dict:
    """
    Task 24: Giới hạn số lượt gọi API trên mỗi IP/User để chống spam và bảo vệ GPU.
    """
    now = time.time()
    with _LOCK:
        history = _REQUEST_HISTORY.setdefault(client_key, deque())
        while history and now - history[0] >= window_sec:
            history.popleft()

        if len(history) >= max_requests:
            retry_after = max(1, int(window_sec - (now - history[0])) + 1)
            return {
                "allowed": False,
                "retry_after": retry_after,
                "error": f"Bạn gửi quá nhiều yêu cầu. Vui lòng thử lại sau {retry_after} giây.",
            }

        history.append(now)
        remaining = max_requests - len(history)

        # Dọn các IP không còn hoạt động để bộ nhớ không phình mãi
        if now - _LAST_SWEEP[0] > window_sec:
            for key in [k for k, h in _REQUEST_HISTORY.items() if not h or now - h[-1] >= window_sec]:
                del _REQUEST_HISTORY[key]
            _LAST_SWEEP[0] = now

    return {"allowed": True, "remaining": remaining}


def reset_rate_limits():
    with _LOCK:
        _REQUEST_HISTORY.clear()
