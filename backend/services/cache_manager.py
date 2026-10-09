import hashlib

from backend.database import get_db
from backend.media_paths import try_resolve_media_ref


def generate_cache_key(product_id: str, avatar_id: str, body_shape: str, height: float, weight: float) -> str:
    # Gom nhóm số đo: chiều cao làm tròn 2cm, cân nặng làm tròn 1kg
    norm_height = round(height / 2) * 2
    norm_weight = round(weight)
    raw = f"{product_id}|{avatar_id}|{body_shape}|{norm_height}|{norm_weight}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def check_tryon_cache(product_id: str, avatar_id: str, body_shape: str, height: float, weight: float) -> dict:
    """
    Task 23: Kiểm tra cache nếu đã từng thử bộ này với cùng người mẫu và số đo tương tự.
    """
    cache_key = generate_cache_key(product_id, avatar_id, body_shape, height, weight)
    conn = get_db()
    cursor = conn.cursor()
    row = cursor.execute("SELECT * FROM tryon_cache WHERE cache_key = ?", (cache_key,)).fetchone()

    if row and try_resolve_media_ref(row["result_image_url"]):
        cursor.execute("UPDATE tryon_cache SET hit_count = hit_count + 1 WHERE cache_key = ?", (cache_key,))
        conn.commit()
        conn.close()
        return {
            "cached": True,
            "cache_key": cache_key,
            "result_image_url": row["result_image_url"],
            "hits": row["hit_count"] + 1,
            "gpu_cost_saved": "$0.05",
        }

    if row:  # File kết quả đã bị xóa: bỏ bản ghi cache hỏng
        cursor.execute("DELETE FROM tryon_cache WHERE cache_key = ?", (cache_key,))
        conn.commit()
    conn.close()
    return {"cached": False, "cache_key": cache_key}


def save_tryon_cache(product_id: str, avatar_id: str, body_shape: str, height: float, weight: float, image_url: str):
    cache_key = generate_cache_key(product_id, avatar_id, body_shape, height, weight)
    conn = get_db()
    conn.execute('''
    INSERT OR REPLACE INTO tryon_cache (cache_key, product_id, body_shape, height, weight, result_image_url, hit_count)
    VALUES (?, ?, ?, ?, ?, ?, 0)
    ''', (cache_key, product_id, body_shape, height, weight, image_url))
    conn.commit()
    conn.close()
