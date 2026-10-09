"""Kết nối TikTok / Trang Facebook (OAuth) và đăng video.

TikTok: Content Posting API, đăng trực tiếp bằng FILE_UPLOAD
  https://developers.tiktok.com/docs/en/content-posting-api-get-started
  Ứng dụng chưa qua kiểm duyệt của TikTok chỉ đăng được ở chế độ riêng tư (SELF_ONLY).
Facebook: Reels của Trang, 3 bước start -> upload -> finish
  https://developers.facebook.com/docs/video-api/guides/reels-publishing
"""
import logging
import os
import urllib.parse
import uuid

from backend import config
from backend.ai import http_utils
from backend.ai.http_utils import ProviderError
from backend.crypto_utils import decrypt, encrypt, sign
from backend.database import get_db
from backend.media_paths import resolve_media_ref

log = logging.getLogger(__name__)

TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/"
TIKTOK_API = "https://open.tiktokapis.com/v2"
TIKTOK_SCOPES = "user.info.basic,video.publish"
FACEBOOK_SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts"
PLATFORMS = ("tiktok", "facebook")


class SocialError(RuntimeError):
    pass


def platform_configured(platform: str) -> bool:
    if platform == "tiktok":
        return bool(config.tiktok_client_key() and config.tiktok_client_secret())
    if platform == "facebook":
        return bool(config.facebook_app_id() and config.facebook_app_secret())
    return False


def _graph() -> str:
    return f"https://graph.facebook.com/{config.facebook_graph_version()}"


# =============================================================================
# Tài khoản đã kết nối
# =============================================================================
def save_account(user_id: str, platform: str, external_id: str, display_name: str, access_token: str,
                 refresh_token: str = None, expires_in: int = None) -> dict:
    conn = get_db()
    row = conn.execute("SELECT id FROM social_accounts WHERE user_id = ? AND platform = ? AND external_id = ?",
                       (user_id, platform, external_id)).fetchone()
    account_id = row["id"] if row else f"acc_{uuid.uuid4().hex[:10]}"
    expires = f"+{int(expires_in)} seconds" if expires_in else None
    conn.execute('''
    INSERT INTO social_accounts (id, user_id, platform, external_id, display_name, access_token_enc,
                                 refresh_token_enc, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? IS NULL THEN NULL ELSE datetime('now', ?) END)
    ON CONFLICT(user_id, platform, external_id) DO UPDATE SET
        display_name = excluded.display_name, access_token_enc = excluded.access_token_enc,
        refresh_token_enc = excluded.refresh_token_enc, expires_at = excluded.expires_at
    ''', (account_id, user_id, platform, external_id, display_name, encrypt(access_token),
          encrypt(refresh_token or ""), expires, expires))
    conn.commit()
    conn.close()
    return {"id": account_id, "platform": platform, "display_name": display_name}


def list_accounts(user_id: str) -> list:
    conn = get_db()
    rows = conn.execute('''
    SELECT id, platform, external_id, display_name, expires_at, created_at FROM social_accounts
    WHERE user_id = ? ORDER BY platform, display_name
    ''', (user_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_account(account_id: str, user_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM social_accounts WHERE id = ? AND user_id = ?", (account_id, user_id)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_account(account_id: str, user_id: str) -> bool:
    conn = get_db()
    cur = conn.execute("DELETE FROM social_accounts WHERE id = ? AND user_id = ?", (account_id, user_id))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


# =============================================================================
# OAuth
# =============================================================================
def authorize_url(platform: str, user_id: str, nonce: str) -> str:
    if not platform_configured(platform):
        raise SocialError(f"Máy chủ chưa cấu hình ứng dụng {platform}")
    state = sign({"uid": user_id, "p": platform, "n": nonce})
    redirect_uri = config.oauth_redirect_uri(platform)
    if platform == "tiktok":
        query = {"client_key": config.tiktok_client_key(), "scope": TIKTOK_SCOPES, "response_type": "code",
                 "redirect_uri": redirect_uri, "state": state}
        return f"{TIKTOK_AUTH_URL}?{urllib.parse.urlencode(query)}"
    query = {"client_id": config.facebook_app_id(), "redirect_uri": redirect_uri, "state": state,
             "scope": FACEBOOK_SCOPES, "response_type": "code"}
    return f"https://www.facebook.com/{config.facebook_graph_version()}/dialog/oauth?{urllib.parse.urlencode(query)}"


def _check(res, what: str) -> dict:
    try:
        data = res.json()
    except ValueError:
        data = {}
    if res.status_code >= 400:
        err = data.get("error")
        message = (err.get("message") if isinstance(err, dict) else data.get("error_description") or err) or res.text[:200]
        raise SocialError(f"{what} thất bại: {message}")
    return data


def complete_oauth(platform: str, user_id: str, code: str) -> list:
    """Đổi `code` lấy token và lưu tài khoản. Trả về danh sách tài khoản vừa kết nối."""
    redirect_uri = config.oauth_redirect_uri(platform)
    with http_utils.http_client() as client:
        if platform == "tiktok":
            token = _check(client.post(f"{TIKTOK_API}/oauth/token/", data={
                "client_key": config.tiktok_client_key(), "client_secret": config.tiktok_client_secret(),
                "code": code, "grant_type": "authorization_code", "redirect_uri": redirect_uri,
            }), "Lấy token TikTok")
            if "access_token" not in token:
                raise SocialError(f"TikTok không trả token: {token.get('error_description') or token.get('error')}")
            info = _check(client.get(f"{TIKTOK_API}/user/info/", params={"fields": "open_id,display_name"},
                                     headers={"Authorization": f"Bearer {token['access_token']}"}),
                          "Đọc thông tin TikTok")
            user = (info.get("data") or {}).get("user") or {}
            return [save_account(user_id, "tiktok", token.get("open_id") or user.get("open_id"),
                                 user.get("display_name") or "TikTok", token["access_token"],
                                 token.get("refresh_token"), token.get("expires_in"))]

        short = _check(client.get(f"{_graph()}/oauth/access_token", params={
            "client_id": config.facebook_app_id(), "client_secret": config.facebook_app_secret(),
            "redirect_uri": redirect_uri, "code": code,
        }), "Lấy token Facebook")
        long_lived = _check(client.get(f"{_graph()}/oauth/access_token", params={
            "grant_type": "fb_exchange_token", "client_id": config.facebook_app_id(),
            "client_secret": config.facebook_app_secret(), "fb_exchange_token": short["access_token"],
        }), "Đổi token Facebook dài hạn")
        pages = _check(client.get(f"{_graph()}/me/accounts", params={
            "fields": "id,name,access_token", "access_token": long_lived["access_token"],
        }), "Đọc danh sách Trang")
    saved = [save_account(user_id, "facebook", p["id"], p["name"], p["access_token"])
             for p in pages.get("data", []) if p.get("access_token")]
    if not saved:
        raise SocialError("Tài khoản Facebook này không quản lý Trang nào, hoặc chưa cấp quyền cho Trang")
    return saved


def _tiktok_token(account: dict, client) -> str:
    """Access token TikTok hết hạn sau ~24 giờ: tự làm mới bằng refresh token."""
    conn = get_db()
    expired = conn.execute("SELECT expires_at IS NOT NULL AND expires_at < datetime('now', '+5 minutes') FROM "
                           "social_accounts WHERE id = ?", (account["id"],)).fetchone()[0]
    conn.close()
    if not expired:
        return decrypt(account["access_token_enc"])
    token = _check(client.post(f"{TIKTOK_API}/oauth/token/", data={
        "client_key": config.tiktok_client_key(), "client_secret": config.tiktok_client_secret(),
        "grant_type": "refresh_token", "refresh_token": decrypt(account["refresh_token_enc"]),
    }), "Làm mới token TikTok")
    if "access_token" not in token:
        raise SocialError("Phiên TikTok đã hết hạn, vui lòng kết nối lại")
    save_account(account["user_id"], "tiktok", account["external_id"], account["display_name"],
                 token["access_token"], token.get("refresh_token"), token.get("expires_in"))
    return token["access_token"]


# =============================================================================
# TikTok
# =============================================================================
def tiktok_creator_info(account: dict) -> dict:
    """Thông tin bắt buộc hiển thị trước khi đăng (quyền riêng tư được phép, giới hạn thời lượng...)."""
    with http_utils.http_client() as client:
        token = _tiktok_token(account, client)
        data = _check(client.post(f"{TIKTOK_API}/post/publish/creator_info/query/",
                                  headers={"Authorization": f"Bearer {token}",
                                           "Content-Type": "application/json; charset=UTF-8"}),
                      "Đọc thông tin nhà sáng tạo TikTok")
    return data.get("data") or {}


def _publish_tiktok(account: dict, video_path: str, caption: str, options: dict) -> dict:
    size = os.path.getsize(video_path)
    post_info = {
        "title": caption[:2200],
        "privacy_level": options["privacy_level"],
        "disable_comment": not options.get("allow_comment", True),
        "disable_duet": not options.get("allow_duet", True),
        "disable_stitch": not options.get("allow_stitch", True),
    }
    if config.tiktok_label_aigc():
        post_info["is_aigc"] = True
    with http_utils.http_client() as client:
        token = _tiktok_token(account, client)
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=UTF-8"}
        init = _check(client.post(f"{TIKTOK_API}/post/publish/video/init/", headers=headers, json={
            "post_info": post_info,
            # Video ngắn: gửi một phần duy nhất
            "source_info": {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": size, "total_chunk_count": 1},
        }), "Khởi tạo đăng TikTok")
        data = init.get("data") or {}
        if not data.get("upload_url"):
            raise SocialError(f"TikTok không trả địa chỉ upload: {init.get('error')}")
        with open(video_path, "rb") as f:
            up = client.put(data["upload_url"], content=f.read(), headers={
                "Content-Type": "video/mp4", "Content-Length": str(size),
                "Content-Range": f"bytes 0-{size - 1}/{size}",
            })
        if up.status_code >= 300:
            raise SocialError(f"Tải video lên TikTok thất bại (HTTP {up.status_code})")

        publish_id = data.get("publish_id")

        def fetch():
            return (_check(client.post(f"{TIKTOK_API}/post/publish/status/fetch/", headers=headers,
                                       json={"publish_id": publish_id}), "Kiểm tra trạng thái TikTok")
                    .get("data") or {})

        state = http_utils.poll(fetch, lambda s: s.get("status") in ("PUBLISH_COMPLETE", "FAILED"),
                                timeout_sec=config.ai_timeout_sec(), interval=5.0)
    if state.get("status") != "PUBLISH_COMPLETE":
        raise SocialError(f"TikTok từ chối video: {state.get('fail_reason') or 'không rõ lý do'}")
    post_ids = state.get("publicaly_available_post_id") or state.get("publicly_available_post_id") or []
    return {"external_id": str(post_ids[0]) if post_ids else publish_id}


# =============================================================================
# Facebook Reels
# =============================================================================
def _publish_facebook(account: dict, video_path: str, caption: str, options: dict) -> dict:
    page_id = account["external_id"]
    token = decrypt(account["access_token_enc"])
    size = os.path.getsize(video_path)
    with http_utils.http_client() as client:
        start = _check(client.post(f"{_graph()}/{page_id}/video_reels",
                                   data={"upload_phase": "start", "access_token": token}),
                       "Khởi tạo đăng Reels")
        video_id = start.get("video_id")
        upload_url = start.get("upload_url") or \
            f"https://rupload.facebook.com/video-upload/{config.facebook_graph_version()}/{video_id}"
        with open(video_path, "rb") as f:
            up = _check(client.post(upload_url, content=f.read(), headers={
                "Authorization": f"OAuth {token}", "offset": "0", "file_size": str(size),
            }), "Tải video lên Facebook")
        if not up.get("success", True):
            raise SocialError("Facebook không nhận file video")
        finish = _check(client.post(f"{_graph()}/{page_id}/video_reels", data={
            "upload_phase": "finish", "video_id": video_id, "video_state": "PUBLISHED",
            "description": caption[:2200], "access_token": token,
        }), "Đăng Reels")
    if not finish.get("success", False):
        raise SocialError("Facebook không xác nhận đăng Reels")
    return {"external_id": video_id}


# =============================================================================
# Đăng bài (chạy nền)
# =============================================================================
def create_publication(user_id: str, job: dict, account: dict, caption: str) -> str:
    pub_id = f"pub_{uuid.uuid4().hex[:10]}"
    conn = get_db()
    conn.execute('''
    INSERT INTO publications (id, user_id, job_id, account_id, platform, status, caption)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
    ''', (pub_id, user_id, job["job_id"], account["id"], account["platform"], caption))
    conn.commit()
    conn.close()
    return pub_id


def _set_publication(pub_id: str, status: str, external_id: str = None, error: str = None):
    conn = get_db()
    conn.execute('''
    UPDATE publications SET status = ?, external_id = COALESCE(?, external_id), error_message = ?,
                            updated_at = CURRENT_TIMESTAMP WHERE id = ?
    ''', (status, external_id, error, pub_id))
    conn.commit()
    conn.close()


def run_publication(pub_id: str, account: dict, video_url: str, caption: str, options: dict):
    try:
        _set_publication(pub_id, "processing")
        video_path = resolve_media_ref(video_url)
        publish = _publish_tiktok if account["platform"] == "tiktok" else _publish_facebook
        res = publish(account, video_path, caption, options)
        _set_publication(pub_id, "published", external_id=res.get("external_id"))
    except (SocialError, ProviderError, OSError, ValueError) as e:
        log.warning("Đăng %s thất bại: %s", pub_id, e)
        _set_publication(pub_id, "failed", error=str(e)[:1000])
    except Exception as e:  # không để lỗi lạ làm kẹt trạng thái 'processing'
        log.exception("Đăng %s lỗi không xác định", pub_id)
        _set_publication(pub_id, "failed", error=f"Lỗi không xác định: {e.__class__.__name__}")


def list_publications(user_id: str, job_id: str = None) -> list:
    conn = get_db()
    sql = '''
    SELECT p.id, p.job_id, p.platform, p.status, p.external_id, p.caption, p.error_message, p.created_at,
           a.display_name AS account_name
    FROM publications p LEFT JOIN social_accounts a ON a.id = p.account_id
    WHERE p.user_id = ?'''
    args = [user_id]
    if job_id:
        sql += " AND p.job_id = ?"
        args.append(job_id)
    rows = conn.execute(sql + " ORDER BY p.created_at DESC LIMIT 50", args).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def recover_stale_publications() -> int:
    conn = get_db()
    cur = conn.execute("UPDATE publications SET status = 'failed', error_message = "
                       "'Máy chủ khởi động lại khi đang đăng, vui lòng kiểm tra trên nền tảng rồi đăng lại' "
                       "WHERE status IN ('pending', 'processing')")
    conn.commit()
    conn.close()
    return cur.rowcount
