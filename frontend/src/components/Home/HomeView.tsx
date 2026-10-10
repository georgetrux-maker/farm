import React, { useCallback, useEffect, useState } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Clapperboard, Coins, Eye, Film, LayoutGrid, Package, Play, UserRound, Wand2, Zap } from 'lucide-react'
import { fetchDashboardStats, fetchMyVideos, fetchStudioOptions, type UserProfile } from '../../services/api'
import type { DashboardStats, MyVideo } from '../../types'
import { formatDateTime, formatNumber, formatVnd } from '../../lib/format'
import type { View } from '../../lib/navigation'
import { ColumnChart, type ColumnPoint } from '../ui/ColumnChart'
import { HangerArt } from '../ui/GarmentArt'
import { StatStrip } from '../ui/StatStrip'
import { StatusBadge } from '../ui/StatusBadge'

interface HomeViewProps {
  user: UserProfile
  credits: number
  onNavigate: (view: View) => void
  onOpenDeposit: () => void
  /** Mở Tạo video ở chế độ Tự động */
  onStartAuto: () => void
}

const VND_PER_CREDIT = 100


/** Thay đổi 7 ngày gần nhất so với 7 ngày trước đó: mũi tên + phần trăm (không chỉ dựa vào màu) */
const WeekTrend: React.FC<{ trend?: { week: number; prev_week: number }; unit: string }> = ({ trend, unit }) => {
  if (!trend || (!trend.week && !trend.prev_week)) return <>chưa có {unit} mới tuần này</>
  if (!trend.prev_week) return <>+{formatNumber(trend.week)} {unit} trong 7 ngày</>
  const pct = Math.round(((trend.week - trend.prev_week) / trend.prev_week) * 100)
  const up = pct >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center font-semibold ${up ? 'text-[var(--ok-text)]' : 'text-[var(--danger-text)]'}`}>
        <Icon className="w-3.5 h-3.5" />
        {up ? '+' : ''}
        {pct}%
      </span>
      so với tuần trước
    </span>
  )
}

/** "Th 2" -> "Thứ 2", "CN" -> "Chủ nhật" */
const fullDay = (short: string) => (short === 'CN' ? 'Chủ nhật' : short.replace('Th ', 'Thứ '))

function weeklyPoints(stats: DashboardStats): ColumnPoint[] {
  const last = stats.weekly_chart.length - 1
  return stats.weekly_chart.map((d, i) => {
    const [, mm, dd] = d.date.split('-')
    return {
      key: d.date,
      label: i === last ? 'Hôm nay' : d.day,
      fullLabel: `${i === last ? 'Hôm nay' : fullDay(d.day)}, ${dd}/${mm}`,
      value: d.count,
    }
  })
}

/** Trang chủ của shop: lời chào, 3 bước tạo video, số liệu nhanh, video gần đây, hoạt động 7 ngày. */
export const HomeView: React.FC<HomeViewProps> = ({ user, credits, onNavigate, onOpenDeposit, onStartAuto }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recent, setRecent] = useState<MyVideo[] | null>(null)
  const [videoCost, setVideoCost] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    fetchDashboardStats()
      .then(setStats)
      .catch((e) => setError(e.message))
    fetchMyVideos({ pageSize: 4, sort: 'newest' })
      .then((page) => setRecent(page.items))
      .catch(() => setRecent([]))
    fetchStudioOptions()
      .then((o) => setVideoCost(o.pipeline_cost_credits))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [load])

  const weekTotal = stats?.weekly_chart.reduce((sum, d) => sum + d.count, 0) ?? 0

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6">
        {/* Lời chào + hai cách tạo video */}
        <section className="relative overflow-hidden rounded-[1.5rem] border border-[var(--border-subtle)] bg-[radial-gradient(70%_120%_at_0%_0%,var(--accent-soft),transparent_60%),radial-gradient(50%_80%_at_100%_100%,var(--accent-soft),transparent_70%)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] p-5 sm:p-8 animate-fade-up">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-6 lg:gap-10 items-center">
            <div>
              <p className="text-sm font-medium text-[var(--accent-text)]">Xin chào, {user.name}</p>
              <h1 className="display text-[1.75rem] leading-[1.1] sm:text-[2.6rem] mt-2">Bắt đầu tạo video</h1>
              <p className="text-[var(--text-sub)] mt-3 max-w-lg">
                Từ một tấm ảnh sản phẩm thành video review có người mẫu, bối cảnh, lời thoại và phụ đề.
              </p>
              <button onClick={() => onNavigate('showcase')} className="btn btn-secondary mt-5">
                <LayoutGrid className="w-4 h-4" /> Xem thư viện mẫu
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                {
                  icon: Zap,
                  title: 'Auto Mode',
                  text: 'Tải ảnh hoặc dán link, chọn phong cách và bối cảnh. AI lo người mẫu, lời review, giọng đọc.',
                  cta: 'Tạo nhanh',
                  onClick: onStartAuto,
                  primary: true,
                },
                {
                  icon: Clapperboard,
                  title: 'Pro Studio',
                  text: 'Dựng video nhiều cảnh: mỗi cảnh một bối cảnh và chuyển động, thêm hiệu ứng chuyển cảnh.',
                  cta: 'Mở Pro Studio',
                  onClick: () => onNavigate('studio'),
                  primary: false,
                },
              ].map((m, i) => (
                <button
                  key={m.title}
                  onClick={m.onClick}
                  className="group text-left rounded-2xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-card)_80%,transparent)] backdrop-blur-sm p-4 sm:p-5 flex flex-col gap-3 hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition animate-fade-up"
                  style={{ animationDelay: `${120 + i * 80}ms` }}
                >
                  <span
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      m.primary ? 'bg-[var(--ink)] text-[var(--on-ink)]' : 'bg-[var(--accent-soft)] text-[var(--accent-text)]'
                    }`}
                  >
                    <m.icon className="w-5 h-5" />
                  </span>
                  <span>
                    <span className="title text-lg block">{m.title}</span>
                    <span className="text-sm text-[var(--text-muted)] block mt-1">{m.text}</span>
                  </span>
                  <span className="mt-auto text-sm font-semibold text-[var(--accent-text)] inline-flex items-center gap-1">
                    {m.cta} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {error && (
          <p className="text-sm text-[var(--danger-text)]">
            {error}{' '}
            <button onClick={load} className="underline font-semibold">
              Thử lại
            </button>
          </p>
        )}

        {/* Số liệu nhanh: một khung, ngăn bằng vạch mảnh */}
        <StatStrip
          items={[
            {
              icon: Film,
              label: 'Video đã tạo',
              value: stats ? formatNumber(stats.completed_renders) : '…',
              sub: stats && <WeekTrend trend={stats.trends?.videos} unit="video" />,
            },
            {
              icon: Eye,
              label: 'Lượt xem feed',
              value: stats ? formatNumber(stats.feed_views ?? 0) : '…',
              sub: stats && (stats.feed_videos ? `${formatNumber(stats.feed_videos)} video đang trên feed` : 'Bật "Hiện trên feed" ở video'),
              action: (
                <button onClick={() => onNavigate('feed')} className="text-sm font-semibold text-[var(--accent-text)] inline-flex items-center gap-1 group">
                  Xem feed <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              ),
            },
            {
              icon: Package,
              label: 'Sản phẩm',
              value: stats ? formatNumber(stats.products_count ?? 0) : '…',
              sub: stats && <WeekTrend trend={stats.trends?.products} unit="sản phẩm" />,
            },
            {
              icon: UserRound,
              label: 'Người mẫu AI',
              value: stats ? formatNumber(stats.models_count ?? 0) : '…',
              sub: stats && (stats.private_models_count ? `${formatNumber(stats.private_models_count)} mẫu riêng của shop` : 'dùng chung cho mọi shop'),
              action: (
                <button onClick={() => onNavigate('models')} className="text-sm font-semibold text-[var(--accent-text)] inline-flex items-center gap-1 group">
                  Xem kho mẫu <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              ),
            },
            {
              icon: Coins,
              label: 'Credits',
              value: formatNumber(credits),
              sub: (
                <>
                  ≈ {formatVnd(credits * VND_PER_CREDIT)}
                  {videoCost ? `, đủ ${formatNumber(Math.floor(credits / videoCost))} video` : ''}
                </>
              ),
              action: (
                <button onClick={onOpenDeposit} className="text-sm font-semibold text-[var(--accent-text)] inline-flex items-center gap-1 group">
                  Nạp thêm <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </button>
              ),
            },
          ]}
        />

        <div className="grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-5 sm:gap-6">
          {/* Video gần đây */}
          <section className="card p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="title text-lg">Video gần đây</h2>
              <button
                onClick={() => onNavigate('videos')}
                className="text-sm font-semibold text-[var(--accent-text)] inline-flex items-center gap-1"
              >
                Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {!recent ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton rounded-2xl aspect-[3/4]" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="flex flex-col items-center text-center py-8 gap-3">
                <HangerArt className="w-20 text-[var(--accent-text)]" />
                <p className="text-[var(--text-muted)]">Bạn chưa tạo video nào.</p>
                <button onClick={() => onNavigate('create')} className="btn btn-primary btn-sm">
                  <Wand2 className="w-4 h-4" /> Tạo video đầu tiên
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {recent.map((v, i) => {
                  const thumb = v.output_image_url || v.product_image_url
                  return (
                    <button
                      key={v.job_id}
                      onClick={() => onNavigate('videos')}
                      style={{ animationDelay: `${i * 70}ms` }}
                      className="group text-left rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:-translate-y-0.5 transition-[transform,border-color] duration-300 animate-fade-up"
                    >
                      <div className="relative aspect-[3/4] overflow-hidden">
                        {thumb ? (
                          <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
                            <Film className="w-8 h-8" />
                          </div>
                        )}
                        {v.status === 'completed' && v.output_video_url && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="w-10 h-10 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-sm">
                              <Play className="w-4 h-4 fill-current" />
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-sm font-medium truncate">{v.product_title || 'Sản phẩm chưa đặt tên'}</p>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-xs text-[var(--text-muted)] truncate">{formatDateTime(v.created_at)}</span>
                          <StatusBadge status={v.status} />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Hoạt động 7 ngày */}
          <section className="card p-4 sm:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="title text-lg">Video tạo 7 ngày qua</h2>
              <span className="text-sm text-[var(--text-muted)] whitespace-nowrap">{formatNumber(weekTotal)} video</span>
            </div>
            <div className="mt-3">
              {!stats ? (
                <div className="skeleton rounded-2xl h-52" />
              ) : (
                <ColumnChart
                  points={weeklyPoints(stats)}
                  measure="Số video"
                  formatValue={(n) => `${formatNumber(n)} video`}
                  formatTick={formatNumber}
                  emptyText="Chưa tạo video nào tuần này"
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
