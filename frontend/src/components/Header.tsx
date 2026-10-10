import React, { useEffect, useRef, useState } from 'react'
import { LifeBuoy, Link2, LogOut, Moon, Plus, ShieldCheck, Stethoscope, Sun, Wallet } from 'lucide-react'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { formatNumber, formatVnd } from '../lib/format'
import type { View } from '../lib/navigation'
import type { Palette, ThemeMode } from '../lib/theme'
import { Wordmark } from './ui/Wordmark'

interface HeaderProps {
  activeView: View
  setActiveView: (view: View) => void
  walletCredits: number
  mode: ThemeMode
  palette: Palette
  onModeChange: (mode: ThemeMode) => void
  onPaletteChange: (palette: Palette) => void
  onOpenDeposit: () => void
  onOpenAudit?: () => void
  userName: string
  userEmail: string
  isAdmin?: boolean
  onLogout: () => void
}

const PALETTES: { id: Palette; label: string; swatch: string }[] = [
  { id: 'rose', label: 'Hồng đất', swatch: 'linear-gradient(135deg, #F6F1EB 0 50%, #A8506A 50% 100%)' },
  { id: 'violet', label: 'Tím', swatch: 'linear-gradient(135deg, #F6F5FB 0 50%, #6D4AFF 50% 100%)' },
]

/** Nút chọn kiểu viên thuốc dùng trong menu tài khoản */
function Segment<T extends string>({
  value, options, onChange, label,
}: {
  value: T
  options: { id: T; label: string; icon?: React.ReactNode }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-surface)]">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`h-9 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            value === o.id ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const Header: React.FC<HeaderProps> = ({
  activeView, setActiveView, walletCredits, mode, palette, onModeChange, onPaletteChange, onOpenDeposit, onOpenAudit,
  userName, userEmail, isAdmin, onLogout,
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
  const go = (v: View) => {
    setMenuOpen(false)
    setActiveView(v)
  }

  return (
    <header className="relative z-30 h-14 lg:h-16 shrink-0 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-card)_88%,transparent)] backdrop-blur-md px-4 lg:px-8 flex items-center justify-between gap-4">
      {/* Điện thoại: logo; máy tính: tên shop (logo đã ở menu trái) */}
      <button onClick={() => setActiveView('home')} aria-label="Aura, về trang chủ" className="shrink-0 lg:hidden">
        <Wordmark className="text-xl" />
      </button>
      <div className="hidden lg:flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold flex items-center justify-center shrink-0">
          {initial}
        </span>
        <div className="min-w-0">
          <p className="font-semibold leading-tight truncate">{userName}</p>
          <p className="text-xs text-[var(--text-muted)]">{isAdmin ? 'Quản trị viên' : 'Tài khoản shop'}</p>
        </div>
      </div>

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
            <span className="hidden xl:inline font-normal text-[var(--text-muted)]"> (≈ {formatVnd(walletCredits * 100)})</span>
          </span>
          <span className="h-7 px-2.5 sm:px-3 rounded-full bg-[var(--ink)] text-[var(--on-ink)] text-xs font-semibold flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nạp thêm</span>
          </span>
        </button>

        {/* Quản trị hệ thống: chỉ tài khoản admin thấy (máy tính đã có ở menu trái) */}
        {isAdmin && (
          <button
            onClick={() => setActiveView('admin')}
            aria-label="Quản trị hệ thống"
            aria-current={activeView === 'admin' ? 'page' : undefined}
            className={`lg:hidden h-10 w-10 rounded-full flex items-center justify-center border transition-colors ${
              activeView === 'admin'
                ? 'bg-[var(--ink)] text-[var(--on-ink)] border-[var(--ink)]'
                : 'bg-[var(--bg-card)] text-[var(--gold)] border-[var(--border-subtle)]'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
          </button>
        )}

        {/* Tài khoản: giao diện, tông màu, các trang phụ, đăng xuất */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Tài khoản và giao diện"
            aria-expanded={menuOpen}
            className="w-10 h-10 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] font-display text-lg font-semibold flex items-center justify-center ring-1 ring-[var(--accent-border)] hover:ring-[var(--accent-color)] transition"
          >
            {initial}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 w-80 max-w-[calc(100vw-2rem)] card p-2 animate-scale-in origin-top-right">
              <div className="px-3 pt-2 pb-3 border-b border-[var(--border-subtle)] mb-2">
                <div className="font-semibold truncate">{userName}</div>
                <div className="text-sm text-[var(--text-muted)] truncate">{userEmail}</div>
              </div>
              <div className="px-2 pb-2 space-y-3 border-b border-[var(--border-subtle)] mb-1">
                <div>
                  <p className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">Chế độ</p>
                  <Segment
                    label="Chế độ sáng tối"
                    value={mode}
                    onChange={onModeChange}
                    options={[
                      { id: 'light', label: 'Sáng', icon: <Sun className="w-4 h-4" /> },
                      { id: 'dark', label: 'Tối', icon: <Moon className="w-4 h-4" /> },
                    ]}
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">Tông màu</p>
                  <Segment
                    label="Tông màu"
                    value={palette}
                    onChange={onPaletteChange}
                    options={PALETTES.map((p) => ({
                      id: p.id,
                      label: p.label,
                      icon: <span className="w-4 h-4 rounded-full ring-1 ring-[var(--border-strong)]" style={{ background: p.swatch }} />,
                    }))}
                  />
                </div>
              </div>
              <button className={menuItem} onClick={() => go('connect')}>
                <Link2 className="w-4 h-4" /> Kênh liên kết
              </button>
              <button className={menuItem} onClick={() => go('support')}>
                <LifeBuoy className="w-4 h-4" /> Hỗ trợ
              </button>
              {isAdmin && (
                <button className={menuItem} onClick={() => go('admin')}>
                  <ShieldCheck className="w-4 h-4 text-[var(--gold)]" /> Quản trị hệ thống
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
                  <Stethoscope className="w-4 h-4" /> Kiểm tra hệ thống
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
