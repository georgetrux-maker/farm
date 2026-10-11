/** Nhãn hiển thị dùng chung giữa Tạo video và Thư viện mẫu */
export const STYLE_LABELS: Record<string, string> = {
  genz: 'GenZ trẻ trung',
  office: 'Công sở thanh lịch',
  honest: 'Review thật lòng',
}

export const TEMPLATE_SHORT_LABELS: Record<string, string> = {
  catwalk: 'Catwalk',
  spin_360: 'Xoay tôn dáng',
  street: 'Dạo phố',
  fabric_closeup: 'Cận chất liệu',
}

export const SCENE_LABELS: Record<string, string> = {
  studio: 'Studio',
  street: 'Đường phố',
  cafe: 'Quán cafe',
  beach: 'Biển',
  indoor: 'Trong nhà',
}

/** Màu phông của từng bối cảnh, khớp với phông nền máy chủ dựng cho ảnh minh họa (backend/ai/scenes.py) */
export const SCENE_BACKDROPS: Record<string, string> = {
  studio: 'linear-gradient(180deg, rgb(246 241 235) 0%, rgb(228 214 198) 100%)',
  street: 'linear-gradient(180deg, rgb(214 218 224) 0%, rgb(176 180 188) 62%, rgb(128 130 136) 63%, rgb(96 98 104) 100%)',
  cafe: 'linear-gradient(180deg, rgb(92 64 46) 0%, rgb(150 110 78) 60%, rgb(186 150 112) 61%, rgb(206 174 136) 100%)',
  beach:
    'linear-gradient(180deg, rgb(190 220 238) 0%, rgb(150 196 222) 48%, rgb(92 156 196) 49%, rgb(120 176 206) 62%, rgb(236 220 188) 63%, rgb(222 200 160) 100%)',
  indoor: 'linear-gradient(180deg, rgb(240 234 226) 0%, rgb(226 216 202) 70%, rgb(196 176 152) 71%, rgb(172 150 124) 100%)',
}

/** Ảnh phông của từng bối cảnh (backend/samples/img, phục vụ ở /samples); chưa tải được thì dùng màu ở SCENE_BACKDROPS */
export const sceneBackground = (id: string): string => {
  const gradient = SCENE_BACKDROPS[id] ?? 'var(--bg-surface)'
  return SCENE_BACKDROPS[id] ? `url(/samples/img/scene_${id}.jpg) center/cover no-repeat, ${gradient}` : gradient
}

export const TRANSITION_LABELS: Record<string, string> = {
  fade: 'Mờ dần',
  slide: 'Trượt ngang',
  zoom: 'Phóng to',
  cut: 'Cắt thẳng',
}
