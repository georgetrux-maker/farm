import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowUpDown, Download, Film, LayoutGrid, List, Loader2, Play, Plus, RotateCcw, Search, Send, X,
} from 'lucide-react'
import { fetchJobStatus, fetchMyVideos, fetchProfile, fetchStudioOptions } from '../../services/api'
import type { MyVideo, VideoFilter, VideoSort } from '../../types'
import { formatDateTime, formatNumber, formatVnd, videoFileName } from '../../lib/format'
import { isJobBusy } from '../../lib/jobStatus'
import { FacebookLogo, TikTokLogo } from '../ui/BrandLogos'
import { HangerArt } from '../ui/GarmentArt'
import { Modal } from '../ui/Modal'
import { StatusBadge } from '../ui/StatusBadge'
import { useToast } from '../ui/toastContext'
import { TryOnReview } from '../Create/TryOnReview'
import { VideoResult } from '../Create/VideoResult'

interface MyVideosViewProps {
  onCreate: () => void
  onCreditsChange: (credits: number) => void
  /** Mở bước 2 của Tạo video với sản phẩm và cài đặt của video này */
  onRemake: (video: MyVideo) => void
}

type Layout = 'list' | 'grid'
const LAYOUT_KEY = 'aura_videos_layout'

function savedLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

/** Video còn đủ thông tin sản phẩm để tạo lại */
const canRemake = (v: MyVideo) => !!v.product_image_url && !isJobBusy(v.status) && v.status !== 'awaiting_approval'

const PAGE_SIZE = 24

const FILTERS: { id: VideoFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'completed', label: 'Hoàn tất' },
  { id: 'busy', label: 'Đang tạo' },
  { id: 'awaiting_approval', label: 'Chờ duyệt' },
  { id: 'other', label: 'Lỗi / đã hủy' },
]

const SORTS: { id: VideoSort; label: string }[] = [
  { id: 'newest', label: 'Mới nhất' },
  { id: 'oldest', label: 'Cũ nhất' },
  { id: 'title', label: 'Tên sản phẩm A–Z' },
]

const EMPTY_COUNTS: Record<VideoFilter, number> = { all: 0, completed: 0, busy: 0, awaiting_approval: 0, other: 0 }

function titleOf(v: MyVideo) {
  return v.product_title || 'Sản phẩm chưa đặt tên'
}

/** Thư viện video kiểu lookbook: tìm kiếm, lọc, sắp xếp phía máy chủ, tải thêm từng trang;
 *  video đang tạo tự cập nhật tiến độ. */
export const MyVideosView: React.FC<MyVideosViewProps> = ({ onCreate, onCreditsChange, onRemake }) => {
  const toast = useToast()
  const [videos, setVideos] = useState<MyVideo[] | null>(null)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState(EMPTY_COUNTS)
  const [pages, setPages] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<VideoFilter>('all')
  const [sort, setSort] = useState<VideoSort>('newest')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [previewCost, setPreviewCost] = useState(0)
  const [layout, setLayoutState] = useState<Layout>(savedLayout)
  const setLayout = (l: Layout) => {
    setLayoutState(l)
    try {
      localStorage.setItem(LAYOUT_KEY, l)
    } catch {
      // không lưu được thì chỉ áp dụng lần này
    }
  }
  const lastStatus = useRef<Record<string, string>>({})
  const requestId = useRef(0)

  // Gõ xong 0,3 giây mới tìm, tránh gọi máy chủ mỗi lần bấm phím
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  /** Báo khi video vừa đổi trạng thái trong lúc người dùng đang xem trang; trả về true nếu có thay đổi */
  const noteTransitions = useCallback(
    (list: MyVideo[]) => {
      let changed = false
      let refreshCredits = false
      for (const v of list) {
        const before = lastStatus.current[v.job_id]
        if (before && isJobBusy(before) && !isJobBusy(v.status)) {
          changed = true
          if (v.status === 'completed') toast(`Video "${titleOf(v)}" đã tạo xong`, 'success')
          else if (v.status === 'awaiting_approval') toast(`Ảnh thử đồ "${titleOf(v)}" đã xong, chờ bạn duyệt`, 'info')
          else if (v.status === 'failed') {
            toast(`Video "${titleOf(v)}" bị lỗi${v.refunded ? ', credit đã được hoàn' : ''}`, 'error')
            refreshCredits = true
          }
        }
        lastStatus.current[v.job_id] = v.status
      }
      if (refreshCredits) {
        fetchProfile()
          .then((p) => onCreditsChange(p.credits))
          .catch(() => {})
      }
      return changed
    },
    [toast, onCreditsChange],
  )

  /** Tải lại các trang đang hiển thị (sau khi đổi bộ lọc, đóng hộp thoại, hoặc có video vừa xong) */
  const reload = useCallback(
    async (pageCount: number) => {
      const id = ++requestId.current
      setLoading(true)
      try {
        const res = await fetchMyVideos({
          page: 1,
          pageSize: Math.min(100, PAGE_SIZE * pageCount),
          q,
          status: filter,
          sort,
        })
        if (id !== requestId.current) return // đã có yêu cầu mới hơn
        noteTransitions(res.items)
        setVideos(res.items)
        setTotal(res.total)
        setCounts(res.counts)
        setHasMore(res.has_more)
        setPages(Math.max(1, Math.ceil(res.items.length / PAGE_SIZE)))
        setLoadError(null)
      } catch (e: any) {
        if (id === requestId.current) setLoadError(e.message)
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [q, filter, sort, noteTransitions],
  )

  // Đổi từ khóa, bộ lọc hoặc cách sắp xếp: tải lại từ trang đầu
  useEffect(() => {
    const t = setTimeout(() => reload(1), 0)
    return () => clearTimeout(t)
  }, [reload])

  useEffect(() => {
    fetchStudioOptions()
      .then((o) => setPreviewCost(o.tryon_preview_cost_credits))
      .catch(() => {})
  }, [])

  const loadMore = async () => {
    setLoadingMore(true)
    const id = requestId.current
    try {
      const res = await fetchMyVideos({ page: pages + 1, pageSize: PAGE_SIZE, q, status: filter, sort })
      if (id !== requestId.current) return
      noteTransitions(res.items)
      setVideos((list) => {
        const seen = new Set((list ?? []).map((v) => v.job_id))
        return [...(list ?? []), ...res.items.filter((v) => !seen.has(v.job_id))]
      })
      setPages((n) => n + 1)
      setHasMore(res.has_more)
      setTotal(res.total)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  // Video đang tạo: hỏi tiến độ riêng từng video mỗi 4 giây; có video xong thì tải lại danh sách
  const busyIds = (videos ?? []).filter((v) => isJobBusy(v.status)).map((v) => v.job_id).join(',')
  useEffect(() => {
    if (!busyIds) return
    const t = setInterval(async () => {
      try {
        const updates = await Promise.all(busyIds.split(',').map((id) => fetchJobStatus(id)))
        setVideos((list) =>
          (list ?? []).map((v) => {
            const u = updates.find((x) => x.job_id === v.job_id)
            return u ? { ...v, ...u } : v
          }),
        )
        const merged = (videos ?? []).map((v) => ({ ...v, ...(updates.find((x) => x.job_id === v.job_id) ?? {}) }))
        if (noteTransitions(merged)) reload(pages)
      } catch {
        // mạng chập chờn: thử lại lần sau
      }
    }, 4000)
    return () => clearInterval(t)
  }, [busyIds, videos, pages, noteTransitions, reload])

  const opened = videos?.find((v) => v.job_id === openId) ?? null
  const closeModal = () => {
    setOpenId(null)
    reload(pages)
  }

  const filtering = q !== '' || filter !== 'all'
  const libraryEmpty = videos !== null && counts.all === 0 && q === ''

  return (
    <div className="flex-1 h-full overflow-y-auto text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="eyebrow">Thư viện</p>
            <h1 className="display text-3xl sm:text-4xl mt-1.5">Video của tôi</h1>
            <p className="text-[var(--text-muted)] mt-2">Xem lại, tải về hoặc đăng các video bạn đã tạo.</p>
          </div>
          {!libraryEmpty && videos && (
            <button onClick={onCreate} className="btn btn-primary">
              <Plus className="w-4 h-4" /> Tạo video mới
            </button>
          )}
        </div>

        {loadError && (
          <div className="flex gap-2 items-center text-sm p-3 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{loadError}</span>
            <button onClick={() => reload(pages)} className="font-semibold underline">
              Thử lại
            </button>
          </div>
        )}

        {/* Đang tải lần đầu: khung lấp lánh */}
        {!videos && !loadError && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5" aria-label="Đang tải">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i}>
                <div className="skeleton rounded-2xl aspect-[3/4]" />
                <div className="skeleton rounded-full h-3.5 w-3/4 mt-3" />
                <div className="skeleton rounded-full h-3 w-1/2 mt-2" />
              </div>
            ))}
          </div>
        )}

        {libraryEmpty && (
          <div className="card text-center py-16 px-6 animate-fade-up">
            <HangerArt className="w-24 mx-auto text-[var(--accent-text)]" />
            <h2 className="display text-2xl mt-5">Tủ video của bạn đang trống</h2>
            <p className="text-[var(--text-muted)] mt-2 max-w-md mx-auto">
              Tải một ảnh sản phẩm lên, AI sẽ cho người mẫu mặc thử và làm video review kèm lời thoại, phụ đề.
            </p>
            <button onClick={onCreate} className="btn btn-primary btn-lg mt-7">
              <Plus className="w-4 h-4" /> Tạo video đầu tiên
            </button>
          </div>
        )}

        {videos && !libraryEmpty && (
          <>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="relative flex-1 sm:max-w-md">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm theo tên sản phẩm (gõ không dấu cũng được)"
                    aria-label="Tìm video theo tên sản phẩm"
                    className="field rounded-full pl-11 pr-10"
                  />
                  {loading && q !== '' ? (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[var(--text-muted)]" />
                  ) : search ? (
                    <button
                      onClick={() => setSearch('')}
                      aria-label="Xóa từ khóa"
                      className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn w-8 h-8"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 sm:ml-auto">
                <label className="flex items-center gap-2 text-sm text-[var(--text-muted)] flex-1 sm:flex-none">
                  <ArrowUpDown className="w-4 h-4" />
                  <span className="sr-only">Sắp xếp</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as VideoSort)}
                    className="field rounded-full w-auto py-2.5"
                    aria-label="Sắp xếp video"
                  >
                    {SORTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)]" role="group" aria-label="Cách hiển thị">
                  {([
                    ['list', List, 'Danh sách'],
                    ['grid', LayoutGrid, 'Lưới'],
                  ] as const).map(([id, Icon, label]) => (
                    <button
                      key={id}
                      onClick={() => setLayout(id)}
                      aria-pressed={layout === id}
                      title={label}
                      aria-label={`Xem dạng ${label.toLowerCase()}`}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                        layout === id ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1" role="group" aria-label="Lọc video">
                {FILTERS.filter((f) => f.id === 'all' || f.id === filter || counts[f.id] > 0).map((f) => (
                  <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className="chip shrink-0">
                    {f.label}
                    <span className="opacity-70 tabular-nums">{formatNumber(counts[f.id])}</span>
                  </button>
                ))}
              </div>
            </div>

            {videos.length === 0 ? (
              <div className="card text-center py-12 px-6">
                <Search className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
                <p className="font-semibold mt-3">Không tìm thấy video phù hợp</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">Thử từ khóa khác hoặc bỏ bộ lọc.</p>
                {filtering && (
                  <button
                    onClick={() => {
                      setSearch('')
                      setFilter('all')
                    }}
                    className="btn btn-secondary mt-5"
                  >
                    Xóa bộ lọc
                  </button>
                )}
              </div>
            ) : (
              <>
                {layout === 'grid' ? (
                  <div
                    className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-7 sm:gap-x-5 transition-opacity ${
                      loading ? 'opacity-60' : ''
                    }`}
                  >
                    {videos.map((v, i) => (
                      <VideoCard
                        key={v.job_id}
                        video={v}
                        index={i % PAGE_SIZE}
                        onOpen={() => setOpenId(v.job_id)}
                        onRemake={canRemake(v) ? () => onRemake(v) : undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={`card overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
                    <div className="hidden md:grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] gap-4 px-5 py-3 text-xs font-semibold text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                      <span>Sản phẩm</span>
                      <span>Trạng thái</span>
                      <span>Đăng bán</span>
                      <span>Ngày tạo</span>
                      <span className="w-[8.5rem] text-right">Thao tác</span>
                    </div>
                    <ul className="divide-y divide-[var(--border-subtle)]">
                      {videos.map((v) => (
                        <VideoRow
                          key={v.job_id}
                          video={v}
                          onOpen={() => setOpenId(v.job_id)}
                          onRemake={canRemake(v) ? () => onRemake(v) : undefined}
                        />
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex flex-col items-center gap-3 pt-2">
                  <p className="text-sm text-[var(--text-muted)]">
                    Đang hiện {formatNumber(videos.length)} / {formatNumber(total)} video
                  </p>
                  {hasMore && (
                    <button onClick={loadMore} disabled={loadingMore} className="btn btn-secondary">
                      {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                      Xem thêm
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Xem video đã xong: tải về, sao chép caption, đăng mạng xã hội */}
      <Modal open={opened?.status === 'completed'} onClose={closeModal} title={opened ? titleOf(opened) : ''} width="max-w-5xl">
        {opened?.status === 'completed' && (
          <VideoResult
            job={opened}
            productTitle={opened.product_title}
            price={opened.product_price}
            originalPrice={opened.product_original_price}
            onRemake={canRemake(opened) ? () => onRemake(opened) : undefined}
          />
        )}
      </Modal>

      {/* Duyệt ảnh thử đồ */}
      <Modal open={opened?.status === 'awaiting_approval'} onClose={closeModal} title={opened ? titleOf(opened) : ''} width="max-w-3xl">
        {opened?.status === 'awaiting_approval' && opened.output_image_url && (
          <TryOnReview
            jobId={opened.job_id}
            imageUrl={opened.output_image_url}
            refundCredits={Math.max(0, (opened.cost_credits ?? 0) - previewCost)}
            previewCost={previewCost}
            onApproved={() => {
              toast('Đã duyệt, AI đang tạo video', 'success')
              closeModal()
            }}
            onRejected={(remaining) => {
              onCreditsChange(remaining)
              closeModal()
            }}
          />
        )}
      </Modal>
    </div>
  )
}

/** Các nền tảng đã đăng: logo sáng nếu đã đăng, mờ nếu chưa */
const PublishedIcons: React.FC<{ video: MyVideo }> = ({ video: v }) => {
  const done = new Set(v.published_platforms ?? [])
  if (v.status !== 'completed') return <span className="text-sm text-[var(--text-muted)]">—</span>
  return (
    <span className="flex items-center gap-2 text-sm">
      <span title={done.has('tiktok') ? 'Đã đăng TikTok' : 'Chưa đăng TikTok'} className={done.has('tiktok') ? '' : 'opacity-30'}>
        <TikTokLogo className="w-4 h-4" />
      </span>
      <span title={done.has('facebook') ? 'Đã đăng Facebook' : 'Chưa đăng Facebook'} className={done.has('facebook') ? '' : 'opacity-30'}>
        <FacebookLogo className="w-4 h-4 text-[#1877F2]" />
      </span>
      <span className={done.size ? 'text-[var(--ok-text)] font-medium' : 'text-[var(--text-muted)]'}>
        {done.size ? 'Đã đăng' : 'Chưa đăng'}
      </span>
    </span>
  )
}

/** Một dòng ở chế độ Danh sách: ảnh, tên + giá, trạng thái/tiến độ, đã đăng ở đâu, ngày tạo, thao tác */
const VideoRow: React.FC<{ video: MyVideo; onOpen: () => void; onRemake?: () => void }> = ({ video: v, onOpen, onRemake }) => {
  const thumb = v.output_image_url || v.product_image_url
  const busy = isJobBusy(v.status)
  const done = v.status === 'completed'
  return (
    <li className="px-4 md:px-5 py-3.5 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] gap-x-4 gap-y-2 items-center">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpen}
          disabled={!done && v.status !== 'awaiting_approval'}
          className="relative w-12 h-16 rounded-xl overflow-hidden bg-[var(--bg-surface)] shrink-0 disabled:cursor-default"
          aria-label={`Mở ${titleOf(v)}`}
        >
          {thumb ? <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Film className="w-5 h-5 m-auto text-[var(--text-muted)]" />}
          {done && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Play className="w-4 h-4 text-white fill-current" />
            </span>
          )}
        </button>
        <div className="min-w-0">
          <p className="font-semibold truncate">{titleOf(v)}</p>
          <p className="text-sm text-[var(--text-muted)] truncate">
            {v.product_price ? formatVnd(v.product_price) : ''}
            {v.product_category ? `${v.product_price ? ' · ' : ''}${v.product_category}` : ''}
          </p>
          {/* Điện thoại: trạng thái + ngày ngay dưới tên */}
          <div className="md:hidden flex items-center gap-2 mt-1 flex-wrap">
            <StatusBadge status={v.status} />
            <span className="text-xs text-[var(--text-muted)]">{formatDateTime(v.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="hidden md:block min-w-0">
        <StatusBadge status={v.status} />
        {busy && (
          <div className="mt-2 flex items-center gap-2">
            <span className="flex-1 h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
              <span className="block h-full progress-bar" style={{ width: `${Math.max(4, v.progress)}%` }} />
            </span>
            <span className="text-xs tabular-nums text-[var(--text-muted)]">{v.progress}%</span>
          </div>
        )}
        {v.status === 'failed' && (
          <p className="text-xs text-[var(--danger-text)] mt-1 line-clamp-1">{v.refunded ? 'Đã hoàn credit' : v.error_message}</p>
        )}
      </div>
      <div className="hidden md:block">
        <PublishedIcons video={v} />
      </div>
      <span className="hidden md:block text-sm text-[var(--text-muted)] tabular-nums">{formatDateTime(v.created_at)}</span>

      <div className="flex items-center justify-end gap-1.5 md:w-[8.5rem]">
        {done && (
          <button onClick={onOpen} className="btn btn-primary btn-sm">
            Xem
          </button>
        )}
        {v.status === 'awaiting_approval' && (
          <button onClick={onOpen} className="btn btn-accent btn-sm">
            Duyệt
          </button>
        )}
        {busy && <Loader2 className="md:hidden w-4 h-4 animate-spin text-[var(--text-muted)]" />}
        {done && v.output_video_url && (
          <a
            href={v.output_video_url}
            download={videoFileName(v.product_title)}
            className="icon-btn w-9 h-9"
            title="Tải video"
            aria-label={`Tải video ${titleOf(v)}`}
          >
            <Download className="w-4 h-4" />
          </a>
        )}
        {onRemake && (
          <button onClick={onRemake} className="icon-btn w-9 h-9" title="Tạo lại" aria-label={`Tạo lại video ${titleOf(v)}`}>
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
      </div>
    </li>
  )
}

const VideoCard: React.FC<{ video: MyVideo; index: number; onOpen: () => void; onRemake?: () => void }> = ({
  video: v,
  index,
  onOpen,
  onRemake,
}) => {
  const [hover, setHover] = useState(false)
  const thumb = v.output_image_url || v.product_image_url
  const busy = isJobBusy(v.status)
  const done = v.status === 'completed'
  const clickable = done || v.status === 'awaiting_approval'

  return (
    <article className="group animate-fade-up" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
      <button
        onClick={onOpen}
        disabled={!clickable}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="relative block w-full aspect-[3/4] rounded-2xl overflow-hidden bg-[var(--bg-surface)] shadow-[var(--shadow-card)] disabled:cursor-default"
        aria-label={clickable ? `Mở ${titleOf(v)}` : titleOf(v)}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <Film className="w-8 h-8 text-[var(--text-muted)] absolute inset-0 m-auto" />
        )}
        {/* Rê chuột lên video đã xong thì tự phát xem trước (không tiếng) */}
        {done && hover && v.output_video_url && (
          <video
            src={v.output_video_url}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover animate-fade-in"
          />
        )}
        <span className="absolute top-2.5 left-2.5">
          <StatusBadge status={v.status} glass />
        </span>
        {done && !hover && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-12 h-12 rounded-full glass flex items-center justify-center shadow-md">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </span>
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center gap-3 text-white px-4">
            <span className="font-display text-3xl font-semibold tabular-nums">{v.progress}%</span>
            <span className="w-full max-w-[120px] h-1 rounded-full bg-white/25 overflow-hidden">
              <span className="block h-full progress-bar" style={{ width: `${Math.max(4, v.progress)}%` }} />
            </span>
          </span>
        )}
      </button>

      <div className="pt-3 space-y-1">
        <h3 className="font-semibold leading-snug line-clamp-1">{titleOf(v)}</h3>
        <p className="text-sm text-[var(--text-muted)] flex items-center gap-1.5 flex-wrap">
          {formatDateTime(v.created_at)}
          {done && v.published_count > 0 && (
            <span className="inline-flex items-center gap-1 text-[var(--ok-text)]">
              · <Send className="w-3.5 h-3.5" /> Đã đăng {v.published_count}
            </span>
          )}
        </p>
        {busy && <p className="text-sm text-[var(--text-muted)] line-clamp-2">{v.current_step}</p>}
        {v.status === 'failed' && (
          <p className="text-sm text-[var(--danger-text)] line-clamp-2">
            {v.error_message || 'Tạo video không thành công'}
            {v.refunded && <span className="text-[var(--text-muted)]"> · Đã hoàn credit</span>}
          </p>
        )}
        {v.status === 'rejected' && (
          <p className="text-sm text-[var(--text-muted)]">Đã hủy ở bước duyệt ảnh · Đã hoàn credit (trừ phí thử đồ)</p>
        )}
        {done && v.output_video_url && (
          <div className="flex items-center gap-2 pt-1.5">
            <button onClick={onOpen} className="btn btn-primary btn-sm flex-1">
              Xem & đăng
            </button>
            <a
              href={v.output_video_url}
              download={videoFileName(v.product_title)}
              className="icon-btn border border-[var(--border-strong)] w-9 h-9"
              title="Tải video"
              aria-label="Tải video"
            >
              <Download className="w-4 h-4" />
            </a>
          </div>
        )}
        {onRemake && !done && (
          <div className="pt-1.5">
            <button onClick={onRemake} className="btn btn-secondary btn-sm w-full">
              <RotateCcw className="w-3.5 h-3.5" /> Tạo lại
            </button>
          </div>
        )}
        {v.status === 'awaiting_approval' && (
          <div className="pt-1.5">
            <button onClick={onOpen} className="btn btn-accent btn-sm w-full">
              Duyệt ảnh thử đồ
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
