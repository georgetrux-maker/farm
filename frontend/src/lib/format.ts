/** Bỏ dấu tiếng Việt: "Áo sơ mi" -> "Ao so mi" */
export function stripVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

/** "Áo sơ mi kẻ sọc" -> "ao-so-mi-ke-soc" */
export function slugify(text: string): string {
  const slug = stripVietnamese(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return slug || 'video'
}

/** Tên file tải về theo tên sản phẩm */
export function videoFileName(title?: string | null): string {
  return `${slugify(title || 'video-review')}.mp4`
}

// Tên file do máy ảnh / điện thoại / Zalo tự đặt, không mang ý nghĩa sản phẩm
const CAMERA_NAME = /^(img|dsc|dscn|dcim|pxl|mvimg|screenshot|screen ?shot|image|photo|picture|anh|hinh|z\d+|received|fb|zalo)[\s_-]*\d/i

/** Gợi ý tên sản phẩm từ tên file ảnh, ví dụ "ao-so-mi-ke-soc.jpg" -> "Ao so mi ke soc". */
export function suggestTitleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, '').trim()
  if (!base || CAMERA_NAME.test(base)) return ''
  const words = base
    .replace(/[_\-.+]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^\d{3,}$/.test(w) && !/^(copy|final|edit|ban|sao)$/i.test(w))
  const letters = words.join('').replace(/[^\p{L}]/gu, '')
  if (words.length < 2 || letters.length < 4) return ''
  const title = words.join(' ').slice(0, 120)
  return title.charAt(0).toUpperCase() + title.slice(1)
}

export function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')}đ`
}

export function formatNumber(value: number): string {
  return value.toLocaleString('vi-VN')
}

/** "14:05 10/10" (thêm năm nếu khác năm nay). Thời gian lưu trong SQLite là UTC dạng "YYYY-MM-DD HH:MM:SS". */
export function formatDateTime(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = d.getFullYear() === new Date().getFullYear() ? '' : `/${d.getFullYear()}`
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}${year}`
}

/** "10/11/2026" theo giờ máy người dùng (thời gian SQLite là UTC dạng "YYYY-MM-DD HH:MM:SS") */
export function formatDate(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** 1.250.000 -> "1,25tr"; 500.000 -> "500k" */
export function compactVnd(value: number): string {
  const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
  if (value >= 1e9) return `${fmt(value / 1e9)} tỷ`
  if (value >= 1e6) return `${fmt(value / 1e6)}tr`
  if (value >= 1e3) return `${fmt(value / 1e3)}k`
  return fmt(value)
}
