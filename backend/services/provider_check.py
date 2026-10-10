"""Nút "Kiểm tra kết nối" trong trang Admin: thử key với từng nhà cung cấp, báo kết quả dễ hiểu.

Mỗi hàm nhận key cần thử (key admin vừa gõ, hoặc key đang dùng nếu ô chưa sửa) và trả về
{"ok": bool, "status": "ok" | "invalid_key" | "no_credit" | "not_configured" | "error" | "info", "message": str}.
"""
import anthropic
import httpx

from backend import config
from backend.ai.motion import REPLICATE_BASE_URL
from backend.ai.vton import FASHN_BASE_URL

TIMEOUT = httpx.Timeout(15.0, connect=5.0)


def _result(ok: bool, status: str, message: str) -> dict:
    return {"ok": ok, "status": status, "message": message}


def check_anthropic(key: str, model: str) -> dict:
    if not key:
        return _result(False, "not_configured", "Chưa có API key của Anthropic")
    client = anthropic.Anthropic(api_key=key, max_retries=0, timeout=20.0)
    try:
        client.models.retrieve(model)  # kiểm tra key và quyền dùng model, không tốn phí
        # Một yêu cầu rất nhỏ để biết tài khoản còn credit (tốn chưa tới 1 xu)
        client.messages.create(model=model, max_tokens=16, output_config={"effort": "low"},
                               messages=[{"role": "user", "content": "ping"}])
    except anthropic.AuthenticationError:
        return _result(False, "invalid_key", "Sai API key hoặc key đã bị thu hồi")
    except anthropic.PermissionDeniedError:
        return _result(False, "invalid_key", f"Key không có quyền dùng model {model}")
    except anthropic.NotFoundError:
        return _result(False, "error", f"Model {model} không tồn tại hoặc tài khoản chưa được dùng")
    except anthropic.RateLimitError:
        return _result(True, "ok", "Key đúng, nhưng tài khoản đang chạm giới hạn tần suất")
    except anthropic.APIStatusError as e:
        text = str(getattr(e, "message", "") or e).lower()
        if e.status_code == 402 or "credit balance" in text or "billing" in text:
            return _result(False, "no_credit", "Key đúng nhưng tài khoản Anthropic đã hết credit, cần nạp thêm")
        return _result(False, "error", f"Anthropic báo lỗi HTTP {e.status_code}")
    except anthropic.APIConnectionError:
        return _result(False, "error", "Không kết nối được tới Anthropic, kiểm tra mạng của máy chủ")
    return _result(True, "ok", f"Kết nối Claude thành công (model {model})")


def check_fashn(key: str) -> dict:
    if not key:
        return _result(False, "not_configured", "Chưa có API key của FASHN")
    headers = {"Authorization": f"Bearer {key}"}
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            res = client.get(f"{FASHN_BASE_URL}/credits", headers=headers)
            if res.status_code == 404:
                # Không có API xem credit: hỏi trạng thái một mã không tồn tại, key đúng sẽ nhận 404 thay vì 401
                res = client.get(f"{FASHN_BASE_URL}/status/kiem-tra-ket-noi", headers=headers)
                if res.status_code in (401, 403):
                    return _result(False, "invalid_key", "Sai API key của FASHN")
                if res.status_code in (200, 404):
                    return _result(True, "ok", "Kết nối FASHN thành công")
                return _result(False, "error", f"FASHN báo lỗi HTTP {res.status_code}")
    except httpx.HTTPError:
        return _result(False, "error", "Không kết nối được tới FASHN, kiểm tra mạng của máy chủ")
    if res.status_code in (401, 403):
        return _result(False, "invalid_key", "Sai API key của FASHN")
    if res.status_code != 200:
        return _result(False, "error", f"FASHN báo lỗi HTTP {res.status_code}")
    credits = _fashn_credits(res)
    if credits is None:
        return _result(True, "ok", "Kết nối FASHN thành công")
    if credits <= 0:
        return _result(False, "no_credit", "Key đúng nhưng tài khoản FASHN đã hết credit")
    return _result(True, "ok", f"Kết nối FASHN thành công, còn {credits:g} credit")


def _fashn_credits(res: httpx.Response):
    try:
        data = res.json().get("credits")
    except ValueError:
        return None
    if isinstance(data, dict):
        data = data.get("total")
    return data if isinstance(data, (int, float)) else None


def check_replicate(token: str, model: str) -> dict:
    if not token:
        return _result(False, "not_configured", "Chưa có API token của Replicate")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            res = client.get(f"{REPLICATE_BASE_URL}/account", headers=headers)
            if res.status_code in (401, 403):
                return _result(False, "invalid_key", "Sai API token của Replicate")
            if res.status_code != 200:
                return _result(False, "error", f"Replicate báo lỗi HTTP {res.status_code}")
            username = res.json().get("username", "")
            found = client.get(f"{REPLICATE_BASE_URL}/models/{model}", headers=headers)
    except (httpx.HTTPError, ValueError):
        return _result(False, "error", "Không kết nối được tới Replicate, kiểm tra mạng của máy chủ")
    if found.status_code == 404:
        return _result(False, "error", f"Token đúng (tài khoản {username}) nhưng không có model {model}")
    # Replicate không có API xem số dư: hết tiền chỉ biết khi tạo video bị từ chối
    return _result(True, "ok", f"Kết nối Replicate thành công, tài khoản {username}. "
                               "Số dư xem tại replicate.com/account/billing")


def check_sepay(key: str) -> dict:
    if not key:
        return _result(False, "not_configured", "Chưa có SePay webhook key")
    url = f"{(config.public_base_url() or 'https://<tên-miền>').rstrip('/')}/api/webhooks/sepay"
    return _result(True, "info", "SePay không có API để thử key webhook. Vào my.sepay.vn → Webhooks, đặt URL "
                                 f"{url}, kiểu xác thực API Key với đúng key này, rồi bấm \"Gửi thử\".")


def check_tiktok(client_key: str, client_secret: str) -> dict:
    if not (client_key and client_secret):
        return _result(False, "not_configured", "Cần cả client key và client secret của TikTok")
    try:
        res = httpx.post("https://open.tiktokapis.com/v2/oauth/token/", timeout=TIMEOUT,
                         data={"client_key": client_key, "client_secret": client_secret,
                               "grant_type": "client_credentials"})
        data = res.json()
    except (httpx.HTTPError, ValueError):
        return _result(False, "error", "Không kết nối được tới TikTok, kiểm tra mạng của máy chủ")
    if res.status_code == 200 and data.get("access_token"):
        return _result(True, "ok", "Client key và secret của TikTok hợp lệ")
    return _result(False, "invalid_key", "TikTok từ chối client key/secret này")


def check_facebook(app_id: str, app_secret: str) -> dict:
    if not (app_id and app_secret):
        return _result(False, "not_configured", "Cần cả App ID và App secret của Facebook")
    try:
        res = httpx.get(f"https://graph.facebook.com/{config.facebook_graph_version()}/oauth/access_token",
                        timeout=TIMEOUT, params={"client_id": app_id, "client_secret": app_secret,
                                                 "grant_type": "client_credentials"})
        data = res.json()
    except (httpx.HTTPError, ValueError):
        return _result(False, "error", "Không kết nối được tới Facebook, kiểm tra mạng của máy chủ")
    if res.status_code == 200 and data.get("access_token"):
        return _result(True, "ok", "App ID và App secret của Facebook hợp lệ")
    return _result(False, "invalid_key", "Facebook từ chối App ID/App secret này")


def run(provider: str, typed: dict) -> dict:
    """typed: các ô admin vừa gõ (chưa lưu). Ô không gõ thì dùng giá trị đang có hiệu lực."""
    def pick(key, current):
        value = (typed.get(key) or "").strip()
        return value if value and "•" not in value else current()

    if provider == "anthropic":
        model = pick("anthropic_model", config.anthropic_model)
        if model not in config.ANTHROPIC_MODELS:
            return _result(False, "error", "Model không nằm trong danh sách hỗ trợ")
        return check_anthropic(pick("anthropic_api_key", config.anthropic_api_key), model)
    if provider == "fashn":
        return check_fashn(pick("fashn_api_key", config.fashn_api_key))
    if provider == "replicate":
        return check_replicate(pick("replicate_api_token", config.replicate_api_token),
                               pick("replicate_video_model", config.replicate_video_model))
    if provider == "sepay":
        return check_sepay(pick("sepay_webhook_key", config.sepay_webhook_key))
    if provider == "tiktok":
        return check_tiktok(pick("tiktok_client_key", config.tiktok_client_key),
                            pick("tiktok_client_secret", config.tiktok_client_secret))
    if provider == "facebook":
        return check_facebook(pick("facebook_app_id", config.facebook_app_id),
                              pick("facebook_app_secret", config.facebook_app_secret))
    raise ValueError(provider)
