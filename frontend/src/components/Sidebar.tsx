import React from 'react'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { ADMIN_SECTIONS, NAV_ITEMS, type AdminSection, type NavItem, type View } from '../lib/navigation'
import { Wordmark } from './ui/Wordmark'

interface SidebarProps {
  view: View
  adminSection: AdminSection
  isAdmin: boolean
  onNavigate: (view: View) => void
  onAdminSection: (section: AdminSection) => void
}

function NavButton<T extends string>({ item, active, onClick }: { item: NavItem<T>; active: boolean; onClick: () => void }) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`w-full flex items-center gap-3 px-3.5 h-11 rounded-xl text-sm transition-colors ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold'
          : 'text-[var(--text-muted)] font-medium hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]'
      }`}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
      {item.label}
    </button>
  )
}

/** Menu bên trái trên máy tính. Trong trang Quản trị đổi sang menu Admin Panel. */
export const Sidebar: React.FC<SidebarProps> = ({ view, adminSection, isAdmin, onNavigate, onAdminSection }) => {
  const inAdmin = view === 'admin'
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-card)_80%,transparent)] backdrop-blur-md">
      <button onClick={() => onNavigate('home')} className="h-16 px-6 flex flex-col justify-center items-start shrink-0" aria-label="Aura, về trang chủ">
        <Wordmark className="text-[1.35rem]" />
        {inAdmin && <span className="text-[11px] font-semibold text-[var(--text-muted)] tracking-wide mt-0.5">Admin Panel</span>}
      </button>
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1" aria-label={inAdmin ? 'Menu quản trị' : 'Menu chính'}>
        {inAdmin
          ? ADMIN_SECTIONS.map((item) => (
              <NavButton key={item.id} item={item} active={adminSection === item.id} onClick={() => onAdminSection(item.id)} />
            ))
          : NAV_ITEMS.map((item) => (
              <NavButton key={item.id} item={item} active={view === item.id} onClick={() => onNavigate(item.id)} />
            ))}
      </nav>
      {isAdmin && (
        <div className="p-3 border-t border-[var(--border-subtle)]">
          {inAdmin ? (
            <button
              onClick={() => onNavigate('home')}
              className="w-full flex items-center gap-3 px-3.5 h-11 rounded-xl text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]"
            >
              <ArrowLeft className="w-[18px] h-[18px]" /> Về trang shop
            </button>
          ) : (
            <button
              onClick={() => onNavigate('admin')}
              className="w-full flex items-center gap-3 px-3.5 h-11 rounded-xl text-sm font-semibold bg-[var(--ink)] text-[var(--on-ink)] hover:bg-[var(--ink-hover)]"
            >
              <ShieldCheck className="w-[18px] h-[18px]" /> Quản trị hệ thống
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
