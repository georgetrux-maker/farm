import React from 'react'
import { ArrowRight, Wallet } from 'lucide-react'
import type { AdminStatsOverview, PeriodCounts } from '../../services/api'
import { formatDateTime, formatNumber, formatVnd } from '../../lib/format'

const PERIODS: { key: keyof PeriodCounts; label: string }[] = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'week', label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
  { key: 'total', label: 'Tất cả' },
]

const MetricRow: React.FC<{ title: string; counts: PeriodCounts; format: (n: number) => string }> = ({ title, counts, format }) => (
  <section className="card p-5 sm:p-6">
    <h2 className="eyebrow">{title}</h2>
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5 mt-4">
      {PERIODS.map((p) => (
        <div key={p.key} className="min-w-0">
          <dt className="text-sm text-[var(--text-muted)]">{p.label}</dt>
          <dd className={`display mt-1 truncate ${p.key === 'total' ? 'text-2xl text-[var(--text-sub)]' : 'text-2xl sm:text-3xl'}`}>
            {format(counts[p.key])}
          </dd>
        </div>
      ))}
    </dl>
  </section>
)

export const OverviewTab: React.FC<{ stats: AdminStatsOverview; onOpenDeposits: () => void }> = ({ stats, onOpenDeposits }) => {
  const s = stats.summary
  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up">
      {s.pending_deposits > 0 && (
        <button
          onClick={onOpenDeposits}
          className="w-full card p-4 flex items-center gap-3 text-left border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn-text)] hover:brightness-[0.98]"
        >
          <Wallet className="w-5 h-5 shrink-0" />
          <span className="flex-1 text-sm font-semibold">
            {s.pending_deposits} lệnh nạp tiền đang chờ. Kiểm tra sao kê rồi duyệt tay nếu khách chuyển sai nội dung.
          </span>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </button>
      )}

      <MetricRow title="Doanh thu nạp tiền" counts={s.revenue_vnd} format={formatVnd} />
      <div className="grid lg:grid-cols-2 gap-5 sm:gap-6">
        <MetricRow title="Shop đăng ký mới" counts={s.new_shops} format={formatNumber} />
        <MetricRow title="Video tạo xong" counts={s.completed_videos} format={formatNumber} />
      </div>
      <p className="text-sm text-[var(--text-muted)]">
        Tổng {formatNumber(s.total_jobs)} lượt tạo video · {formatNumber(s.credits_in_wallets)} credit đang nằm trong ví khách
        (≈ {formatVnd(s.credits_in_wallets * 100)}). Mốc ngày/tuần/tháng tính theo giờ Việt Nam.
      </p>

      <section className="card p-5 sm:p-6">
        <h2 className="display text-xl mb-4">Tài khoản mới nhất</h2>
        <ul className="divide-y divide-[var(--border-subtle)]">
          {stats.recent_users.map((u) => (
            <li key={u.id} className="py-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-[var(--bg-surface)] flex items-center justify-center text-sm font-semibold shrink-0">
                {u.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">
                  {u.name}
                  {u.role === 'admin' && (
                    <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-[var(--ink)] text-[var(--on-ink)] align-middle">Admin</span>
                  )}
                </p>
                <p className="text-sm text-[var(--text-muted)] truncate">{u.email || 'Chưa có email'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">{formatNumber(u.credits)} credit</p>
                <p className="text-xs text-[var(--text-muted)]">{formatDateTime(u.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
