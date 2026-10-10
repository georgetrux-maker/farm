"""Ứng dụng FastAPI: tạo app, middleware, xử lý lỗi chung và gắn các router trong backend/routers."""
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend import config
from backend.database import init_db
from backend.ffmpeg_utils import FFmpegError
from backend.media_paths import MediaPathError
from backend.routers import (
    account, admin, admin_users, ai, jobs, plans, products, shop_library, shopper, showcase, social, static, wallet,
)
from backend.services import social as social_service
from backend.services.queue_manager import recover_stale_jobs
from backend.services.security import check_rate_limit

log = logging.getLogger("aura")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    social_service.recover_stale_publications()
    recovered = recover_stale_jobs()
    if recovered:
        log.warning("Đã hoàn credit cho %d job bị dở dang do server khởi động lại", recovered)
    if config.allow_demo_user():
        log.warning("ALLOW_DEMO_USER đang bật: request không có token được coi là user demo. KHÔNG dùng khi chạy thật.")
    yield


app = FastAPI(title="Aura Fashion AI API", version="1.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Admin-Token"],
)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    # Không tính file tĩnh và việc hỏi tiến độ job (frontend hỏi liên tục)
    exempt = (not path.startswith("/api/")) or (request.method == "GET" and path.startswith("/api/jobs/")) \
        or path.startswith("/api/webhooks/")  # webhook đã có xác thực riêng, không được chặn nhầm
    if not exempt:
        client_ip = request.client.host if request.client else "unknown"
        res = check_rate_limit(client_ip, max_requests=config.rate_limit_per_minute())
        if not res["allowed"]:
            return JSONResponse(status_code=429, content={"detail": res["error"]},
                                headers={"Retry-After": str(res["retry_after"])})
    return await call_next(request)


@app.exception_handler(MediaPathError)
async def media_path_error_handler(request: Request, exc: MediaPathError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(FFmpegError)
async def ffmpeg_error_handler(request: Request, exc: FFmpegError):
    log.error("FFmpeg: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Lỗi xử lý video trên máy chủ"})


# shop_library trước products: /api/products/library phải khớp trước /api/products/{product_id}
for module in (account, shop_library, plans, products, ai, showcase, jobs, wallet, admin, admin_users, shopper, social):
    app.include_router(module.router)

static.mount_static(app)
app.include_router(static.router)  # cuối cùng: có route "/{filename}" bắt mọi đường dẫn còn lại


if __name__ == '__main__':
    uvicorn.run("backend.main:app", host="0.0.0.0", port=3456, reload=True)
