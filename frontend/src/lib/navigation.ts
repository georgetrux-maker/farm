import type React from 'react'
import {
  Film, Home, KeyRound, LayoutDashboard, LayoutGrid, LifeBuoy, Link2, Package, Receipt, ScrollText, Shirt, UserRound, Users,
  Wallet, Wand2,
} from 'lucide-react'

export type View =
  | 'home' | 'create' | 'products' | 'models' | 'showcase' | 'videos' | 'connect' | 'wallet' | 'support' | 'admin'
export type AdminSection = 'overview' | 'users' | 'transactions' | 'models' | 'settings' | 'logs'

export interface NavItem<T extends string = View> {
  id: T
  label: string
  icon: React.ElementType
}

/** Menu bên trái trên máy tính (shop) */
export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Trang chủ', icon: Home },
  { id: 'create', label: 'Tạo video AI', icon: Wand2 },
  { id: 'products', label: 'Sản phẩm của tôi', icon: Shirt },
  { id: 'models', label: 'Người mẫu AI', icon: UserRound },
  { id: 'videos', label: 'Video của tôi', icon: Film },
  { id: 'showcase', label: 'Thư viện mẫu', icon: LayoutGrid },
  { id: 'connect', label: 'Kênh liên kết', icon: Link2 },
  { id: 'wallet', label: 'Ví Credits', icon: Wallet },
  { id: 'support', label: 'Hỗ trợ', icon: LifeBuoy },
]

/** Thanh tab dưới trên điện thoại: 5 mục chính, các mục còn lại ở menu tài khoản */
export const MOBILE_NAV: NavItem[] = [
  { id: 'home', label: 'Trang chủ', icon: Home },
  { id: 'create', label: 'Tạo video', icon: Wand2 },
  { id: 'products', label: 'Sản phẩm', icon: Package },
  { id: 'videos', label: 'Video', icon: Film },
  { id: 'wallet', label: 'Ví', icon: Wallet },
]

export const ADMIN_SECTIONS: NavItem<AdminSection>[] = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'users', label: 'Người dùng', icon: Users },
  { id: 'transactions', label: 'Giao dịch', icon: Receipt },
  { id: 'models', label: 'Người mẫu AI', icon: UserRound },
  { id: 'settings', label: 'Cài đặt API', icon: KeyRound },
  { id: 'logs', label: 'Nhật ký hệ thống', icon: ScrollText },
]

const VIEWS: View[] = ['home', 'create', 'products', 'models', 'showcase', 'videos', 'connect', 'wallet', 'support', 'admin']
const ADMIN_IDS = ADMIN_SECTIONS.map((s) => s.id)

/** "#admin/users" -> { view: 'admin', section: 'users' }; tên cũ "#stats" -> trang Ví */
export function parseHash(hash: string): { view: View; section: AdminSection } {
  const [head, sub] = hash.replace(/^#\/?/, '').split('/')
  const view = head === 'stats' ? 'wallet' : (VIEWS as string[]).includes(head) ? (head as View) : 'home'
  const section = (ADMIN_IDS as string[]).includes(sub) ? (sub as AdminSection) : 'overview'
  return { view, section }
}

export function toHash(view: View, section: AdminSection = 'overview'): string {
  return view === 'admin' && section !== 'overview' ? `admin/${section}` : view
}
