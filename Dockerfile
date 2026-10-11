# ---------- Bước 1: build giao diện React ----------
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- Bước 2: máy chủ Python ----------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AURA_DB_PATH=/data/fashion_ai.db \
    AURA_MEDIA_DIR=/data/media
# fonts-dejavu-core: font dự phòng có đủ dấu tiếng Việt (font chính đóng gói trong backend/assets/fonts)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY index.html app.js styles.css ./
COPY --from=frontend /app/frontend/dist frontend/dist
RUN useradd --create-home --uid 1000 aura && mkdir -p /data && chown aura /data
USER aura
VOLUME ["/data"]
EXPOSE 3456
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:3456/api/health')"
# 1 tiến trình: bộ giới hạn tần suất nằm trong bộ nhớ.
# Job tạo video chạy ở service "worker" (Celery) khi QUEUE_BACKEND=celery, xem docker-compose.yml
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "3456", "--workers", "1", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
