# Aura Fashion AI: Video Review Thời Trang

Upload ảnh sản phẩm, chọn người mẫu và mẫu video, hệ thống tạo video dọc 9:16 có lồng tiếng, phụ đề, caption và hashtag để đăng TikTok/Reels.

- **Backend:** Python FastAPI + SQLite + FFmpeg + Edge-TTS (`backend/`)
- **Frontend:** React + Vite + TypeScript + Tailwind (`frontend/`)
- Bản HTML thuần cũ (`index.html`, `app.js`) vẫn chạy được ở `http://localhost:3456/`

---

## Tình trạng hiện tại

| Phần | Trạng thái |
|---|---|
| Giao diện phong cách thời trang (nền ngà, chữ serif, nút màu mực, có nền tối) với 5 mục cho shop: **Tạo video**, **Thư viện mẫu**, **Video của tôi**, **Kênh bán hàng**, **Ví & hiệu suất**; số dư và nút nạp luôn ở góc trên; điện thoại có thanh tab dưới | ✅ |
| **Trang quản trị** riêng (nút **Quản trị** chỉ tài khoản admin thấy): doanh thu hôm nay/tuần/tháng, lịch sử nạp tiền và **duyệt tay**, người mẫu AI (thêm, đổi ảnh, đặt mặc định), **cài đặt API key** | ✅ Key mã hóa Fernet trong DB, ưu tiên hơn `.env`; nút kiểm tra kết nối báo sai key / hết credit |
| Màn hình **Tạo video** 3 bước: upload ảnh (hoặc dán link sản phẩm, hoặc thử với 3 sản phẩm mẫu) → chọn người mẫu, góc quay (xem trước chuyển động trên ảnh của bạn), giọng đọc (nghe thử), xem và sửa kịch bản → duyệt & tải | ✅ |
| **Thư viện mẫu**: 4 phong cách (dạo phố, công sở, tiệc tối, flash sale), bấm "Dùng mẫu này" là chọn sẵn góc quay, người mẫu, giọng, lời văn | ✅ Xem trước mô phỏng chuyển động; đặt video thật vào `backend/samples/showcase/<id>.mp4` thì tự dùng |
| Chấm chất lượng ảnh đầu vào (độ phân giải, độ nét, ảnh mờ, độ sáng) | ✅ Chạy tại chỗ, miễn phí |
| Phân tích ảnh sản phẩm (loại, màu, chất liệu, điểm nổi bật) + viết kịch bản, caption, hashtag | ✅ **Claude** khi có `ANTHROPIC_API_KEY`; không có thì dùng mẫu câu |
| Thử đồ lên đúng người mẫu đã chọn | ✅ **FASHN** khi có `FASHN_API_KEY`; không có thì chỉ đặt sản phẩm lên phông nền |
| 4 kiểu video (catwalk, xoay, dạo phố, cận chất liệu) | ✅ **Kling 3.0 qua Replicate** khi có `REPLICATE_API_TOKEN`; không có thì chuyển động máy quay bằng FFmpeg |
| Duyệt ảnh thử đồ trước khi tạo video, từ chối được hoàn credit | ✅ |
| Video dọc 720x1280, 30 fps, chuyển cảnh mượt, **phụ đề tiếng Việt in sẵn trong video**, thẻ tên sản phẩm + giá ở đầu video | ✅ Cần FFmpeg có libass; font Be Vietnam Pro và Playfair Display (giấy phép SIL OFL) đóng gói sẵn trong `backend/assets/fonts` |
| Lồng tiếng tiếng Việt (+ file phụ đề WebVTT) | ✅ Edge-TTS (cần internet), có phương án dự phòng |
| Ví credit, hoàn credit khi lỗi, lịch sử credit, upload | ✅ |
| Hàng đợi tạo video: **Redis + worker Celery** (khởi động lại web không làm dở video), hoặc luồng trong tiến trình khi chạy thử | ✅ `QUEUE_BACKEND=celery` / `thread` |
| **Video của tôi**: tìm theo tên sản phẩm (không cần gõ dấu), lọc theo trạng thái, sắp xếp, tải thêm theo trang | ✅ |
| Nạp tiền VietQR, **tự cộng credit khi tiền về** | ✅ qua webhook **SePay** (`SEPAY_WEBHOOK_KEY`); chuyển thiếu tiền thì chờ quản trị viên |
| Đăng ký / đăng nhập bằng email, đăng xuất | ✅ Mật khẩu băm scrypt, chống dò mật khẩu |
| Đăng video lên **TikTok** và **Reels Trang Facebook** | ✅ Khi cấu hình app TikTok/Facebook (cần app được nền tảng duyệt, xem bên dưới) |
| Deploy bằng Docker + HTTPS tự động | ✅ `docker compose up -d --build` |
| Lấy tên, giá, chất liệu, ảnh từ **link sản phẩm** | ✅ Đọc dữ liệu Product/OpenGraph của trang; chặn địa chỉ nội bộ. Shopee/TikTok Shop thường chặn đọc tự động nên hay chỉ đoán được tên từ link, người bán tải ảnh lên; điều khoản Shopee không cho cào dữ liệu hàng loạt |
| Tư vấn size, điểm ghim mua hàng trên video | ❌ Đã gỡ khỏi giao diện vì chưa có dữ liệu thật (API cũ vẫn giữ) |

Tài khoản quản trị có nút **Quản trị** trên thanh trên cùng (trang Admin), và mục **Kiểm tra hệ thống** trong menu tài khoản
cho biết đang dùng AI thật hay engine tạm cho từng bước. Tài khoản shop không thấy các mục này; máy chủ cũng từ chối mọi API quản trị (403).

---

## Bật AI thật

Cách nhanh nhất: **Quản trị → Cài đặt API**, dán key, bấm **Kiểm tra kết nối** rồi **Lưu** (không cần khởi động lại).
Cần đặt `APP_SECRET_KEY` (ít nhất 32 ký tự) trong `backend/.env` để máy chủ mã hóa được key. Giá trị lưu trong trang Admin
được ưu tiên hơn `.env`; bấm "Xóa giá trị đã lưu" để quay về `.env`. Hoặc điền thẳng vào `backend/.env` (chi tiết trong
`backend/.env.example`) rồi khởi động lại backend:

| Bước | Biến môi trường | Lấy ở đâu | Chi phí tham khảo |
|---|---|---|---|
| Phân tích ảnh + kịch bản | `ANTHROPIC_API_KEY` | platform.claude.com | ~1-3 cent/video (model `claude-opus-5-5`) |
| Thử đồ | `FASHN_API_KEY` | app.fashn.ai | ~0,075 USD/ảnh |
| Video | `REPLICATE_API_TOKEN` | replicate.com/account/api-tokens | Kling 5 giây khoảng 0,3-1,5 USD tùy chế độ |

**Nhớ tăng giá mỗi video** (Quản trị → Cài đặt API → Giá & credit, hoặc `PIPELINE_COST_CREDITS`; mặc định 30 credit = 3.000đ, chỉ hợp với engine tạm) cho đủ bù chi phí AI, ví dụ 300-600 credit/video.

Mẹo:
- Ảnh người mẫu phải là **ảnh toàn thân, rõ dáng**. Ảnh mẫu trong dữ liệu demo lấy từ Unsplash, nên thay bằng người mẫu AI hoặc người mẫu có hợp đồng của shop (`POST /api/avatars`, nhận URL https hoặc ảnh đã upload).
- Khi chạy trên server thật, đặt `PUBLIC_BASE_URL` để FASHN/Replicate tải ảnh trực tiếp, nhanh hơn upload lại.
- Tách nền bằng AI chạy tại chỗ (không bắt buộc khi dùng FASHN): `pip install -r backend/requirements-ai.txt`.

---

## Deploy lên máy chủ (Docker)

Cần một máy chủ Linux có Docker và một tên miền trỏ về IP máy chủ.

```bash
cp backend/.env.example backend/.env     # điền giá trị thật (APP_SECRET_KEY, ADMIN_TOKEN, key AI, SePay...)
echo "DOMAIN=app.cuaban.vn" > .env       # tên miền của bạn
docker compose up -d --build
docker compose exec app python -m backend.manage create-user "Admin" admin@cuaban.vn --role admin
```

Compose chạy 4 service:

| Service | Việc |
|---|---|
| `app` | Web + API (uvicorn, 1 tiến trình) |
| `worker` | Tạo video và đăng TikTok/Facebook, nhận việc từ Redis (Celery). Số video song song = `PIPELINE_MAX_WORKERS` |
| `redis` | Hàng đợi việc (không mở cổng ra ngoài, dữ liệu lưu ở volume `redis-data`) |
| `caddy` | HTTPS tự động (Let's Encrypt) |

- Dữ liệu (DB + video) nằm trong volume `aura-data`, dùng chung cho `app` và `worker`; nhớ sao lưu định kỳ.
- Cập nhật hoặc khởi động lại `app` không ảnh hưởng video đang tạo. Khi cập nhật `worker`, Compose chờ tối đa 10 phút
  cho video đang tạo xong. Worker bị tắt đột ngột thì việc được giao lại sau 1 giờ; job kẹt quá
  `STALE_JOB_MINUTES` (mặc định 120 phút) được đánh dấu lỗi và hoàn credit khi khởi động lại.
- Hết Redis hoặc chưa có worker: nút **Kiểm tra hệ thống** báo lỗi ở dòng "Hàng đợi tạo video"; tạo video trả lỗi 503 và không trừ credit.
- Xem log: `docker compose logs -f worker`. Thêm worker trên cùng máy: `docker compose up -d --scale worker=2`.
- Giao diện React được phục vụ ở `/`, bản HTML cũ ở `/legacy`.

## Đăng video lên TikTok / Facebook

| | TikTok | Facebook Reels |
|---|---|---|
| Tạo app | developers.tiktok.com: thêm **Login Kit** và **Content Posting API** (bật Direct Post) | developers.facebook.com: app loại Business, thêm **Facebook Login** |
| Redirect URI | `https://<domain>/api/social/tiktok/callback` | `https://<domain>/api/social/facebook/callback` |
| Quyền | `user.info.basic`, `video.publish` | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` |
| Biến môi trường | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` |
| Trước khi được duyệt | Chỉ đăng được chế độ "Chỉ mình tôi", tối đa vài tài khoản | Chỉ tài khoản có vai trò trong app dùng được |

Token của nền tảng được mã hóa bằng `APP_SECRET_KEY` trước khi lưu. Theo quy định của TikTok, người dùng phải tự chọn chế độ hiển thị mỗi lần đăng (app không chọn sẵn), và video được gắn nhãn nội dung AI (`TIKTOK_LABEL_AIGC`).

## Tự động xác nhận tiền về (SePay)

1. Đăng ký SePay, liên kết tài khoản ngân hàng nhận tiền (trùng `VIETQR_ACCOUNT_NO`).
2. Tạo webhook: URL `https://<domain>/api/webhooks/sepay`, chứng thực **API Key**, đặt cùng giá trị vào `SEPAY_WEBHOOK_KEY`.
3. Khi khách chuyển khoản đúng nội dung `NAPTIEN TX...`, credit được cộng trong vài giây. Mỗi giao dịch ngân hàng chỉ được xử lý một lần; chuyển thiếu tiền được ghi lại để quản trị viên kiểm tra (`python -m backend.manage confirm-deposit`).

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

Mặc định (`QUEUE_BACKEND=thread`) video được tạo ngay trong tiến trình backend, không cần cài thêm gì.
Muốn chạy giống máy chủ thật (Redis + worker riêng):

```bash
# đặt QUEUE_BACKEND=celery và REDIS_URL=redis://localhost:6379/0 trong backend/.env
redis-server                                                  # cửa sổ 1
celery -A backend.worker worker --loglevel=info -Q aura       # cửa sổ 2
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 3456  # cửa sổ 3
```

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
GET  /api/jobs?page=1&page_size=24&q=ao so mi&status=completed&sort=newest
                               -> { items, total, page, page_size, has_more, counts }
POST /api/jobs/{job_id}/approve   (khi status = awaiting_approval) tiếp tục tạo video
POST /api/jobs/{job_id}/reject    hủy, hoàn credit trừ TRYON_PREVIEW_COST_CREDITS
POST /api/publisher/export     { job_id } -> link tải, caption, hashtag, phụ đề
GET  /api/wallet/transactions  -> lịch sử credit: nạp, trừ khi tạo video, hoàn
```

- `template`: `catwalk`, `spin_360`, `street`, `fabric_closeup` (xem `GET /api/ai/templates`)
- `voice`: `vi-VN-HoaiMyNeural` (nữ), `vi-VN-NamMinhNeural` (nam)
- `script_style`: `genz`, `office`, `honest`
- `GET /api/jobs`: `q` tìm theo tên sản phẩm (không phân biệt hoa thường, có dấu hay không), `status` là
  `completed` | `busy` (đang chờ/đang tạo) | `awaiting_approval` | `other` (lỗi/đã từ chối),
  `sort` là `newest` | `oldest` | `title`, `page_size` tối đa 100. `counts` đếm số video từng nhóm theo từ khóa đang tìm.

Mọi API (trừ đăng ký/đăng nhập, danh sách người mẫu, feed, tư vấn size) cần header
`Authorization: Bearer <token>`, lấy token từ `POST /api/auth/login`.
Mỗi video tốn `PIPELINE_COST_CREDITS` credit (mặc định 30); job lỗi được hoàn credit tự động.

---

## Cấu trúc thư mục

```text
backend/
  main.py            tạo app FastAPI, middleware, gắn các router
  routers/           API theo nhóm: account, products, ai, showcase, jobs, wallet, admin, shopper, social, static
  worker.py          worker Celery (QUEUE_BACKEND=celery)
  config.py          cấu hình: trang Admin (admin_config.py, DB mã hóa) > biến môi trường / backend/.env
  auth.py            xác thực token, quyền admin
  database.py        SQLite + migration
  media_paths.py     kiểm tra mọi đường dẫn file nằm trong thư mục media
  ffmpeg_utils.py    chạy ffmpeg có timeout
  manage.py          công cụ quản trị dòng lệnh
  ai/                claude_client, product_analysis, segmentation, vton (FASHN), motion (Replicate/Kling),
                     script, tts, render, http_utils
  services/          wallet, queue_manager, task_queue (gửi việc: luồng hoặc Redis), social, cache_manager,
                     admin_settings + provider_check (trang Cài đặt API), safe_http (tải link an toàn),
                     scraper (đọc link sản phẩm), samples (ảnh mẫu, thư viện mẫu), image_store, security, size_advisor
  samples/           video/âm thanh mẫu cho giao diện; showcase/<id>.mp4 = video mẫu của Thư viện mẫu (nếu có)
  tests/             pytest
frontend/            ứng dụng React
```

Dữ liệu sinh ra khi chạy (`backend/fashion_ai.db`, `backend/media/`) không được commit.
