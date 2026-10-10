import React, { useEffect, useRef, useState } from 'react'
import { LogOut, Moon, Plus, ShieldCheck, Sun, Wallet } from 'lucide-react'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { formatNumber } from '../lib/format'
import { NAV_ITEMS, type View } from '../lib/navigation'
import { Wordmark } from './ui/Wordmark'

interface HeaderProps {
  activeView: View
  setActiveView: (view: View) => void
  walletCredits: number
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onOpenDeposit: () => void
  onOpenAudit?: () => void
  userName: string
  userEmail: string
  isAdmin?: boolean
  onLogout: () => void
}

export const Header: React.FC<HeaderProps> = ({
  activeView,
  setActiveView,
  walletCredits,
  theme,
  onToggleTheme,
  onOpenDeposit,
  onOpenAudit,
  userName,
  userEmail,
  isAdmin,
  onLogout,
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEscapeKey(menuOpen, () => setMenuOpen(false))

  // Bấm ra ngoài thì đóng menu tài khoản
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const initial = (userName.trim()[0] ?? '?').toUpperCase()
  const menuItem =
    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--text-sub)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)] transition-colors'

  return (
    <header className="relative z-30 h-14 lg:h-16 shrink-0 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-card)_88%,transparent)] backdrop-blur-md px-4 lg:px-8 flex items-center justify-between gap-4">
      <button onClick={() => setActiveView('create')} aria-label="Aura, về trang tạo video" className="shrink-0">
        <Wordmark className="text-xl lg:text-[1.4rem]" />
      </button>

      {/* Menu chính trên máy tính: chữ có gạch chân như tạp chí thời trang */}
      <nav className="hidden lg:flex items-center gap-9 h-full">
        {NAV_ITEMS.map(({ id, label }) => {
          const active = activeView === id
          return (
            <button
              key={id}
              onClick={() => setActiveView(id)}
              aria-current={active ? 'page' : undefined}
              className={`relative h-full text-sm font-medium transition-colors ${
                active ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              {label}
              <span
                className={`absolute left-0 right-0 -bottom-px h-[2px] rounded-full bg-[var(--text-main)] transition-transform duration-300 origin-center ${
                  active ? 'scale-x-100' : 'scale-x-0'
                }`}
              />
            </button>
          )
        })}
      </nav>

      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Số dư: luôn hiện, bấm để nạp */}
        <button
          onClick={onOpenDeposit}
          title="Nạp credit"
          aria-label={`Số dư ${formatNumber(walletCredits)} credit, bấm để nạp`}
          className="flex items-center gap-2 h-10 pl-1.5 pr-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-strong)] transition-colors"
        >
          <span className="w-7 h-7 rounded-full bg-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center">
            <Wallet className="w-4 h-4" />
          </span>
          <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
            {formatNumber(walletCredits)}
            <span className="hidden sm:inline font-normal text-[var(--text-muted)]"> credit</span>
          </span>
          <span className="h-7 px-2.5 sm:px-3 rounded-full bg-[var(--ink)] text-[var(--on-ink)] text-xs font-semibold flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nạp</span>
          </span>
        </button>

        {/* Quản trị hệ thống (chỉ admin thấy) */}
        {isAdmin && (
          <button
            onClick={() => setActiveView('admin')}
            className={`h-10 px-3 sm:px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              activeView === 'admin'
                ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                : 'bg-rose-500/10 text-rose-600 border-rose-500/20 hover:bg-rose-500/20'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Admin</span>
          </button>
        )}

        {/* Tài khoản: giao diện sáng/tối, kiểm tra hệ thống, đăng xuất */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Tài khoản"
            aria-expanded={menuOpen}
            className="w-10 h-10 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] font-display text-lg font-semibold flex items-center justify-center ring-1 ring-[var(--accent-border)] hover:ring-[var(--accent-color)] transition"
          >
            {initial}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 w-72 card p-2 animate-scale-in origin-top-right">
              <div className="px-3 pt-2 pb-3 border-b border-[var(--border-subtle)] mb-1">
                <div className="font-semibold truncate">{userName}</div>
                <div className="text-sm text-[var(--text-muted)] truncate">{userEmail}</div>
              </div>
              <button
                className={menuItem}
                onClick={() => {
                  onToggleTheme()
                  setMenuOpen(false)
                }}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
              </button>
              {isAdmin && (
                <button
                  className={menuItem}
                  onClick={() => {
                    setMenuOpen(false)
                    setActiveView('admin')
                  }}
                >
                  <ShieldCheck className="w-4 h-4 text-rose-500" /> Cài đặt Admin & API
                </button>
              )}
              {onOpenAudit && (
                <button
                  className={menuItem}
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenAudit()
                  }}
                >
                  <ShieldCheck className="w-4 h-4" /> Kiểm tra hệ thống
                </button>
              )}
              <button
                className={menuItem}
                onClick={() => {
                  setMenuOpen(false)
                  onLogout()
                }}
              >
                <LogOut className="w-4 h-4" /> Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
