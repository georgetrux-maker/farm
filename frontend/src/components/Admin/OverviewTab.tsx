import React from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, Wallet } from 'lucide-react'
import type { AdminStatsOverview } from '../../services/api'
import { compactVnd, formatDateTime, formatNumber, formatVnd } from '../../lib/format'
import { ColumnChart, type ColumnPoint } from '../ui/ColumnChart'
import { DonutChart } from '../ui/DonutChart'

interface OverviewTabProps {
  stats: AdminStatsOverview
  days: number
  onDaysChange: (days: number) => void
  /** Đang tải lại theo khoảng ngày mới: giữ số cũ, làm mờ */
  refreshing: boolean
  onOpenTransactions: () => void
  onOpenUsers: () => void
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const WEEKDAYS_FULL = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

function points(dates: string[], values: number[]): ColumnPoint[] {
  const last = dates.length - 1
  return dates.map((iso, i) => {
    const [y, m, d] = iso.split('-').map(Number)
    const weekday = new Date(y, m - 1, d).getDay()
    const short = dates.length > 10 ? `${d}/${m}` : WEEKDAYS[weekday]
    return {
      key: iso,
      label: i === last ? 'Hôm nay' : short,
      fullLabel: `${i === last ? 'Hôm nay' : WEEKDAYS_FULL[weekday]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
      value: values[i] ?? 0,
    }
  })
}

/** So với kỳ trước: mũi tên + phần trăm có dấu (không chỉ dựa vào màu) */
const Delta: React.FC<{ now: number; before: number; period: string }> = ({ now, before, period }) => {
  if (!before) {
    return <span className="text-xs text-[var(--text-muted)]">{now ? `Tăng từ 0 so với ${period}` : `Bằng ${period}`}</span>
  }
  const pct = Math.round(((now - before) / before) * 100)
  const tone = pct > 0 ? 'text-[var(--ok-text)]' : pct < 0 ? 'text-[var(--danger-text)]' : 'text-[var(--text-muted)]'
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus
  return (
    <span className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1 flex-wrap">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${tone}`}>
        <Icon className="w-3.5 h-3.5" />
        {pct > 0 ? '+' : ''}
        {pct}%
      </span>
      so với {period}
    </span>
  )
}

const Kpi: React.FC<{ label: string; value: string; delta: React.ReactNode }> = ({ label, value, delta }) => (
  <div className="card p-4 sm:p-5">
    <p className="text-sm text-[var(--text-muted)]">{label}</p>
    <p className="text-2xl sm:text-[1.75rem] font-semibold mt-1.5 truncate">{value}</p>
    <div className="mt-1.5">{delta}</div>
  </div>
)

export const OverviewTab: React.FC<OverviewTabProps> = ({
  stats, days, onDaysChange, refreshing, onOpenTransactions, onOpenUsers,
}) => {
  const s = stats.summary
  const p = stats.previous
  const sources = stats.revenue_sources
  const revenueTotal = stats.series.revenue_vnd.reduce((a, b) => a + b, 0)
  const videoTotal = stats.series.completed_videos.reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-up">
      {s.pending_deposits > 0 && (
        <button
          onClick={onOpenTransactions}
          className="w-full card p-4 flex items-center gap-3 text-left border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn-text)] hover:brightness-[0.98]"
        >
          <Wallet className="w-5 h-5 shrink-0" />
          <span className="flex-1 text-sm font-semibold">
            {s.pending_deposits} lệnh nạp tiền đang chờ. Kiểm tra sao kê rồi duyệt tay nếu khách chuyển sai nội dung.
          </span>
          <ArrowRight className="w-4 h-4 shrink-0" />
        </button>
      )}

      {/* Số liệu chính, so với kỳ trước (giờ Việt Nam) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Kpi
          label="Doanh thu hôm nay"
          value={formatVnd(s.revenue_vnd.today)}
          delta={<Delta now={s.revenue_vnd.today} before={p.revenue_today} period="hôm qua" />}
        />
        <Kpi
          label="Doanh thu tháng này"
          value={formatVnd(s.revenue_vnd.month)}
          delta={<Delta now={s.revenue_vnd.month} before={p.revenue_month} period="cùng kỳ tháng trước" />}
        />
        <Kpi
          label="Shop mới tháng này"
          value={formatNumber(s.new_shops.month)}
          delta={<Delta now={s.new_shops.month} before={p.new_shops_month} period="cùng kỳ tháng trước" />}
        />
        <Kpi
          label="Video hoàn tất tháng này"
          value={formatNumber(s.completed_videos.month)}
          delta={<Delta now={s.completed_videos.month} before={p.completed_videos_month} period="cùng kỳ tháng trước" />}
        />
      </div>
      <p className="text-sm text-[var(--text-muted)]">
        Tất cả: {formatVnd(s.revenue_vnd.total)} doanh thu · {formatNumber(s.new_shops.total)} shop · {formatNumber(s.total_jobs)} lượt
        tạo video · {formatNumber(s.credits_in_wallets)} credit đang trong ví khách (≈ {formatVnd(s.credits_in_wallets * 100)}).
      </p>

      {/* Bộ lọc khoảng ngày: áp dụng cho mọi biểu đồ bên dưới */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-[var(--text-sub)]">Khoảng thời gian</span>
        <div className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)]" role="group" aria-label="Khoảng thời gian">
          {[7, 30].map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              aria-pressed={days === d}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                days === d ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
              }`}
            >
              {d} ngày
            </button>
          ))}
        </div>
      </div>

      <div className={`space-y-5 sm:space-y-6 transition-opacity ${refreshing ? 'opacity-50' : ''}`}>
        <div className="grid lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] gap-5 sm:gap-6">
          <section className="card p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="display text-xl">Doanh thu {days} ngày</h2>
              <span className="text-sm font-semibold">{formatVnd(revenueTotal)}</span>
            </div>
            <div className="mt-3">
              <ColumnChart
                points={points(stats.series.dates, stats.series.revenue_vnd)}
                measure="Doanh thu"
                formatValue={formatVnd}
                formatTick={compactVnd}
                plotHeight={200}
                emptyText="Chưa có doanh thu trong khoảng này"
              />
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="display text-xl">Nguồn doanh thu</h2>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">{days} ngày gần nhất</p>
            <div className="mt-4">
              <DonutChart
                centerLabel={`Tổng ${days} ngày`}
                formatValue={compactVnd}
                emptyText="Chưa có doanh thu"
                slices={[
                  { key: 'sepay', label: 'Tự động (SePay)', value: sources.sepay ?? 0, color: 'var(--viz-1)' },
                  { key: 'manual', label: 'Duyệt tay', value: sources.manual ?? 0, color: 'var(--viz-2)' },
                  { key: 'other', label: 'Khác', value: sources.other ?? 0, color: 'var(--viz-other)' },
                ]}
              />
            </div>
          </section>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] gap-5 sm:gap-6">
          <section className="card p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="display text-xl">Video hoàn tất {days} ngày</h2>
              <span className="text-sm font-semibold">{formatNumber(videoTotal)} video</span>
            </div>
            <div className="mt-3">
              <ColumnChart
                points={points(stats.series.dates, stats.series.completed_videos)}
                measure="Video hoàn tất"
                formatValue={(n) => `${formatNumber(n)} video`}
                formatTick={formatNumber}
                emptyText="Chưa có video nào trong khoảng này"
              />
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="display text-xl">Tài khoản mới</h2>
              <button onClick={onOpenUsers} className="text-sm font-semibold text-[var(--accent-text)] inline-flex items-center gap-1">
                Tất cả <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {stats.recent_users.slice(0, 6).map((u) => (
                <li key={u.id} className="py-2.5 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center text-sm font-semibold shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{u.name}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{u.email || 'Chưa có email'}</p>
                  </div>
                  <span className="text-xs text-[var(--text-muted)] shrink-0">{formatDateTime(u.created_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
