import type React from 'react'
import { BarChart3, Film, LayoutGrid, Link2, Wand2 } from 'lucide-react'

export type View = 'create' | 'showcase' | 'videos' | 'connect' | 'stats' | 'admin'

export const NAV_ITEMS: { id: View; label: string; icon: React.ElementType }[] = [
  { id: 'create', label: 'Tạo video', icon: Wand2 },
  { id: 'showcase', label: 'Thư viện mẫu', icon: LayoutGrid },
  { id: 'videos', label: 'Video của tôi', icon: Film },
  { id: 'connect', label: 'Kênh bán hàng', icon: Link2 },
  { id: 'stats', label: 'Ví & Hiệu suất', icon: BarChart3 },
]

