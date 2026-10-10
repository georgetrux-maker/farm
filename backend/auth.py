"""Xác thực bằng header `Authorization: Bearer <token>`.

Token là phiên đăng nhập (POST /api/auth/login) hoặc API token cố định tạo bằng
`python -m backend.manage create-user`. Khi phát triển có thể đặt ALLOW_DEMO_USER=1
để request không kèm token được coi là user demo.
"""
import hmac

from fastapi import Depends, Header, HTTPException

from backend import config
from backend.database import DEMO_USER_ID, get_user, get_user_by_token


def bearer_token(authorization: str = Header(default="")) -> str:
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" else ""


LOCKED_MESSAGE = "Tài khoản đã bị khóa, vui lòng liên hệ bộ phận hỗ trợ"


def get_current_user(token: str = Depends(bearer_token)) -> dict:
    if token:
        user = get_user_by_token(token)
        if user and user.get("disabled"):
            raise HTTPException(status_code=403, detail=LOCKED_MESSAGE)
        if user:
            return user
        raise HTTPException(status_code=401, detail="Token không hợp lệ")
    if config.allow_demo_user():
        user = get_user(DEMO_USER_ID)
        if user:
            return user
    raise HTTPException(status_code=401, detail="Vui lòng đăng nhập (thiếu token)")


def require_admin_role(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Chỉ quản trị viên mới được thực hiện thao tác này")
    return user


def require_admin_token(x_admin_token: str = Header(default="")) -> None:
    """Dành cho thao tác vận hành nhạy cảm (xác nhận tiền đã về tài khoản)."""
    expected = config.admin_token()
    if not expected or not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=403, detail="Sai hoặc thiếu X-Admin-Token")
