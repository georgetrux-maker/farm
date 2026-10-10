"""Bối cảnh của video: Studio, Đường phố, Quán cafe, Biển, Trong nhà.

- prompt: câu mô tả nơi quay gửi kèm model image-to-video (Kling).
- backdrop: phông nền dùng cho ảnh thử đồ minh họa khi chưa bật AI thử đồ, dạng các điểm dừng màu
  (vị trí 0..1 từ trên xuống, màu RGB), để các bối cảnh nhìn khác nhau ngay cả ở chế độ xem thử.
"""

SCENES = {
    "studio": {
        "label": "Studio",
        "prompt": "a clean photo studio with a seamless ivory backdrop and soft even lighting",
        "backdrop": [(0.0, (246, 241, 235)), (1.0, (228, 214, 198))],
    },
    "street": {
        "label": "Đường phố",
        "prompt": "a sunny city street with shopfronts and soft background bokeh, natural daylight",
        "backdrop": [(0.0, (214, 218, 224)), (0.62, (176, 180, 188)), (0.63, (128, 130, 136)), (1.0, (96, 98, 104))],
    },
    "cafe": {
        "label": "Quán cafe",
        "prompt": "a cozy cafe with warm wooden interior, plants and soft window light",
        "backdrop": [(0.0, (92, 64, 46)), (0.6, (150, 110, 78)), (0.61, (186, 150, 112)), (1.0, (206, 174, 136))],
    },
    "beach": {
        "label": "Biển",
        "prompt": "a bright beach at golden hour with gentle waves and a clear sky",
        "backdrop": [(0.0, (190, 220, 238)), (0.48, (150, 196, 222)), (0.49, (92, 156, 196)), (0.62, (120, 176, 206)),
                     (0.63, (236, 220, 188)), (1.0, (222, 200, 160))],
    },
    "indoor": {
        "label": "Trong nhà",
        "prompt": "a bright minimalist living room with a sofa, plants and soft daylight",
        "backdrop": [(0.0, (240, 234, 226)), (0.7, (226, 216, 202)), (0.71, (196, 176, 152)), (1.0, (172, 150, 124))],
    },
}
DEFAULT_SCENE = "studio"
MAX_SCENES = 5  # số cảnh tối đa một video của Pro Studio


def backdrop_color(scene: str, ratio: float) -> tuple:
    """Màu phông nền tại vị trí `ratio` (0 = mép trên, 1 = mép dưới)."""
    stops = SCENES.get(scene, SCENES[DEFAULT_SCENE])["backdrop"]
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        if ratio <= p1:
            t = 0.0 if p1 == p0 else (ratio - p0) / (p1 - p0)
            return tuple(int(a + (b - a) * t) for a, b in zip(c0, c1))
    return stops[-1][1]
