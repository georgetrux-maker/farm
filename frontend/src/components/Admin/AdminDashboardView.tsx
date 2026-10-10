import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { fetchAdminStatsOverview, type AdminStatsOverview } from '../../services/api'
import { AvatarManager } from './AvatarManager'
import { DepositsTab } from './DepositsTab'
import { OverviewTab } from './OverviewTab'
import { SettingsTab } from './SettingsTab'

type Tab = 'overview' | 'deposits' | 'models' | 'settings'

/** Trang quản trị độc lập: chỉ App mở cho tài khoản admin (máy chủ cũng chặn mọi API admin với tài khoản thường). */
export const AdminDashboardView: React.FC = () => {
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<AdminStatsOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback(() => {
    setError(null)
    fetchAdminStatsOverview()
      .then(setStats)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    const id = setTimeout(loadStats, 0)
    return () => clearTimeout(id)
  }, [loadStats])

  const pending = stats?.summary.pending_deposits ?? 0
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Tổng quan' },
    { id: 'deposits', label: 'Nạp tiền', badge: pending },
    { id: 'models', label: 'Người mẫu AI' },
    { id: 'settings', label: 'Cài đặt API' },
  ]

  return (
    <div className="flex-1 h-full overflow-y-auto text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Quản trị hệ thống
            </p>
            <h1 className="display text-3xl sm:text-4xl mt-1.5">Admin</h1>
          </div>
          <button onClick={loadStats} className="btn btn-ghost btn-sm" aria-label="Tải lại số liệu">
            <RefreshCw className="w-4 h-4" /> Làm mới
          </button>
        </div>

        <div className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)] overflow-x-auto no-scrollbar w-full sm:w-fit" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                tab === t.id ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
              }`}
            >
              {t.label}
              {!!t.badge && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-[var(--accent-color)] text-[var(--on-accent)] text-[11px] leading-5 text-center">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'overview' &&
          (error ? (
            <p className="text-sm text-[var(--danger-text)]">
              {error}{' '}
              <button onClick={loadStats} className="underline font-semibold">
                Thử lại
              </button>
            </p>
          ) : stats ? (
            <OverviewTab stats={stats} onOpenDeposits={() => setTab('deposits')} />
          ) : (
            <div className="skeleton h-96 rounded-3xl" />
          ))}
        {tab === 'deposits' && <DepositsTab onChanged={loadStats} />}
        {tab === 'models' && <AvatarManager />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </div>
  )
}
