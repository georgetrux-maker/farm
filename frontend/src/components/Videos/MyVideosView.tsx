import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowUpDown, Download, Film, Loader2, Play, Plus, Search, Send, X } from 'lucide-react'
import { fetchJobStatus, fetchMyVideos, fetchProfile, fetchStudioOptions } from '../../services/api'
import type { MyVideo, VideoFilter, VideoSort } from '../../types'
import { formatDateTime, formatNumber, videoFileName } from '../../lib/format'
import { isJobBusy } from '../../lib/jobStatus'
import { HangerArt } from '../ui/GarmentArt'
import { Modal } from '../ui/Modal'
import { StatusBadge } from '../ui/StatusBadge'
import { useToast } from '../ui/toastContext'
import { TryOnReview } from '../Create/TryOnReview'
import { VideoResult } from '../Create/VideoResult'

interface MyVideosViewProps {
  onCreate: () => void
  onCreditsChange: (credits: number) => void
}

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
export const MyVideosView: React.FC<MyVideosViewProps> = ({ onCreate, onCreditsChange }) => {
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
                <label className="flex items-center gap-2 sm:ml-auto text-sm text-[var(--text-muted)]">
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
                <div
                  className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-7 sm:gap-x-5 transition-opacity ${
                    loading ? 'opacity-60' : ''
                  }`}
                >
                  {videos.map((v, i) => (
                    <VideoCard key={v.job_id} video={v} index={i % PAGE_SIZE} onOpen={() => setOpenId(v.job_id)} />
                  ))}
                </div>
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
        {opened?.status === 'completed' && <VideoResult job={opened} productTitle={opened.product_title} />}
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

const VideoCard: React.FC<{ video: MyVideo; index: number; onOpen: () => void }> = ({ video: v, index, onOpen }) => {
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
