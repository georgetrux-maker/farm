def generate_koc_script(product_title: str, price: int, fabric: str = "Voan tơ 2 lớp", style: str = "genz") -> dict:
    """
    Task 4: AI Soạn Kịch Bản Review KOC (LLM Engine)
    Tạo kịch bản review ngắn 30-45s bắt trend, giữ chân người xem 3s đầu.
    """
    if style == "genz":
        hook = f"Đừng lướt qua nếu bạn đang tìm một chiếc váy hack chân tôn dáng dưới {price // 1000} cành!"
        body = (
            f"Em đầm {product_title} này làm bằng chất {fabric} siêu nhẹ mát. "
            "Điểm ăn tiền nhất là phần chiết eo giấu bụng mỡ cực kỳ khéo léo, "
            "kèm cổ vuông khoe trọn xương quai xanh thanh lịch mà không hề hở hang."
        )
        cta = f"Bấm ngay vào giỏ hàng góc trái bên dưới để săn đầm xinh giá chỉ {price:,}đ nha cả nhà ơi!"
    elif style == "office":
        hook = f"Gợi ý set đồ công sở thanh lịch và sang chảnh cho nàng tuần này."
        body = (
            f"Mẫu {product_title} với chất liệu {fabric} mang lại cảm giác dễ chịu suốt cả ngày dài làm việc. "
            "Thiết kế phom chuẩn giúp giữ nét duyên dáng, dễ dàng phối cùng blazer hoặc phụ kiện tối giản."
        )
        cta = f"Ưu đãi đặc biệt hôm nay chỉ {price:,}đ, link chi tiết bên dưới màn hình."
    else:
        hook = f"Review thật tâm chiếc đầm đang hot nhất tuần qua."
        body = (
            f"Chất {fabric} mềm mại, đường kim mũi chỉ rất đều và chắc chắn. "
            "Nàng nào từ 1m55 đến 1m65 mặc dáng này đều cực kỳ vừa vặn."
        )
        cta = f"Trải nghiệm thử đồ ảo ngay trên app hoặc đặt mua tại giỏ hàng Shopee nhé."

    full_script = f"{hook} {body} {cta}"
    hashtags = ["#thoitrangnu", "#reviewquanao", "#damxinh", "#kocreview", "#tiktokfashion", "#aurafashion"]

    return {
        "status": "success",
        "style": style,
        "hook_3s": hook,
        "body_text": body,
        "cta_text": cta,
        "full_script": full_script,
        "hashtags": hashtags,
        "estimated_duration_sec": 32
    }
