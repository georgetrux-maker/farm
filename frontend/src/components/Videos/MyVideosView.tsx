import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, Film, Loader2, Play, Plus, RotateCcw, Send } from 'lucide-react'
import { fetchMyVideos, fetchProfile, fetchStudioOptions } from '../../services/api'
import type { MyVideo } from '../../types'
import { formatDateTime, videoFileName } from '../../lib/format'
import { isJobBusy } from '../../lib/jobStatus'
import { Modal } from '../ui/Modal'
import { StatusBadge } from '../ui/StatusBadge'
import { useToast } from '../ui/toastContext'
import { TryOnReview } from '../Create/TryOnReview'
import { VideoResult } from '../Create/VideoResult'

interface MyVideosViewProps {
  onCreate: () => void
  onCreditsChange: (credits: number) => void
}

const primaryButton =
  'px-4 py-2.5 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-sm inline-flex items-center justify-center gap-2'

function titleOf(v: MyVideo) {
  return v.product_title || 'Sản phẩm chưa đặt tên'
}

/** Danh sách video của người dùng; video đang tạo tự cập nhật tiến độ. */
export const MyVideosView: React.FC<MyVideosViewProps> = ({ onCreate, onCreditsChange }) => {
  const toast = useToast()
  const [videos, setVideos] = useState<MyVideo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
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

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[var(--bg-app)] text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-5 sm:py-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold">Video của tôi</h1>
            <p className="text-sm text-[var(--text-muted)]">Xem lại, tải về hoặc đăng các video bạn đã tạo.</p>
          </div>
          {videos && videos.length > 0 && (
            <button onClick={onCreate} className={primaryButton}>
              <Plus className="w-4 h-4" /> Tạo video mới
            </button>
          )}
        </div>

        {loadError && (
          <div className="flex gap-2 items-center text-sm p-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{loadError}</span>
            <button onClick={load} className="font-semibold underline">
              Thử lại
            </button>
          </div>
        )}

        {!videos && !loadError && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] py-10 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Đang tải danh sách video...
          </div>
        )}

        {videos && videos.length === 0 && (
          <div className="text-center py-14 px-6 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-card)]">
            <Film className="w-10 h-10 mx-auto text-[var(--text-muted)]" />
            <h2 className="font-semibold text-lg mt-3">Bạn chưa có video nào</h2>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-md mx-auto">
              Tải một ảnh sản phẩm lên, AI sẽ cho người mẫu mặc thử và làm video review kèm lời thoại, phụ đề.
            </p>
            <button onClick={onCreate} className={`${primaryButton} mt-5`}>
              <Plus className="w-4 h-4" /> Tạo video đầu tiên
            </button>
          </div>
        )}

        {videos && videos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {videos.map((v) => (
              <VideoCard key={v.job_id} video={v} onOpen={() => setOpenId(v.job_id)} />
            ))}
          </div>
        )}
      </div>

      {/* Xem video đã xong: tải về, sao chép caption, đăng mạng xã hội */}
      <Modal
        open={opened?.status === 'completed'}
        onClose={closeModal}
        title={opened ? titleOf(opened) : ''}
        width="max-w-4xl"
      >
        {opened?.status === 'completed' && <VideoResult job={opened} productTitle={opened.product_title} />}
      </Modal>

      {/* Duyệt ảnh thử đồ */}
      <Modal
        open={opened?.status === 'awaiting_approval'}
        onClose={closeModal}
        title={opened ? `Duyệt ảnh thử đồ: ${titleOf(opened)}` : ''}
        width="max-w-3xl"
      >
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

const VideoCard: React.FC<{ video: MyVideo; onOpen: () => void }> = ({ video: v, onOpen }) => {
  const thumb = v.output_image_url || v.product_image_url
  const busy = isJobBusy(v.status)
  const clickable = v.status === 'completed' || v.status === 'awaiting_approval'

  return (
    <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden flex flex-col">
      <button
        onClick={onOpen}
        disabled={!clickable}
        className="relative aspect-[3/4] bg-[var(--bg-surface)] disabled:cursor-default"
        aria-label={clickable ? `Mở ${titleOf(v)}` : titleOf(v)}
      >
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <Film className="w-8 h-8 text-[var(--text-muted)] absolute inset-0 m-auto" />
        )}
        {v.status === 'completed' && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            </span>
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-2 text-white">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span className="text-sm font-semibold tabular-nums">{v.progress}%</span>
          </span>
        )}
      </button>

      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={v.status} />
          <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">{formatDateTime(v.created_at)}</span>
        </div>
        <h3 className="font-semibold text-sm leading-snug line-clamp-2">{titleOf(v)}</h3>

        {busy && <p className="text-xs text-[var(--text-muted)] line-clamp-2">{v.current_step}</p>}
        {v.status === 'failed' && (
          <p className="text-xs text-[var(--danger-text)] line-clamp-3">
            {v.error_message || 'Tạo video không thành công'}
            {v.refunded && <span className="text-[var(--text-muted)]"> · Đã hoàn credit</span>}
          </p>
        )}
        {v.status === 'rejected' && (
          <p className="text-xs text-[var(--text-muted)]">Bạn đã hủy sau khi xem ảnh thử đồ · Đã hoàn credit (trừ phí thử đồ)</p>
        )}
        {v.status === 'completed' && v.published_count > 0 && (
          <p className="text-xs text-[var(--accent-text)] flex items-center gap-1">
            <Send className="w-3.5 h-3.5" /> Đã đăng {v.published_count} lần
          </p>
        )}

        <div className="mt-auto pt-2 flex gap-2">
          {v.status === 'completed' && v.output_video_url && (
            <>
              <button
                onClick={onOpen}
                className="flex-1 py-2 rounded-lg bg-[var(--accent-color)] text-black text-sm font-semibold"
              >
                Xem & đăng
              </button>
              <a
                href={v.output_video_url}
                download={videoFileName(v.product_title)}
                className="w-10 shrink-0 rounded-lg border border-[var(--border-strong)] flex items-center justify-center"
                title="Tải video"
                aria-label="Tải video"
              >
                <Download className="w-4 h-4" />
              </a>
            </>
          )}
          {v.status === 'awaiting_approval' && (
            <button
              onClick={onOpen}
              className="flex-1 py-2 rounded-lg bg-[var(--accent-color)] text-black text-sm font-semibold"
            >
              Duyệt ảnh thử đồ
            </button>
          )}
          {(v.status === 'failed' || v.status === 'rejected') && (
            <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> Tạo lại ở mục "Tạo video"
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
