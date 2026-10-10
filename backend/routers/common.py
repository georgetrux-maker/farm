"""Hàm dùng chung giữa các router"""
import json
import uuid

from fastapi import HTTPException

from backend.database import get_product


def unique_name(prefix: str, ext: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}.{ext}"


def product_out(product: dict) -> dict:
    out = {k: v for k, v in product.items() if k not in ("analysis_json", "archived")}
    out["analysis"] = json.loads(product["analysis_json"]) if product.get("analysis_json") else None
    out["sizes"] = [x for x in (product.get("sizes") or "").split(",") if x]
    out["tryon_enabled"] = bool(product.get("tryon_enabled"))
    return out


def owned_product(product_id: str, user: dict) -> dict:
    product = get_product(product_id)
    # Sản phẩm của người khác cũng trả 404 để không lộ việc nó tồn tại
    if not product or (product["owner_id"] not in (None, user["id"]) and user["role"] != "admin"):
        raise HTTPException(status_code=404, detail="Sản phẩm không tồn tại")
    return product
