import React, { useCallback, useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Clock, Film, Loader2, QrCode, Send, Sparkles, Undo2 } from 'lucide-react'
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

const card = 'rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 sm:p-5'

function txLabel(t: CreditTransaction) {
  if (t.transaction_type === 'deposit') return `Nạp tiền ${t.amount_vnd ? formatVnd(t.amount_vnd) : ''}`.trim()
  if (t.transaction_type === 'refund')
    return t.description?.includes('hủy') ? 'Hoàn credit: bạn hủy ở bước duyệt ảnh' : 'Hoàn credit: video bị lỗi'
  return t.description || 'Tạo video'
}

const Kpi: React.FC<{ icon: React.ElementType; label: string; value: React.ReactNode; sub?: React.ReactNode }> = ({
  icon: Icon,
  label,
  value,
  sub,
}) => (
  <div className={card}>
    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
      <Icon className="w-4 h-4 text-[var(--accent-text)]" /> {label}
    </div>
    <div className="text-2xl font-bold mt-2 tabular-nums">{value}</div>
    {sub && <div className="text-sm text-[var(--text-muted)] mt-0.5">{sub}</div>}
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
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Tổng quan' },
    ...(isAdmin ? [{ id: 'models' as const, label: 'Người mẫu AI' }] : []),
  ]

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[var(--bg-app)] text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-5 sm:py-6 space-y-5">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold">Thống kê</h1>
            <p className="text-sm text-[var(--text-muted)]">
              {user.name} · {user.email}
            </p>
          </div>
          {tabs.length > 1 && (
            <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-surface)] overflow-x-auto max-w-full" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${
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
          <>
            {error && (
              <p className="text-sm text-[var(--danger-text)]">
                {error}{' '}
                <button onClick={load} className="underline font-semibold">
                  Thử lại
                </button>
              </p>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
                sub="video trên TikTok/Facebook"
              />
              <Kpi
                icon={Clock}
                label="Thời gian tạo"
                value={stats ? (stats.avg_render_time ?? '—') : '…'}
                sub="trung bình mỗi video"
              />
              <div className={`${card} flex flex-col`}>
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Sparkles className="w-4 h-4 text-[var(--accent-text)]" /> Số dư
                </div>
                <div className="text-2xl font-bold mt-2 tabular-nums">{formatNumber(credits)} credit</div>
                {videoCost ? (
                  <div className="text-sm text-[var(--text-muted)] mt-0.5">
                    Đủ tạo khoảng {formatNumber(Math.floor(credits / videoCost))} video
                  </div>
                ) : null}
                <button
                  onClick={onOpenDeposit}
                  className="mt-3 self-start px-3 py-2 rounded-lg bg-[var(--accent-color)] text-black text-sm font-semibold flex items-center gap-1.5"
                >
                  <QrCode className="w-4 h-4" /> Nạp thêm
                </button>
              </div>
            </div>

            <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 sm:gap-5">
              <section className={card}>
                <h2 className="font-semibold">Video tạo trong 7 ngày qua</h2>
                {!stats ? (
                  <div className="h-44 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
                  </div>
                ) : (
                  <div className="h-44 flex items-end gap-2 sm:gap-3 mt-4" role="img" aria-label="Biểu đồ số video theo ngày">
                    {stats.weekly_chart.map((d) => (
                      <div key={d.date} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5">
                        <span className="text-xs font-semibold tabular-nums">{d.count || ''}</span>
                        <div
                          className={`w-full max-w-10 rounded-md ${d.count ? 'bg-[var(--accent-color)]' : 'bg-[var(--bg-surface)]'}`}
                          style={{ height: d.count ? `${Math.max(6, (d.count / maxCount) * 100)}%` : '4px' }}
                          title={`${d.count} video`}
                        />
                        <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">{d.day}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className={card}>
                <h2 className="font-semibold mb-2">Lịch sử credit</h2>
                {!history ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
                ) : history.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">Chưa có giao dịch nào.</p>
                ) : (
                  <ul className="divide-y divide-[var(--border-subtle)] max-h-80 overflow-y-auto -mx-1 px-1">
                    {history.map((t) => {
                      const plus = t.amount_credits > 0
                      const Icon = t.transaction_type === 'refund' ? Undo2 : plus ? ArrowDownLeft : ArrowUpRight
                      return (
                        <li key={t.id} className="py-2.5 flex items-center gap-3 text-sm">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${plus ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'}`}
                          />
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
                                  ? 'text-[var(--accent-text)]'
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
          </>
        )}
      </div>
    </div>
  )
}
