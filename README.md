# Aura Fashion AI: Video Review Thời Trang

Upload ảnh sản phẩm, chọn người mẫu và mẫu video, hệ thống tạo video dọc 9:16 có lồng tiếng, phụ đề, caption và hashtag để đăng TikTok/Reels.

- **Backend:** Python FastAPI + SQLite + FFmpeg + Edge-TTS (`backend/`)
- **Frontend:** React + Vite + TypeScript + Tailwind (`frontend/`)
- Bản HTML thuần cũ (`index.html`, `app.js`) vẫn chạy được ở `http://localhost:3456/`

---

## Tình trạng hiện tại

| Phần | Trạng thái |
|---|---|
| Màn hình **Tạo Video** 3 bước: upload ảnh → chọn người mẫu, kiểu video → duyệt & tải | ✅ |
| Chấm chất lượng ảnh đầu vào (độ phân giải, độ nét, độ sáng) | ✅ Chạy tại chỗ, miễn phí |
| Phân tích ảnh sản phẩm (loại, màu, chất liệu, điểm nổi bật) + viết kịch bản, caption, hashtag | ✅ **Claude** khi có `ANTHROPIC_API_KEY`; không có thì dùng mẫu câu |
| Thử đồ lên đúng người mẫu đã chọn | ✅ **FASHN** khi có `FASHN_API_KEY`; không có thì chỉ đặt sản phẩm lên phông nền |
| 4 kiểu video (catwalk, xoay, dạo phố, cận chất liệu) | ✅ **Kling 3.0 qua Replicate** khi có `REPLICATE_API_TOKEN`; không có thì chuyển động máy quay bằng FFmpeg |
| Duyệt ảnh thử đồ trước khi tạo video, từ chối được hoàn credit | ✅ |
| Lồng tiếng tiếng Việt + phụ đề WebVTT | ✅ Edge-TTS (cần internet), có phương án dự phòng |
| Ví credit, hoàn credit khi lỗi, upload, hàng đợi | ✅ |
| Nạp tiền VietQR | ⚠️ Tạo QR thật; **xác nhận tiền về làm thủ công** (webhook ngân hàng: Đợt 3) |
| Đăng nhập | ⚠️ API token tạo bằng dòng lệnh; màn đăng nhập: Đợt 3 |
| Đăng TikTok / Facebook tự động, cào Shopee | ❌ Đợt 3 (hiện tải video + copy caption để đăng tay) |
| Tư vấn size, điểm ghim trên video | ⚠️ Vẫn là số liệu cố định |

Trang **Kiểm Tra Hệ Thống** trong app cho biết đang dùng AI thật hay engine tạm cho từng bước.

---

## Bật AI thật

Điền key vào `backend/.env` (chi tiết trong `backend/.env.example`), khởi động lại backend:

| Bước | Biến môi trường | Lấy ở đâu | Chi phí tham khảo |
|---|---|---|---|
| Phân tích ảnh + kịch bản | `ANTHROPIC_API_KEY` | platform.claude.com | ~1-3 cent/video (model `claude-opus-5-5`) |
| Thử đồ | `FASHN_API_KEY` | app.fashn.ai | ~0,075 USD/ảnh |
| Video | `REPLICATE_API_TOKEN` | replicate.com/account/api-tokens | Kling 5 giây khoảng 0,3-1,5 USD tùy chế độ |

**Nhớ tăng `PIPELINE_COST_CREDITS`** (mặc định 30 credit = 3.000đ, chỉ hợp với engine tạm) cho đủ bù chi phí AI, ví dụ 300-600 credit/video.

Mẹo:
- Ảnh người mẫu phải là **ảnh toàn thân, rõ dáng**. Ảnh mẫu trong dữ liệu demo lấy từ Unsplash, nên thay bằng người mẫu AI hoặc người mẫu có hợp đồng của shop (`POST /api/avatars`, nhận URL https hoặc ảnh đã upload).
- Khi chạy trên server thật, đặt `PUBLIC_BASE_URL` để FASHN/Replicate tải ảnh trực tiếp, nhanh hơn upload lại.
- Tách nền bằng AI chạy tại chỗ (không bắt buộc khi dùng FASHN): `pip install -r backend/requirements-ai.txt`.

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
POST /api/products/analyze     { image_url, title? }        -> điểm chất lượng ảnh + phân tích AI
POST /api/products             { title, price, image_url, category?, fabric_type?, analysis? } -> { id }
POST /api/pipeline/run         { product_id, avatar_id?, template?, voice?, script_style?, duration_sec?, require_approval? }
GET  /api/jobs/{job_id}        -> tiến độ %, ảnh thử đồ, link video khi xong
POST /api/jobs/{job_id}/approve   (khi status = awaiting_approval) tiếp tục tạo video
POST /api/jobs/{job_id}/reject    hủy, hoàn credit trừ TRYON_PREVIEW_COST_CREDITS
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
  ai/                claude_client, product_analysis, segmentation, vton (FASHN), motion (Replicate/Kling),
                     script, tts, render, http_utils
  services/          wallet, queue_manager, cache_manager, security, scraper, size_advisor
  samples/           video/âm thanh mẫu cho giao diện
  tests/             pytest
frontend/            ứng dụng React
```

Dữ liệu sinh ra khi chạy (`backend/fashion_ai.db`, `backend/media/`) không được commit.
