import React, { useCallback, useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Clock, Film, Plus, Send, Undo2, Wallet } from 'lucide-react'
import {
  fetchCreditHistory, fetchDashboardStats, fetchStudioOptions, type UserProfile,
} from '../../services/api'
import type { CreditTransaction, DashboardStats } from '../../types'
import { formatDateTime, formatNumber, formatVnd } from '../../lib/format'
import { AvatarManager } from './AvatarManager'

interface StatsViewProps {
  user: UserProfile
  credits: number
  isAdmin: boolean
  onOpenDeposit: () => void
}

type Tab = 'overview' | 'models'

/** "15.0s" (máy chủ trả về) -> "15 giây" */
function formatSeconds(value: string | null): string {
  const sec = value ? parseFloat(value) : NaN
  if (Number.isNaN(sec)) return '—'
  return sec >= 90 ? `${Math.round(sec / 60)} phút` : `${Math.round(sec)} giây`
}

function txLabel(t: CreditTransaction) {
  if (t.transaction_type === 'deposit') return `Nạp tiền ${t.amount_vnd ? formatVnd(t.amount_vnd) : ''}`.trim()
  if (t.transaction_type === 'refund')
    return t.description?.includes('hủy') ? 'Hoàn credit: bạn hủy ở bước duyệt ảnh' : 'Hoàn credit: video bị lỗi'
  return t.description || 'Tạo video'
}

const Kpi: React.FC<{
  icon: React.ElementType
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  className?: string
}> = ({ icon: Icon, label, value, sub, className = '' }) => (
  <div className={`card p-5 ${className}`}>
    <div className="flex items-start justify-between gap-2">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className="w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </span>
    </div>
    <div className="font-display text-3xl sm:text-4xl font-semibold mt-1 tabular-nums">{value}</div>
    {sub && <div className="text-sm text-[var(--text-muted)] mt-1">{sub}</div>}
  </div>
)

/** Thống kê của người dùng: số video, số dư, lịch sử credit; quản trị viên có thêm mục người mẫu. */
export const StatsView: React.FC<StatsViewProps> = ({ user, credits, isAdmin, onOpenDeposit }) => {
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [history, setHistory] = useState<CreditTransaction[] | null>(null)
  const [videoCost, setVideoCost] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    fetchDashboardStats()
      .then(setStats)
      .catch((e) => setError(e.message))
    fetchStudioOptions()
      .then((o) => setVideoCost(o.pipeline_cost_credits))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [load])

  // Tải lịch sử credit lúc mở trang và mỗi khi số dư đổi (vừa nạp tiền, tạo video, được hoàn)
  useEffect(() => {
    const id = setTimeout(() => {
      fetchCreditHistory()
        .then(setHistory)
        .catch(() => setHistory((h) => h ?? []))
    }, 0)
    return () => clearTimeout(id)
  }, [credits])

  const maxCount = Math.max(1, ...(stats?.weekly_chart.map((d) => d.count) ?? [0]))
  const weekTotal = stats?.weekly_chart.reduce((sum, d) => sum + d.count, 0) ?? 0
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Tổng quan' },
    ...(isAdmin ? [{ id: 'models' as const, label: 'Người mẫu AI' }] : []),
  ]

  return (
    <div className="flex-1 h-full overflow-y-auto text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="eyebrow">Tổng quan</p>
            <h1 className="display text-3xl sm:text-4xl mt-1.5">Thống kê</h1>
            <p className="text-[var(--text-muted)] mt-2 truncate">
              {user.name} · {user.email}
            </p>
          </div>
          {tabs.length > 1 && (
            <div className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)]" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                    tab === t.id ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {tab === 'models' && isAdmin && <AvatarManager />}

        {tab === 'overview' && (
          <div className="space-y-5 sm:space-y-6 animate-fade-up">
            {error && (
              <p className="text-sm text-[var(--danger-text)]">
                {error}{' '}
                <button onClick={load} className="underline font-semibold">
                  Thử lại
                </button>
              </p>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
              {/* Thẻ ví: nổi bật nhất */}
              <div className="col-span-2 lg:col-span-1 rounded-[1.25rem] p-5 bg-[var(--ink)] text-[var(--on-ink)] shadow-[var(--shadow-pop)] flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm opacity-75">Số dư ví</span>
                  <span className="w-8 h-8 rounded-full bg-[#D4B27A]/25 text-[#D4B27A] flex items-center justify-center">
                    <Wallet className="w-4 h-4" />
                  </span>
                </div>
                <div className="font-display text-4xl font-semibold mt-1 tabular-nums">
                  {formatNumber(credits)} <span className="text-lg font-normal opacity-75">credit</span>
                </div>
                {videoCost ? (
                  <div className="text-sm opacity-75 mt-1">Đủ tạo khoảng {formatNumber(Math.floor(credits / videoCost))} video</div>
                ) : null}
                <button
                  onClick={onOpenDeposit}
                  className="btn btn-sm mt-4 self-start bg-[var(--on-ink)] text-[var(--ink)] hover:opacity-90"
                >
                  <Plus className="w-4 h-4" /> Nạp thêm
                </button>
              </div>
              <Kpi
                icon={Film}
                label="Video đã tạo"
                value={stats ? formatNumber(stats.total_renders) : '…'}
                sub={stats && `${formatNumber(stats.completed_renders)} video hoàn tất`}
              />
              <Kpi
                icon={Send}
                label="Đã đăng lên mạng"
                value={stats ? formatNumber(stats.published_videos) : '…'}
                sub="video trên TikTok, Facebook"
              />
              <Kpi
                className="col-span-2 lg:col-span-1"
                icon={Clock}
                label="Thời gian tạo"
                value={stats ? formatSeconds(stats.avg_render_time) : '…'}
                sub="trung bình mỗi video"
              />
            </div>

            <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5 sm:gap-6">
              <section className="card p-5 sm:p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="display text-xl">7 ngày qua</h2>
                  <span className="text-sm text-[var(--text-muted)]">{formatNumber(weekTotal)} video</span>
                </div>
                {!stats ? (
                  <div className="skeleton rounded-2xl h-48 mt-5" />
                ) : (
                  <div className="h-48 flex items-end gap-2 sm:gap-4 mt-5" role="img" aria-label="Biểu đồ số video theo ngày">
                    {stats.weekly_chart.map((d, i) => {
                      const today = i === stats.weekly_chart.length - 1
                      return (
                        <div key={d.date} className="flex-1 h-full flex flex-col items-center justify-end gap-2">
                          <span className="text-xs font-semibold tabular-nums">{d.count || ''}</span>
                          <div
                            className={`w-full max-w-11 rounded-full transition-all duration-700 ${
                              d.count ? 'bg-gradient-to-t from-[var(--accent-color)] to-[var(--gold)]' : 'bg-[var(--bg-surface)]'
                            }`}
                            style={{ height: d.count ? `${Math.max(8, (d.count / maxCount) * 100)}%` : '6px' }}
                            title={`${d.count} video`}
                          />
                          <span
                            className={`text-xs whitespace-nowrap ${
                              today ? 'font-semibold text-[var(--text-main)]' : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {today ? 'Hôm nay' : d.day}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="card p-5 sm:p-6">
                <h2 className="display text-xl mb-3">Lịch sử credit</h2>
                {!history ? (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton rounded-xl h-10" />
                    ))}
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">Chưa có giao dịch nào.</p>
                ) : (
                  <ul className="divide-y divide-[var(--border-subtle)] max-h-80 overflow-y-auto -mx-1 px-1">
                    {history.map((t) => {
                      const plus = t.amount_credits > 0
                      const Icon = t.transaction_type === 'refund' ? Undo2 : plus ? ArrowDownLeft : ArrowUpRight
                      return (
                        <li key={t.id} className="py-3 flex items-center gap-3 text-sm">
                          <span
                            className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${
                              plus ? 'bg-[var(--ok-bg)] text-[var(--ok-text)]' : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{txLabel(t)}</div>
                            <div className="text-xs text-[var(--text-muted)]">
                              {formatDateTime(t.created_at)}
                              {t.status === 'pending' && <span className="text-[var(--warn-text)]"> · Chờ tiền về</span>}
                            </div>
                          </div>
                          <span
                            className={`font-semibold tabular-nums whitespace-nowrap ${
                              t.status === 'pending'
                                ? 'text-[var(--text-muted)]'
                                : plus
                                  ? 'text-[var(--ok-text)]'
                                  : 'text-[var(--text-main)]'
                            }`}
                          >
                            {plus ? '+' : ''}
                            {formatNumber(t.amount_credits)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
