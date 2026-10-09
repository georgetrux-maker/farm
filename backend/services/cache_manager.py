import hashlib
from backend.database import get_db

def generate_cache_key(product_id: str, body_shape: str, height: float, weight: float) -> str:
    # Normalized bucket: round height to nearest 2cm, weight to nearest 1kg
    norm_height = round(height / 2) * 2
    norm_weight = round(weight)
    raw = f"{product_id}_{body_shape}_{norm_height}_{norm_weight}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]

def check_tryon_cache(product_id: str, body_shape: str, height: float, weight: float) -> dict:
    """
    Task 23: Tối Ưu Bộ Đệm & Tiết Kiệm Chi Phí GPU (Cache Layer)
    Kiểm tra cache nếu khách hàng có số đo tương tự đã từng thử bộ này.
    """
    cache_key = generate_cache_key(product_id, body_shape, height, weight)
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM tryon_cache WHERE cache_key = ?", (cache_key,))
    row = cursor.fetchone()

    if row:
        # Increment hit count
        cursor.execute("UPDATE tryon_cache SET hit_count = hit_count + 1 WHERE cache_key = ?", (cache_key,))
        conn.commit()
        result = {
            "cached": True,
            "cache_key": cache_key,
            "result_image_url": row["result_image_url"],
            "hits": row["hit_count"] + 1,
            "gpu_cost_saved": "$0.05"
        }
        conn.close()
        return result

    conn.close()
    return {"cached": False, "cache_key": cache_key}

def save_tryon_cache(product_id: str, body_shape: str, height: float, weight: float, image_url: str):
    cache_key = generate_cache_key(product_id, body_shape, height, weight)
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
    INSERT OR REPLACE INTO tryon_cache (cache_key, product_id, body_shape, height, weight, result_image_url)
    VALUES (?, ?, ?, ?, ?, ?)
    ''', (cache_key, product_id, body_shape, height, weight, image_url))

    conn.commit()
    conn.close()
