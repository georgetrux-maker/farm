import React from 'react'
import { Loader2 } from 'lucide-react'
import { JOB_STATUS, PUBLICATION_STATUS, type StatusTone } from '../../lib/jobStatus'

const TONE: Record<StatusTone, string> = {
  ok: 'bg-[var(--ok-bg)] text-[var(--ok-text)] border-[var(--ok-border)]',
  warn: 'bg-[var(--warn-bg)] text-[var(--warn-text)] border-[var(--warn-border)]',
  danger: 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]',
  muted: 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)]',
  busy: 'bg-[var(--bg-surface)] text-[var(--text-main)] border-[var(--border-strong)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent-text)] border-[var(--accent-border)]',
}

interface StatusBadgeProps {
  status: string
  /** Trạng thái của video (mặc định) hay của bài đăng mạng xã hội */
  kind?: 'job' | 'publication'
  /** Nhãn mờ đặt trên ảnh */
  glass?: boolean
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, kind = 'job', glass }) => {
  const map = kind === 'job' ? JOB_STATUS : PUBLICATION_STATUS
  const info = map[status] ?? { label: status, tone: 'muted' as const }
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${
        glass ? 'glass shadow-sm' : `border ${TONE[info.tone]}`
      }`}
    >
      {/* Không dùng chấm màu trang trí: chỉ trạng thái đang chạy có biểu tượng quay (trạng thái thật) */}
      {info.tone === 'busy' && <Loader2 className="w-3 h-3 animate-spin" aria-hidden />}
      {info.label}
    </span>
  )
}
