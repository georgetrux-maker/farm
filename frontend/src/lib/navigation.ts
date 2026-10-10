import type React from 'react'
import { BarChart3, Film, Link2, Wand2 } from 'lucide-react'

export type View = 'create' | 'videos' | 'connect' | 'stats'

export const NAV_ITEMS: { id: View; label: string; icon: React.ElementType }[] = [
  { id: 'create', label: 'Tạo video', icon: Wand2 },
  { id: 'videos', label: 'Video của tôi', icon: Film },
  { id: 'connect', label: 'Kết nối', icon: Link2 },
  { id: 'stats', label: 'Thống kê', icon: BarChart3 },
]
