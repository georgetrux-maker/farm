import React, { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Coins, Film, LayoutGrid, Package, Play, Send, Wand2 } from 'lucide-react'
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
}

const VND_PER_CREDIT = 100

const STEPS = [
  { title: 'Thêm sản phẩm', text: 'Dán link Shopee, TikTok Shop hoặc tải ảnh sản phẩm lên' },
  { title: 'Chọn người mẫu & giọng đọc', text: 'Chọn phong cách, sửa kịch bản AI viết sẵn nếu muốn' },
  { title: 'Nhận video & đăng bán', text: 'Tải về hoặc đăng thẳng lên TikTok, Facebook' },
]

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
export const HomeView: React.FC<HomeViewProps> = ({ user, credits, onNavigate, onOpenDeposit }) => {
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
        {/* Lời chào + 3 bước */}
        <section className="relative overflow-hidden rounded-[1.5rem] border border-[var(--border-subtle)] bg-[radial-gradient(70%_120%_at_0%_0%,var(--accent-soft),transparent_60%),radial-gradient(50%_80%_at_100%_100%,var(--accent-soft),transparent_70%)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] p-5 sm:p-8 animate-fade-up">
          <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6 lg:gap-10 items-center">
            <div>
              <p className="text-sm font-medium text-[var(--accent-text)]">Xin chào, {user.name}</p>
              <h1 className="display text-[1.75rem] leading-[1.1] sm:text-[2.6rem] mt-2">
                Tạo video thời trang chỉ trong 3 bước
              </h1>
              <p className="text-[var(--text-sub)] mt-3 max-w-lg">
                Từ một tấm ảnh sản phẩm thành video review có người mẫu, lời thoại và phụ đề.
              </p>
              <div className="flex flex-wrap gap-2.5 mt-5">
                <button onClick={() => onNavigate('create')} className="btn btn-primary btn-lg">
                  <Wand2 className="w-4 h-4" /> Tạo video ngay
                </button>
                <button onClick={() => onNavigate('showcase')} className="btn btn-secondary btn-lg">
                  <LayoutGrid className="w-4 h-4" /> Xem thư viện mẫu
                </button>
              </div>
            </div>
            <ol className="divide-y divide-[var(--border-subtle)] rounded-2xl bg-[color-mix(in_srgb,var(--bg-card)_70%,transparent)] border border-[var(--border-subtle)] backdrop-blur-sm">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="flex items-start gap-3.5 p-4 animate-fade-up"
                  style={{ animationDelay: `${120 + i * 80}ms` }}
                >
                  <span className="w-8 h-8 rounded-[10px] bg-[var(--ink)] text-[var(--on-ink)] text-sm font-semibold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{s.title}</p>
                    <p className="text-sm text-[var(--text-muted)]">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
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
              sub: stats && (stats.total_renders > stats.completed_renders
                ? `${formatNumber(stats.total_renders - stats.completed_renders)} video đang tạo hoặc lỗi`
                : 'video hoàn tất'),
            },
            { icon: Package, label: 'Sản phẩm', value: stats ? formatNumber(stats.products_count ?? 0) : '…', sub: 'đã thêm vào kho' },
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
            { icon: Send, label: 'Đã đăng', value: stats ? formatNumber(stats.published_videos) : '…', sub: 'video trên TikTok, Facebook' },
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
