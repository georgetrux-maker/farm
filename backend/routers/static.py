"""File tĩnh: chỉ phục vụ đúng các file cần thiết, không mở cả thư mục repo"""
import os

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend import config

# Bản HTML thuần cũ: /legacy (cần app.js, styles.css ở gốc)
_LEGACY_FILES = {"app.js", "styles.css"}
# Bản React đã build (npm run build) được phục vụ ở "/" nếu có
_DIST_DIR = os.path.join(config.REPO_DIR, "frontend", "dist")
_HAS_DIST = os.path.isfile(os.path.join(_DIST_DIR, "index.html"))
_DIST_FILES = {f for f in os.listdir(_DIST_DIR) if os.path.isfile(os.path.join(_DIST_DIR, f))} if _HAS_DIST else set()

router = APIRouter(include_in_schema=False)


def mount_static(app: FastAPI) -> None:
    app.mount("/media", StaticFiles(directory=config.media_dir()), name="media")
    app.mount("/samples", StaticFiles(directory=config.SAMPLES_DIR), name="samples")
    if _HAS_DIST and os.path.isdir(os.path.join(_DIST_DIR, "assets")):
        app.mount("/assets", StaticFiles(directory=os.path.join(_DIST_DIR, "assets")), name="assets")


@router.get("/")
def serve_index():
    if _HAS_DIST:
        return FileResponse(os.path.join(_DIST_DIR, "index.html"))
    return FileResponse(os.path.join(config.REPO_DIR, "index.html"))


@router.get("/legacy")
def serve_legacy():
    return FileResponse(os.path.join(config.REPO_DIR, "index.html"))


@router.get("/{filename}")
def serve_public_file(filename: str):
    if filename in _DIST_FILES and filename != "index.html":
        return FileResponse(os.path.join(_DIST_DIR, filename))
    if filename in _LEGACY_FILES:
        return FileResponse(os.path.join(config.REPO_DIR, filename))
    raise HTTPException(status_code=404, detail="Not Found")
