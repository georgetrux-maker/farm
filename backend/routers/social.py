"""Kết nối và đăng video lên TikTok / Trang Facebook"""

import hmac
import secrets
import urllib.parse
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from backend import config
from backend.ai.http_utils import ProviderError
from backend.auth import get_current_user
from backend.crypto_utils import SecretKeyMissing, unsign
from backend.services import social
from backend.services.queue_manager import get_job_status
from backend.services.task_queue import QueueUnavailable, enqueue_publication

router = APIRouter()


def _social_platform(platform: str) -> str:
    if platform not in social.PLATFORMS:
        raise HTTPException(status_code=404, detail="Nền tảng không hỗ trợ")
    return platform


@router.get("/api/social/status")
def api_social_status(user: dict = Depends(get_current_user)):
    return {
        "platforms": {p: social.platform_configured(p) for p in social.PLATFORMS},
        "accounts": social.list_accounts(user["id"]),
    }


def _oauth_cookie(platform: str) -> str:
    return f"aura_oauth_{platform}"


@router.get("/api/social/{platform}/connect")
def api_social_connect(platform: str, user: dict = Depends(get_current_user)):
    """Trả link đăng nhập TikTok/Facebook để frontend chuyển hướng tới"""
    nonce = secrets.token_urlsafe(16)
    try:
        url = social.authorize_url(_social_platform(platform), user["id"], nonce)
    except (social.SocialError, SecretKeyMissing) as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Gắn phiên kết nối với trình duyệt đã bấm nút: chặn việc gửi link cấp quyền cho người khác bấm
    response = JSONResponse({"auth_url": url})
    response.set_cookie(_oauth_cookie(platform), nonce, max_age=600, httponly=True, samesite="lax",
                        secure=config.public_base_url().startswith("https://"), path="/api/social")
    return response


@router.get("/api/social/{platform}/callback", include_in_schema=False)
def api_social_callback(request: Request, platform: str, state: str = "", code: str = "", error: str = ""):
    """TikTok/Facebook chuyển người dùng về đây sau khi đồng ý cấp quyền"""
    _social_platform(platform)

    def back(result: str, message: str = ""):
        query = urllib.parse.urlencode({"social": platform, "result": result, "message": message[:300]})
        return RedirectResponse(f"{config.frontend_url()}/?{query}")

    try:
        data = unsign(state)
    except SecretKeyMissing as e:
        return back("error", str(e))
    if not data or data.get("p") != platform:
        return back("error", "Phiên kết nối không hợp lệ hoặc đã hết hạn, vui lòng thử lại")
    cookie = request.cookies.get(_oauth_cookie(platform), "")
    if not cookie or not hmac.compare_digest(cookie, str(data.get("n", ""))):
        return back("error", "Vui lòng bấm Kết nối ngay trên trình duyệt đang đăng nhập AURA")
    if error or not code:
        return back("cancelled", "Bạn đã hủy cấp quyền")
    try:
        accounts = social.complete_oauth(platform, data["uid"], code)
    except (social.SocialError, SecretKeyMissing) as e:
        return back("error", str(e))
    return back("connected", ", ".join(a["display_name"] for a in accounts))


@router.delete("/api/social/accounts/{account_id}")
def api_social_disconnect(account_id: str, user: dict = Depends(get_current_user)):
    if not social.delete_account(account_id, user["id"]):
        raise HTTPException(status_code=404, detail="Tài khoản không tồn tại")
    return {"status": "deleted"}


def _owned_account(account_id: str, user: dict) -> dict:
    account = social.get_account(account_id, user["id"])
    if account is None:
        raise HTTPException(status_code=404, detail="Tài khoản mạng xã hội không tồn tại")
    return account


@router.get("/api/social/accounts/{account_id}/creator-info")
def api_tiktok_creator_info(account_id: str, user: dict = Depends(get_current_user)):
    """TikTok yêu cầu hiển thị các lựa chọn quyền riêng tư của nhà sáng tạo trước khi đăng"""
    account = _owned_account(account_id, user)
    if account["platform"] != "tiktok":
        return {}
    try:
        return social.tiktok_creator_info(account)
    except (social.SocialError, ProviderError, SecretKeyMissing) as e:
        raise HTTPException(status_code=502, detail=str(e))


class PublishRequest(BaseModel):
    job_id: str
    account_id: str
    caption: str = Field(min_length=1, max_length=2200)
    privacy_level: Optional[str] = Field(default=None, max_length=50, description="Bắt buộc với TikTok")
    allow_comment: bool = True
    allow_duet: bool = True
    allow_stitch: bool = True


@router.post("/api/social/publish")
def api_social_publish(req: PublishRequest, user: dict = Depends(get_current_user)):
    account = _owned_account(req.account_id, user)
    job = get_job_status(req.job_id, user_id=user["id"])
    if job is None:
        raise HTTPException(status_code=404, detail="Job không tồn tại")
    if job["status"] != "completed" or not job["output_video_url"]:
        raise HTTPException(status_code=409, detail="Video chưa tạo xong")
    if account["platform"] == "tiktok" and not req.privacy_level:
        raise HTTPException(status_code=400, detail="Vui lòng chọn chế độ hiển thị cho video TikTok")
    pub_id = social.create_publication(user["id"], job, account, req.caption)
    options = {"privacy_level": req.privacy_level, "allow_comment": req.allow_comment,
               "allow_duet": req.allow_duet, "allow_stitch": req.allow_stitch}
    try:
        enqueue_publication(pub_id, user["id"], account["id"], job["output_video_url"], req.caption, options)
    except QueueUnavailable as e:
        social.mark_publication_failed(pub_id, str(e))
        raise HTTPException(status_code=503, detail=str(e))
    return {"status": "pending", "publication_id": pub_id}


@router.get("/api/social/publications")
def api_social_publications(job_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    return social.list_publications(user["id"], job_id)
