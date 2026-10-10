import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, Film, Play, Plus, Send } from 'lucide-react'
import { fetchMyVideos, fetchProfile, fetchStudioOptions } from '../../services/api'
import type { MyVideo } from '../../types'
import { formatDateTime, videoFileName } from '../../lib/format'
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

type Filter = 'all' | 'completed' | 'busy' | 'awaiting_approval' | 'other'

const FILTERS: { id: Filter; label: string; match: (v: MyVideo) => boolean }[] = [
  { id: 'all', label: 'Tất cả', match: () => true },
  { id: 'completed', label: 'Hoàn tất', match: (v) => v.status === 'completed' },
  { id: 'busy', label: 'Đang tạo', match: (v) => isJobBusy(v.status) },
  { id: 'awaiting_approval', label: 'Chờ duyệt', match: (v) => v.status === 'awaiting_approval' },
  { id: 'other', label: 'Lỗi / đã hủy', match: (v) => v.status === 'failed' || v.status === 'rejected' },
]

function titleOf(v: MyVideo) {
  return v.product_title || 'Sản phẩm chưa đặt tên'
}

/** Thư viện video kiểu lookbook; video đang tạo tự cập nhật tiến độ. */
export const MyVideosView: React.FC<MyVideosViewProps> = ({ onCreate, onCreditsChange }) => {
  const toast = useToast()
  const [videos, setVideos] = useState<MyVideo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [previewCost, setPreviewCost] = useState(0)
  const lastStatus = useRef<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const list = await fetchMyVideos()
      setLoadError(null)
      setVideos(list)

      // Báo khi một video vừa đổi trạng thái trong lúc người dùng đang xem trang này
      let refreshCredits = false
      for (const v of list) {
        const before = lastStatus.current[v.job_id]
        if (before && isJobBusy(before) && !isJobBusy(v.status)) {
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
    } catch (e: any) {
      setLoadError(e.message)
    }
  }, [toast, onCreditsChange])

  useEffect(() => {
    const id = setTimeout(load, 0)
    fetchStudioOptions()
      .then((o) => setPreviewCost(o.tryon_preview_cost_credits))
      .catch(() => {})
    return () => clearTimeout(id)
  }, [load])

  // Còn video đang tạo thì hỏi lại tiến độ định kỳ
  const hasBusy = videos?.some((v) => isJobBusy(v.status)) ?? false
  useEffect(() => {
    if (!hasBusy) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [hasBusy, load])

  const opened = videos?.find((v) => v.job_id === openId) ?? null
  const closeModal = () => {
    setOpenId(null)
    load()
  }

  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, videos?.filter(f.match).length ?? 0])) as Record<Filter, number>
  const activeFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]
  const shown = videos?.filter(activeFilter.match) ?? []

  return (
    <div className="flex-1 h-full overflow-y-auto text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="eyebrow">Thư viện</p>
            <h1 className="display text-3xl sm:text-4xl mt-1.5">Video của tôi</h1>
            <p className="text-[var(--text-muted)] mt-2">Xem lại, tải về hoặc đăng các video bạn đã tạo.</p>
          </div>
          {videos && videos.length > 0 && (
            <button onClick={onCreate} className="btn btn-primary">
              <Plus className="w-4 h-4" /> Tạo video mới
            </button>
          )}
        </div>

        {loadError && (
          <div className="flex gap-2 items-center text-sm p-3 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{loadError}</span>
            <button onClick={load} className="font-semibold underline">
              Thử lại
            </button>
          </div>
        )}

        {/* Đang tải: khung lấp lánh */}
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

        {videos && videos.length === 0 && (
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

        {videos && videos.length > 0 && (
          <>
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1" role="group" aria-label="Lọc video">
              {FILTERS.filter((f) => f.id === 'all' || counts[f.id] > 0).map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} className="chip shrink-0">
                  {f.label}
                  <span className="opacity-70 tabular-nums">{counts[f.id]}</span>
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="text-[var(--text-muted)]">Không có video nào ở mục này.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-7 sm:gap-x-5">
                {shown.map((v, i) => (
                  <VideoCard key={v.job_id} video={v} index={i} onOpen={() => setOpenId(v.job_id)} />
                ))}
              </div>
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
