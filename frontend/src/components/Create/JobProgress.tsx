import React from 'react'
import { Check, Loader2 } from 'lucide-react'
import type { AIJob } from '../../types'

// Mốc tiến độ (%) mà máy chủ báo khi xong từng bước
const STEPS = [
  { label: 'Phân tích ảnh sản phẩm', until: 15 },
  { label: 'Mặc thử lên người mẫu', until: 40 },
  { label: 'Viết lời review & lồng tiếng', until: 65 },
  { label: 'Tạo chuyển động video 9:16', until: 85 },
  { label: 'Ghép video, phụ đề & âm thanh', until: 100 },
]

interface JobProgressProps {
  job: AIJob
  /** Ảnh sản phẩm, dùng khi chưa có ảnh thử đồ */
  fallbackImage: string | null
  onOpenVideos: () => void
}

/** Màn chờ: ảnh đang được xử lý + danh sách bước, thay cho vòng quay đơn điệu. */
export const JobProgress: React.FC<JobProgressProps> = ({ job, fallbackImage, onOpenVideos }) => {
  const image = job.output_image_url || fallbackImage
  return (
    <div className="card max-w-3xl mx-auto p-6 sm:p-10 grid sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] gap-8 sm:gap-10 items-center animate-fade-up">
      <div className="w-40 sm:w-full mx-auto">
        <div className="phone-frame">
          <div className="relative aspect-[9/16] overflow-hidden bg-[var(--bg-surface)] shimmer">
            {image && <img src={image} alt="" className="w-full h-full object-cover" />}
          </div>
        </div>
      </div>

      <div>
        <h2 className="display text-2xl sm:text-3xl">AI đang làm video cho bạn</h2>
        <ol className="mt-6 space-y-3.5">
          {STEPS.map((s, i) => {
            const from = i === 0 ? 0 : STEPS[i - 1].until
            const done = job.progress >= s.until
            const active = !done && job.progress >= from
            return (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span
                  className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center transition-colors duration-300 ${
                    done
                      ? 'bg-[var(--accent-color)] text-[var(--on-accent)]'
                      : active
                        ? 'border-2 border-[var(--ink)]'
                        : 'border border-[var(--border-strong)]'
                  }`}
                >
                  {done ? <Check className="w-3.5 h-3.5" /> : active ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                </span>
                <span
                  className={
                    done ? 'text-[var(--text-sub)]' : active ? 'font-semibold text-[var(--text-main)]' : 'text-[var(--text-muted)]'
                  }
                >
                  {s.label}
                </span>
              </li>
            )
          })}
        </ol>

        <div className="mt-7 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
            <div className="progress-bar h-full" style={{ width: `${Math.max(4, job.progress)}%` }} />
          </div>
          <span className="text-sm font-semibold tabular-nums w-10 text-right">{job.progress}%</span>
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-4">
          Thường mất 1 đến 3 phút. Bạn có thể rời trang, video sẽ nằm trong{' '}
          <button onClick={onOpenVideos} className="font-semibold text-[var(--accent-text)] underline underline-offset-2">
            Video của tôi
          </button>
          .
        </p>
      </div>
    </div>
  )
}
