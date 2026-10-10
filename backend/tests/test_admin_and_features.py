from backend.tests.conftest import DEMO_AUTH


def test_templates_showcase_and_voice_preview(client):
    res = client.get("/api/templates/showcase")
    assert res.status_code == 200
    templates = res.json()["templates"]
    assert len(templates) >= 4
    assert any(t["id"] == "tpl_street_summer" for t in templates)

    voices = client.get("/api/ai/tts/voices-preview").json()["voices"]
    assert len(voices) >= 2
    assert any("Hoài My" in v["label"] for v in voices)


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
