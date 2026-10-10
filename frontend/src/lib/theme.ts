/** Giao diện: chế độ sáng/tối và tông màu (Hồng đất mặc định, Tím theo bản thiết kế Demo 1). */
export type ThemeMode = 'light' | 'dark'
export type Palette = 'rose' | 'violet'

const MODE_KEY = 'aura_theme'
const PALETTE_KEY = 'aura_palette'

/** Màu thanh trình duyệt trên điện thoại, khớp nền trang */
const THEME_COLOR: Record<Palette, Record<ThemeMode, string>> = {
  rose: { light: '#F6F1EB', dark: '#12100E' },
  violet: { light: '#F6F5FB', dark: '#0F0D1A' },
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // trình duyệt chặn lưu trữ: chỉ áp dụng cho lần này
  }
}

export const savedMode = (): ThemeMode => (read(MODE_KEY) === 'dark' ? 'dark' : 'light')
export const savedPalette = (): Palette => (read(PALETTE_KEY) === 'violet' ? 'violet' : 'rose')

export function applyTheme(mode: ThemeMode, palette: Palette) {
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  if (palette === 'violet') root.dataset.palette = 'violet'
  else delete root.dataset.palette
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[palette][mode])
  write(MODE_KEY, mode)
  write(PALETTE_KEY, palette)
}
