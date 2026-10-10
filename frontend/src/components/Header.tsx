import React, { useState } from 'react'
import { BarChart3, CheckCircle2, Film, Link2, LogOut, Menu, Moon, QrCode, Sun, Wand2, X } from 'lucide-react'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { formatNumber } from '../lib/format'

export type View = 'create' | 'videos' | 'connect' | 'stats'

const NAV_ITEMS: { id: View; label: string; icon: React.ElementType }[] = [
  { id: 'create', label: 'Tạo video', icon: Wand2 },
  { id: 'videos', label: 'Video của tôi', icon: Film },
  { id: 'connect', label: 'Kết nối', icon: Link2 },
  { id: 'stats', label: 'Thống kê', icon: BarChart3 },
]

interface HeaderProps {
  activeView: View
  setActiveView: (view: View) => void
  walletCredits: number
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onOpenDeposit: () => void
  onOpenAudit?: () => void
  userName?: string
  onLogout: () => void
}

const iconButton =
  'w-9 h-9 shrink-0 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-main)] transition-colors'

export const Header: React.FC<HeaderProps> = ({
  activeView,
  setActiveView,
  walletCredits,
  theme,
  onToggleTheme,
  onOpenDeposit,
  onOpenAudit,
  userName,
  onLogout,
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  useEscapeKey(menuOpen, () => setMenuOpen(false))

  const go = (view: View) => {
    setActiveView(view)
    setMenuOpen(false)
  }

  return (
    <header className="relative h-14 shrink-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 sm:px-5 flex items-center justify-between gap-3">
      {/* Thương hiệu */}
      <button onClick={() => go('create')} className="flex items-center gap-2.5 shrink-0" aria-label="Về trang tạo video">
        <span className="w-8 h-8 rounded-lg bg-[var(--accent-color)] flex items-center justify-center text-black font-extrabold text-sm">
          A
        </span>
        <span className="font-display font-bold text-base tracking-wider text-[var(--text-main)]">AURA</span>
      </button>

      {/* Menu trên máy tính */}
      <nav className="hidden lg:flex items-center gap-1 bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border-subtle)]">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => go(id)}
            aria-current={activeView === id ? 'page' : undefined}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
              activeView === id
                ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-subtle)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)] border border-transparent'
            }`}
          >
            <Icon className="w-4 h-4 text-[var(--accent-text)]" />
            {label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onToggleTheme}
          className={`${iconButton} hidden lg:flex`}
          title={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
          aria-label={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        {onOpenAudit && (
          <button onClick={onOpenAudit} className={`${iconButton} hidden lg:flex`} title="Kiểm tra hệ thống" aria-label="Kiểm tra hệ thống">
            <CheckCircle2 className="w-4 h-4 text-[var(--accent-text)]" />
          </button>
        )}

        {/* Số dư: luôn hiện, bấm để nạp */}
        <button
          onClick={onOpenDeposit}
          className="flex items-center gap-2 h-9 pl-3 pr-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-colors min-w-0"
          title="Nạp credit"
        >
          <span className="text-sm font-bold tabular-nums text-[var(--text-main)] whitespace-nowrap">
            {formatNumber(walletCredits)} <span className="text-[var(--accent-text)] font-semibold">credit</span>
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--accent-color)] text-black text-xs font-bold whitespace-nowrap">
            <QrCode className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nạp</span>
          </span>
        </button>

        <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-[var(--border-subtle)]">
          {userName && <span className="hidden xl:inline text-sm text-[var(--text-muted)] max-w-[160px] truncate">{userName}</span>}
          <button onClick={onLogout} className={iconButton} title="Đăng xuất" aria-label="Đăng xuất">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Nút menu trên điện thoại / máy tính bảng */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={`${iconButton} lg:hidden`}
          aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 top-14 bg-black/50 lg:hidden" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 right-0 top-14 lg:hidden bg-[var(--bg-card)] border-b border-[var(--border-subtle)] shadow-2xl p-3 space-y-1">
            {userName && <div className="px-3 pt-1 pb-2 text-sm text-[var(--text-muted)] truncate">Xin chào, {userName}</div>}
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => go(id)}
                aria-current={activeView === id ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-base font-semibold ${
                  activeView === id ? 'bg-[var(--bg-surface)] text-[var(--text-main)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <Icon className="w-5 h-5 text-[var(--accent-text)]" />
                {label}
              </button>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-2 mt-1 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => {
                  onToggleTheme()
                  setMenuOpen(false)
                }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--bg-surface)] text-sm font-medium"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {theme === 'dark' ? 'Nền sáng' : 'Nền tối'}
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onLogout()
                }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--bg-surface)] text-sm font-medium"
              >
                <LogOut className="w-4 h-4" /> Đăng xuất
              </button>
              {onOpenAudit && (
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenAudit()
                  }}
                  className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--bg-surface)] text-sm font-medium"
                >
                  <CheckCircle2 className="w-4 h-4 text-[var(--accent-text)]" /> Kiểm tra hệ thống
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  )
}
