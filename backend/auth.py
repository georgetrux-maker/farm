"""Xác thực bằng API token (header `Authorization: Bearer <token>`).

Đăng nhập bằng email/mật khẩu sẽ làm ở Đợt 3. Khi phát triển có thể đặt
ALLOW_DEMO_USER=1 để request không kèm token được coi là user demo.
"""
import hmac

from fastapi import Depends, Header, HTTPException

from backend import config
from backend.database import DEMO_USER_ID, get_user, get_user_by_token


def get_current_user(authorization: str = Header(default="")) -> dict:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token:
        user = get_user_by_token(token.strip())
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
