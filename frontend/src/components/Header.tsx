import React from 'react'
import { Sparkles, Layers, QrCode, CheckCircle2, Video, Sun, Moon, LayoutDashboard } from 'lucide-react'

interface HeaderProps {
  activeView: 'split' | 'studio' | 'tryon' | 'dashboard'
  setActiveView: (view: 'split' | 'studio' | 'tryon' | 'dashboard') => void
  walletCredits: number
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onOpenDeposit: () => void
  onOpenAudit: () => void
}

export const Header: React.FC<HeaderProps> = ({
  activeView,
  setActiveView,
  walletCredits,
  theme,
  onToggleTheme,
  onOpenDeposit,
  onOpenAudit,
}) => {
  return (
    <header className="h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/90 backdrop-blur-md px-6 flex items-center justify-between z-30 shrink-0 transition-colors duration-200">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[var(--accent-color)] to-[var(--accent-color)]/70 flex items-center justify-center text-black font-extrabold text-sm shadow-[0_0_15px_var(--accent-glow)]">
          A
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-base tracking-wider text-[var(--text-main)]">AURA</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--accent-color)] border border-[var(--accent-color)]/30 font-medium">
              V2.5 PRO
            </span>
          </div>
          <span className="text-[10px] text-[var(--text-muted)] font-medium tracking-tight">Fashion AI Studio & Shoppable VTON</span>
        </div>
      </div>

      {/* View Switcher (4 Navigation Modes) */}
      <div className="flex items-center bg-[var(--bg-surface)] p-1 rounded-xl border border-[var(--border-subtle)]">
        <button
          onClick={() => setActiveView('split')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === 'split'
              ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-subtle)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-[var(--accent-color)]" />
          <span>Song Song</span>
        </button>
        <button
          onClick={() => setActiveView('studio')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === 'studio'
              ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-subtle)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-[var(--accent-color)]" />
          <span>n8n Studio</span>
        </button>
        <button
          onClick={() => setActiveView('dashboard')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === 'dashboard'
              ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-subtle)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5 text-[var(--accent-color)]" />
          <span>Dashboard & Cài Đặt</span>
        </button>
        <button
          onClick={() => setActiveView('tryon')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeView === 'tryon'
              ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-subtle)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
          }`}
        >
          <Video className="w-3.5 h-3.5 text-[var(--accent-color)]" />
          <span>Shoppable Player</span>
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Light / Dark Mode Toggle */}
        <button
          onClick={onToggleTheme}
          className="w-8 h-8 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-main)] transition-all shadow-sm"
          title={theme === 'dark' ? 'Chuyển sang chế độ Sáng (Light)' : 'Chuyển sang chế độ Tối (Dark)'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-500 hover:-rotate-12 transition-transform" />
          )}
        </button>

        {/* Kiểm tra hệ thống */}
        <button
          onClick={onOpenAudit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30 text-[var(--accent-color)] hover:bg-[var(--accent-color)]/20 transition-all text-xs font-mono font-medium"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Kiểm Tra Hệ Thống</span>
        </button>

        {/* Wallet Pill */}
        <div className="flex items-center gap-2 pl-3 border-l border-[var(--border-subtle)]">
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-[var(--text-muted)] uppercase font-mono">Ví Số Dư</span>
            <span className="text-xs font-mono font-bold text-[var(--text-main)] tracking-wide">
              {walletCredits.toLocaleString()} <span className="text-[var(--accent-color)]">CR</span>
            </span>
          </div>
          <button
            onClick={onOpenDeposit}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-main)] transition-all shadow-sm"
          >
            <QrCode className="w-3.5 h-3.5 text-[var(--accent-color)]" />
            <span>Nạp VietQR</span>
          </button>
        </div>
      </div>
    </header>
  )
}
