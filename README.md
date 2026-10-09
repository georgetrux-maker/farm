# Aura Fashion AI: Video Review Thời Trang

Upload ảnh sản phẩm, chọn người mẫu và mẫu video, hệ thống tạo video dọc 9:16 có lồng tiếng, phụ đề, caption và hashtag để đăng TikTok/Reels.

- **Backend:** Python FastAPI + SQLite + FFmpeg + Edge-TTS (`backend/`)
- **Frontend:** React + Vite + TypeScript + Tailwind (`frontend/`)
- Bản HTML thuần cũ (`index.html`, `app.js`) vẫn chạy được ở `http://localhost:3456/`

---

## Tình trạng hiện tại

| Phần | Trạng thái |
|---|---|
| Upload ảnh, tạo sản phẩm, hàng đợi tạo video | ✅ Chạy thật |
| Ví credit: trừ tiền nguyên tử, hoàn credit khi job lỗi | ✅ Chạy thật |
| Nạp tiền VietQR | ⚠️ Tạo mã QR thật; **xác nhận tiền về do quản trị viên làm thủ công** (webhook ngân hàng: Đợt 3) |
| Lồng tiếng tiếng Việt + phụ đề WebVTT | ✅ Edge-TTS (cần internet), có phương án dự phòng |
| 4 mẫu video (catwalk, xoay, dạo phố, cận chất liệu) | ⚠️ Chuyển động máy quay bằng FFmpeg, **chưa phải AI image-to-video** |
| Tách nền trang phục | ⚠️ Tách nền sáng đơn giản, **chưa phải mô hình AI** |
| Thử đồ lên người mẫu | ⚠️ **Mới đặt trang phục lên phông nền**, chưa ghép lên người mẫu |
| Kịch bản review, hashtag | ⚠️ Mẫu câu theo tên/giá/chất liệu, **chưa dùng LLM** |
| Đăng nhập | ⚠️ API token (tạo bằng dòng lệnh); màn đăng nhập: Đợt 3 |
| Đăng TikTok / Facebook, cào Shopee | ❌ Chưa có |

Trang **Kiểm tra hệ thống** trong app (`/api/system/audit-25-tasks`) báo đúng trạng thái này theo thời gian thực.

---

## Cài đặt và chạy

Yêu cầu: Python 3.10+, Node.js 20.19+ (hoặc 22.12+), **ffmpeg**.

### 1. Backend (cổng 3456)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env      # rồi sửa giá trị trong file
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 3456
```

Khi phát triển, `backend/.env` mẫu đã bật `ALLOW_DEMO_USER=1`: không cần token, mọi request được coi là user demo "Linh Chi" (quyền admin, 2.850 credit).
**Khi chạy thật phải đặt `ALLOW_DEMO_USER=0`**, cùng với `ADMIN_TOKEN`, `VIETQR_ACCOUNT_NO`, `CORS_ORIGINS`.

### 2. Frontend (cổng 5173)

```bash
cd frontend
npm ci
cp .env.example .env.local   # điền VITE_API_TOKEN nếu backend tắt ALLOW_DEMO_USER
npm run dev
```

Mở `http://localhost:5173/`. Vite tự chuyển `/api`, `/media`, `/samples` sang backend.

### 3. Quản trị

```bash
# Tạo tài khoản shop và lấy API token (token chỉ hiện một lần)
python3 -m backend.manage create-user "Shop Hoa" shop@example.com --credits 300

# Xác nhận đã nhận tiền cho một giao dịch nạp (sau khi kiểm tra sao kê ngân hàng)
python3 -m backend.manage confirm-deposit TXABC1234567
```

Hoặc gọi API: `POST /api/admin/wallet/verify` với header `X-Admin-Token`.

### 4. Kiểm thử

```bash
pip install -r backend/requirements-dev.txt
python3 -m pytest              # backend: bảo mật, ví, pipeline, engine
cd frontend && npm run lint && npm run build
```

GitHub Actions chạy các bước này trên mỗi pull request (`.github/workflows/ci.yml`).

---

## Luồng tạo video (API)

```text
POST /api/uploads/image        (multipart: file)            -> { media_url }
POST /api/products             { title, price, image_url, category?, fabric_type? } -> { id }
POST /api/pipeline/run         { product_id, avatar_id?, template?, voice?, script_style?, duration_sec? }
GET  /api/jobs/{job_id}        -> tiến độ %, link video khi xong
POST /api/publisher/export     { job_id } -> link tải, caption, hashtag, phụ đề
```

- `template`: `catwalk`, `spin_360`, `street`, `fabric_closeup` (xem `GET /api/ai/templates`)
- `voice`: `vi-VN-HoaiMyNeural` (nữ), `vi-VN-NamMinhNeural` (nam)
- `script_style`: `genz`, `office`, `honest`

Mọi API (trừ danh sách người mẫu, feed, tư vấn size, kiểm tra hệ thống) cần header `Authorization: Bearer <token>`.
Mỗi video tốn `PIPELINE_COST_CREDITS` credit (mặc định 30); job lỗi được hoàn credit tự động.

---

## Cấu trúc thư mục

```text
backend/
  main.py            API FastAPI
  config.py          cấu hình từ biến môi trường / backend/.env
  auth.py            xác thực token, quyền admin
  database.py        SQLite + migration
  media_paths.py     kiểm tra mọi đường dẫn file nằm trong thư mục media
  ffmpeg_utils.py    chạy ffmpeg có timeout
  manage.py          công cụ quản trị dòng lệnh
  ai/                segmentation, vton, motion, script, tts, render
  services/          wallet, queue_manager, cache_manager, security, scraper, size_advisor
  samples/           video/âm thanh mẫu cho giao diện
  tests/             pytest
frontend/            ứng dụng React
```

Dữ liệu sinh ra khi chạy (`backend/fashion_ai.db`, `backend/media/`) không được commit.
