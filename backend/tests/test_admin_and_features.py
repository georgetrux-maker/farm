import pytest
from backend.tests.conftest import DEMO_AUTH


def test_admin_api_keys_requires_admin(client, shop):
    # User thường bị từ chối 403
    res = client.get("/api/admin/api-keys", headers=shop["headers"])
    assert res.status_code == 403

    # Admin được truy cập
    res_admin = client.get("/api/admin/api-keys", headers=DEMO_AUTH)
    assert res_admin.status_code == 200
    data = res_admin.json()
    assert "anthropic" in data
    assert "fashn" in data
    assert "vietqr" in data
    assert "pricing" in data


def test_admin_api_keys_save_and_mask(client):
    # Lưu key mới
    payload = {
        "anthropic_api_key": "sk-ant-api03-testkey1234567890abcdef",
        "vietqr_account_no": "123456789",
        "pipeline_cost_credits": 35,
    }
    res = client.post("/api/admin/api-keys", headers=DEMO_AUTH, json=payload)
    assert res.status_code == 200

    # Lấy lại: key đã được che giấu an toàn
    get_res = client.get("/api/admin/api-keys", headers=DEMO_AUTH).json()
    assert get_res["anthropic"]["is_configured"] is True
    assert "***" in get_res["anthropic"]["masked_key"]
    assert "sk-ant-api03-testkey1234567890abcdef" != get_res["anthropic"]["masked_key"]
    assert get_res["vietqr"]["account_no"] == "123456789"
    assert get_res["pricing"]["pipeline_cost_credits"] == 35


def test_admin_stats_overview(client, shop):
    # User thường bị 403
    assert client.get("/api/admin/stats-overview", headers=shop["headers"]).status_code == 403

    # Admin lấy được số liệu
    res = client.get("/api/admin/stats-overview", headers=DEMO_AUTH)
    assert res.status_code == 200
    data = res.json()
    assert "summary" in data
    assert "total_users" in data["summary"]
    assert "recent_users" in data


def test_templates_showcase_and_voice_preview(client):
    res = client.get("/api/templates/showcase")
    assert res.status_code == 200
    templates = res.json()["templates"]
    assert len(templates) >= 4
    assert any(t["id"] == "tpl_street_summer" for t in templates)

    voices = client.get("/api/ai/tts/voices-preview").json()["voices"]
    assert len(voices) >= 2
    assert any("Hoài My" in v["label"] for v in voices)


def test_scraper_extracts_shopee_or_custom(client):
    res = client.post("/api/scraper/product", headers=DEMO_AUTH, json={"url": "https://shopee.vn/dam-vintage-hoa-nhi-i.12345.67890"})
    assert res.status_code == 200

    data = res.json()
    assert data["status"] == "success"
    assert data["platform"] == "shopee"
    assert "Vintage" in (data["title"] or "")


def test_api_script_preview(client):
    payload = {
        "title": "Đầm Voan Hoa Nhí",
        "price": 289000,
        "fabric": "Voan tơ",
        "category": "Đầm",
        "style": "genz",
    }
    res = client.post("/api/ai/script/preview", headers=DEMO_AUTH, json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "full_script" in data
    assert "hook_3s" in data
    assert "cta_text" in data
    assert len(data["full_script"]) > 10
