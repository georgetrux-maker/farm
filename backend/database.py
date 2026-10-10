import hashlib
import json
import sqlite3
import unicodedata
import uuid

from backend import config

DEMO_USER_ID = "user_linh_chi"
DEMO_PRODUCT_ID = "prod_dam_voan_to"

# Các khóa cấu hình được phép lưu qua API. API key của nhà cung cấp AI KHÔNG lưu trong DB
# mà chỉ đọc từ biến môi trường (backend/.env).
ALLOWED_SETTING_KEYS = {
    "sam_threshold", "motion_speed", "fps_setting", "auto_subtitles",
    "selected_voice", "watermark_enabled", "shopee_sync", "tiktok_sync", "default_model_id",
}


def search_key(text) -> str:
    """Chuỗi để tìm kiếm không phân biệt hoa thường và dấu: "Áo Sơ Mi Đỏ" -> "ao so mi do"."""
    if not text:
        return ""
    text = str(text).replace("đ", "d").replace("Đ", "D")
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    return " ".join(text.lower().split())


def get_db():
    conn = sqlite3.connect(config.db_path(), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.create_function("search_key", 1, search_key, deterministic=True)
    return conn


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _add_column_if_missing(cursor, table: str, column: str, ddl: str):
    cols = {r[1] for r in cursor.execute(f"PRAGMA table_info({table})")}
    if column not in cols:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode = WAL")

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        role TEXT DEFAULT 'shop', -- 'shop', 'koc', 'shopper', 'admin'
        credits INTEGER DEFAULT 0 CHECK (credits >= 0),
        height REAL DEFAULT 158.0,
        weight REAL DEFAULT 51.0,
        body_shape TEXT DEFAULT 'pear',
        bust REAL DEFAULT 84.0,
        waist REAL DEFAULT 68.0,
        hips REAL DEFAULT 92.0,
        avatar_url TEXT,
        api_token_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        owner_id TEXT,
        title TEXT NOT NULL,
        price INTEGER NOT NULL,
        original_price INTEGER,
        category TEXT,
        fabric_type TEXT,
        breathability INTEGER DEFAULT 96,
        wrinkle_resistance TEXT DEFAULT 'Hạn chế nhăn',
        image_url TEXT NOT NULL,
        segmented_mask_url TEXT,
        affiliate_shopee_url TEXT,
        affiliate_tiktok_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS ai_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        product_id TEXT,
        job_type TEXT,
        status TEXT DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed'
        progress INTEGER DEFAULT 0,
        current_step TEXT,
        output_video_url TEXT,
        output_image_url TEXT,
        output_audio_url TEXT,
        error_message TEXT,
        params_json TEXT,
        script_json TEXT,
        cost_credits INTEGER DEFAULT 0,
        refunded INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS wallet_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        amount_credits INTEGER NOT NULL,
        amount_vnd INTEGER,
        transaction_type TEXT NOT NULL, -- 'deposit', 'usage', 'refund'
        description TEXT,
        qr_code_ref TEXT,
        status TEXT DEFAULT 'success', -- 'pending', 'success'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS wardrobe_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        size_recommended TEXT,
        tryon_image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS tryon_cache (
        cache_key TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        body_shape TEXT NOT NULL,
        height REAL NOT NULL,
        weight REAL NOT NULL,
        result_image_url TEXT NOT NULL,
        hit_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS brand_avatars (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        style TEXT NOT NULL,
        height TEXT NOT NULL,
        weight TEXT NOT NULL,
        measurements TEXT NOT NULL,
        avatar_url TEXT NOT NULL,
        badge TEXT,
        renders_count INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # Phiên đăng nhập (token lưu dạng băm)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # Giao dịch ngân hàng nhận qua webhook (chống xử lý trùng)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS bank_events (
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        transaction_id TEXT,
        amount_vnd INTEGER,
        content TEXT,
        result TEXT NOT NULL,
        payload_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (provider, external_id)
    )
    ''')

    # Tài khoản TikTok / Trang Facebook đã kết nối (token được mã hóa)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS social_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        external_id TEXT NOT NULL,
        display_name TEXT,
        access_token_enc TEXT NOT NULL,
        refresh_token_enc TEXT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, platform, external_id)
    )
    ''')

    # Lịch sử đăng video
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS publications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        status TEXT NOT NULL, -- 'pending', 'processing', 'published', 'failed'
        external_id TEXT,
        caption TEXT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # Migration cho các database tạo bằng phiên bản cũ
    _add_column_if_missing(cursor, "users", "password_hash", "TEXT")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email COLLATE NOCASE)")
    _add_column_if_missing(cursor, "users", "api_token_hash", "TEXT")
    _add_column_if_missing(cursor, "products", "owner_id", "TEXT")
    _add_column_if_missing(cursor, "products", "analysis_json", "TEXT")
    _add_column_if_missing(cursor, "ai_jobs", "params_json", "TEXT")
    _add_column_if_missing(cursor, "ai_jobs", "script_json", "TEXT")
    _add_column_if_missing(cursor, "ai_jobs", "cost_credits", "INTEGER DEFAULT 0")
    _add_column_if_missing(cursor, "ai_jobs", "refunded", "INTEGER DEFAULT 0")
    _add_column_if_missing(cursor, "wallet_transactions", "amount_vnd", "INTEGER")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_user ON ai_jobs(user_id, created_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tx_user ON wallet_transactions(user_id, created_at)")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_token ON users(api_token_hash)")
    # API key không còn lưu trong DB (bản cũ seed sẵn key giả và cho sửa qua giao diện)
    cursor.execute("DELETE FROM system_settings WHERE key LIKE '%_api_key'")

    default_settings = {
        'sam_threshold': '0.96',
        'motion_speed': '7',
        'fps_setting': '30',
        'auto_subtitles': 'true',
        'selected_voice': 'vi-VN-HoaiMyNeural',
        'watermark_enabled': 'false',
        'shopee_sync': 'false',
        'tiktok_sync': 'false',
        'default_model_id': 'model_01'
    }
    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)", (k, v))

    default_avatars = [
        ('model_01', 'Linh Đan', 'Á Đông Thanh Lịch / Tiểu Thư', '1m68', '49kg', '84 - 61 - 90',
         'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
         'Được Dùng Nhiều Nhất', 0, 1),
        ('model_02', 'Bảo Anh', 'GenZ Năng Động / Streetwear', '1m62', '47kg', '82 - 60 - 88',
         'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80',
         'Tỉ Lệ Mua Trẻ Cao', 0, 0),
        ('model_03', 'Mai Khanh', 'Quyến Rũ / Sang Trọng Dạ Hội', '1m72', '53kg', '88 - 63 - 93',
         'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=80',
         'Thời Trang Cao Cấp', 0, 0)
    ]
    for row in default_avatars:
        cursor.execute('''
        INSERT OR IGNORE INTO brand_avatars (id, name, style, height, weight, measurements, avatar_url, badge, renders_count, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', row)

    cursor.execute("SELECT COUNT(*) FROM users WHERE id = ?", (DEMO_USER_ID,))
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
        INSERT INTO users (id, name, email, role, credits, height, weight, body_shape, bust, waist, hips, avatar_url)
        VALUES (?, 'Linh Chi', 'linhchi@aurafashion.vn', 'admin', 2850, 158.0, 51.0, 'pear', 84.0, 68.0, 92.0,
                'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80')
        ''', (DEMO_USER_ID,))
    # Bản cũ seed user demo với quyền 'shopper' nên không vào được trang cài đặt
    cursor.execute("UPDATE users SET role = 'admin' WHERE id = ? AND role = 'shopper'", (DEMO_USER_ID,))
    if config.demo_user_token():
        cursor.execute("UPDATE users SET api_token_hash = ? WHERE id = ?",
                       (hash_token(config.demo_user_token()), DEMO_USER_ID))

    cursor.execute("SELECT COUNT(*) FROM products WHERE id = ?", (DEMO_PRODUCT_ID,))
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
        INSERT INTO products (id, owner_id, title, price, original_price, category, fabric_type, breathability, wrinkle_resistance, image_url, affiliate_shopee_url, affiliate_tiktok_url)
        VALUES (?, ?, 'Đầm Voan Tơ 2 Lớp Hoa Nhí', 189000, 290000, 'Đầm Maxi', 'Voan tơ 2 lớp', 96, 'Hạn chế nhăn',
                'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=600&q=80',
                NULL, NULL)
        ''', (DEMO_PRODUCT_ID, DEMO_USER_ID))

    conn.commit()
    conn.close()


def create_user(name: str, email: str, role: str = "shop", credits: int = 0) -> dict:
    """Tạo user mới và trả về API token (chỉ hiển thị một lần)."""
    import secrets

    user_id = f"user_{uuid.uuid4().hex[:10]}"
    token = secrets.token_urlsafe(32)
    conn = get_db()
    conn.execute(
        "INSERT INTO users (id, name, email, role, credits, api_token_hash) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, name, email, role, credits, hash_token(token)),
    )
    conn.commit()
    conn.close()
    return {"id": user_id, "name": name, "email": email, "role": role, "api_token": token}


def register_user(name: str, email: str, password_hash: str, credits: int = 0):
    """Tạo tài khoản shop bằng email. Trả None nếu email đã tồn tại."""
    user_id = f"user_{uuid.uuid4().hex[:10]}"
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (id, name, email, role, credits, password_hash) VALUES (?, ?, ?, 'shop', ?, ?)",
            (user_id, name, email, credits, password_hash),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return None
    finally:
        conn.close()
    return get_user(user_id)


def get_user_by_email(email: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE email = ? COLLATE NOCASE", (email,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_session(user_id: str, days: int) -> str:
    import secrets

    token = secrets.token_urlsafe(32)
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP")
    conn.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))",
                 (hash_token(token), user_id, f"+{int(days)} days"))
    conn.commit()
    conn.close()
    return token


def delete_session(token: str):
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))
    conn.commit()
    conn.close()


def get_user_by_token(token: str):
    conn = get_db()
    row = conn.execute('''
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
    ''', (hash_token(token),)).fetchone()
    if row is None:
        # API token cố định (tạo bằng backend.manage) cho tích hợp máy-với-máy
        row = conn.execute("SELECT * FROM users WHERE api_token_hash = ?", (hash_token(token),)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user(user_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def public_user(user: dict) -> dict:
    return {k: v for k, v in user.items() if k not in ("api_token_hash", "password_hash")}


def get_system_settings():
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM system_settings").fetchall()
    conn.close()
    return {row['key']: row['value'] for row in rows}


def save_system_settings(settings_dict: dict):
    conn = get_db()
    cursor = conn.cursor()
    for k, v in settings_dict.items():
        if k not in ALLOWED_SETTING_KEYS:
            continue
        value = str(v).lower() if isinstance(v, bool) else str(v)
        cursor.execute("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)", (k, value))
    conn.commit()
    conn.close()
    return get_system_settings()


def get_brand_avatars_list():
    conn = get_db()
    rows = conn.execute("SELECT * FROM brand_avatars ORDER BY is_default DESC, created_at ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_brand_avatar(avatar_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM brand_avatars WHERE id = ?", (avatar_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def add_brand_avatar_entry(name: str, style: str, height: str, weight: str, measurements: str, avatar_url: str, badge: str = "Tùy Chỉnh"):
    avatar_id = f"model_{uuid.uuid4().hex[:6]}"
    conn = get_db()
    conn.execute('''
    INSERT INTO brand_avatars (id, name, style, height, weight, measurements, avatar_url, badge, renders_count, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    ''', (avatar_id, name, style, height, weight, measurements, avatar_url, badge))
    conn.commit()
    conn.close()
    return {"id": avatar_id, "name": name, "style": style, "height": height, "weight": weight, "measurements": measurements, "avatar_url": avatar_url, "badge": badge, "renders_count": 0, "is_default": 0}


def set_default_brand_avatar(avatar_id: str):
    conn = get_db()
    cursor = conn.cursor()
    if cursor.execute("SELECT 1 FROM brand_avatars WHERE id = ?", (avatar_id,)).fetchone() is None:
        conn.close()
        return None
    cursor.execute("UPDATE brand_avatars SET is_default = (id = ?)", (avatar_id,))
    cursor.execute("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('default_model_id', ?)", (avatar_id,))
    conn.commit()
    conn.close()
    return {"status": "success", "default_model_id": avatar_id}


def get_product(product_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_product(owner_id: str, title: str, price: int, image_url: str, category: str = None,
                   fabric_type: str = None, original_price: int = None,
                   affiliate_shopee_url: str = None, affiliate_tiktok_url: str = None,
                   analysis: dict = None) -> dict:
    product_id = f"prod_{uuid.uuid4().hex[:10]}"
    conn = get_db()
    conn.execute('''
    INSERT INTO products (id, owner_id, title, price, original_price, category, fabric_type, image_url,
                          affiliate_shopee_url, affiliate_tiktok_url, analysis_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (product_id, owner_id, title, price, original_price, category, fabric_type, image_url,
          affiliate_shopee_url, affiliate_tiktok_url, json.dumps(analysis, ensure_ascii=False) if analysis else None))
    conn.commit()
    conn.close()
    return get_product(product_id)


def save_product_analysis(product_id: str, analysis: dict):
    conn = get_db()
    conn.execute("UPDATE products SET analysis_json = ? WHERE id = ?",
                 (json.dumps(analysis, ensure_ascii=False), product_id))
    conn.commit()
    conn.close()


def list_products(owner_id: str):
    conn = get_db()
    rows = conn.execute("SELECT * FROM products WHERE owner_id = ? ORDER BY created_at DESC", (owner_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_dashboard_summary(user_id: str):
    conn = get_db()
    cursor = conn.cursor()

    total_renders = cursor.execute("SELECT COUNT(*) FROM ai_jobs WHERE user_id = ?", (user_id,)).fetchone()[0]
    completed_renders = cursor.execute(
        "SELECT COUNT(*) FROM ai_jobs WHERE user_id = ? AND status = 'completed'", (user_id,)).fetchone()[0]

    # Lần dùng lại cache = tổng lượt hit (lần tạo đầu tiên không tính là tiết kiệm)
    cache_hits = cursor.execute("SELECT COALESCE(SUM(hit_count), 0) FROM tryon_cache").fetchone()[0]
    cache_saved_usd = round(cache_hits * 0.05, 2)

    published_videos = cursor.execute(
        "SELECT COUNT(DISTINCT job_id) FROM publications WHERE user_id = ? AND status = 'published'",
        (user_id,)).fetchone()[0]

    u_row = cursor.execute("SELECT credits FROM users WHERE id = ?", (user_id,)).fetchone()
    wallet_credits = u_row[0] if u_row else 0

    avg_row = cursor.execute('''
    SELECT AVG((julianday(completed_at) - julianday(created_at)) * 86400)
    FROM ai_jobs WHERE user_id = ? AND status = 'completed' AND completed_at IS NOT NULL
    ''', (user_id,)).fetchone()
    avg_render_time = f"{avg_row[0]:.1f}s" if avg_row and avg_row[0] is not None else None

    cursor.execute('''
    SELECT j.id, COALESCE(p.title, j.product_id) as product,
           COALESCE(a.name, '') as model,
           COALESCE(json_extract(j.params_json, '$.duration_sec') || 's', '') as duration,
           j.status,
           j.output_video_url,
           j.created_at
    FROM ai_jobs j
    LEFT JOIN products p ON j.product_id = p.id
    LEFT JOIN brand_avatars a ON a.id = json_extract(j.params_json, '$.avatar_id')
    WHERE j.user_id = ?
    ORDER BY j.created_at DESC
    LIMIT 10
    ''', (user_id,))
    recent_jobs = [dict(r) for r in cursor.fetchall()]

    # Số job theo từng ngày trong 7 ngày gần nhất (giờ UTC của SQLite)
    cursor.execute('''
    SELECT date(created_at) as d, COUNT(*) FROM ai_jobs
    WHERE user_id = ? AND created_at >= date('now', '-6 days')
    GROUP BY d
    ''', (user_id,))
    by_date = {r[0]: r[1] for r in cursor.fetchall()}
    days = [r[0] for r in cursor.execute(
        "SELECT date('now', printf('-%d days', 6 - value)) FROM json_each('[0,1,2,3,4,5,6]')").fetchall()]
    conn.close()

    labels = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7']
    import datetime as _dt
    max_count = max([by_date.get(d, 0) for d in days] + [1])
    weekly_chart = []
    for d in days:
        count = by_date.get(d, 0)
        weekday = (_dt.date.fromisoformat(d).weekday() + 1) % 7  # Python: Thứ 2 = 0
        weekly_chart.append({
            'day': labels[weekday],
            'date': d,
            'count': count,
            'height': f"{max(8, int(count / max_count * 90))}%",
        })

    return {
        "total_renders": total_renders,
        "completed_renders": completed_renders,
        "published_videos": published_videos,
        "cache_hits": cache_hits,
        "cache_saved_usd": cache_saved_usd,
        "wallet_credits": wallet_credits,
        "recent_jobs": recent_jobs,
        "weekly_chart": weekly_chart,
        "avg_render_time": avg_render_time,
        # Chưa có dữ liệu đơn hàng để tính tỉ lệ chuyển đổi
        "conversion_rate": None,
    }


if __name__ == '__main__':
    init_db()
    print("Database initialized successfully at", config.db_path())
