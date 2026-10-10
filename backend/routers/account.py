"""Tài khoản: đăng ký, đăng nhập, hồ sơ, thống kê"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from backend import config
from backend.auth import LOCKED_MESSAGE, bearer_token, get_current_user
from backend.crypto_utils import hash_password, verify_password
from backend.database import (
    create_session, delete_session, get_dashboard_summary, get_user_by_email, public_user, register_user,
)
from backend.services.security import check_rate_limit

router = APIRouter()


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


def _login_rate_limit(request: Request, email: str):
    ip = request.client.host if request.client else "unknown"
    # Chặn dò mật khẩu: tối đa 10 lần mỗi phút cho mỗi IP và mỗi email
    for key in (f"auth-ip:{ip}", f"auth-email:{email.lower()}"):
        res = check_rate_limit(key, max_requests=10)
        if not res["allowed"]:
            raise HTTPException(status_code=429, detail="Thử đăng nhập quá nhiều lần, vui lòng chờ một phút")


def _session_response(user: dict) -> dict:
    return {"token": create_session(user["id"], config.session_days()), "user": public_user(user)}


@router.post("/api/auth/register")
def api_register(req: RegisterRequest, request: Request):
    if not config.allow_signup():
        raise HTTPException(status_code=403, detail="Hiện chưa mở đăng ký tài khoản mới")
    _login_rate_limit(request, req.email)
    user = register_user(req.name.strip(), req.email.strip().lower(), hash_password(req.password),
                         credits=config.signup_bonus_credits())
    if user is None:
        raise HTTPException(status_code=409, detail="Email này đã được đăng ký")
    return _session_response(user)


@router.post("/api/auth/login")
def api_login(req: LoginRequest, request: Request):
    _login_rate_limit(request, req.email)
    user = get_user_by_email(req.email.strip())
    if not user or not user.get("password_hash") or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Sai email hoặc mật khẩu")
    if user.get("disabled"):
        raise HTTPException(status_code=403, detail=LOCKED_MESSAGE)
    return _session_response(user)


@router.post("/api/auth/logout")
def api_logout(token: str = Depends(bearer_token)):
    if token:
        delete_session(token)
    return {"status": "ok"}


@router.get("/api/user/profile")
def api_get_profile(user: dict = Depends(get_current_user)):
    """Task 7 & 19: Thông tin tài khoản & hồ sơ cơ thể của user đang đăng nhập"""
    return public_user(user)


@router.get("/api/dashboard/stats")
def api_dashboard_stats(user: dict = Depends(get_current_user)):
    """Thống kê của user đang đăng nhập"""
    return get_dashboard_summary(user["id"])


@router.get("/api/support/info")
def api_support_info():
    """Liên hệ hỗ trợ cho trang Hỗ trợ (quản trị viên đặt trong Cài đặt API → Khác)."""
    return {"hotline": config.support_hotline(), "zalo": config.support_zalo(), "email": config.support_email()}
