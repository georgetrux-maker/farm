import React from 'react'
import { JOB_STATUS, PUBLICATION_STATUS, type StatusTone } from '../../lib/jobStatus'

const TONE: Record<StatusTone, string> = {
  ok: 'bg-[var(--ok-bg)] text-[var(--ok-text)] border-[var(--ok-border)]',
  warn: 'bg-[var(--warn-bg)] text-[var(--warn-text)] border-[var(--warn-border)]',
  danger: 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]',
  muted: 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)]',
  busy: 'bg-[var(--bg-surface)] text-[var(--text-main)] border-[var(--border-strong)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent-text)] border-[var(--accent-border)]',
}

const DOT: Record<StatusTone, string> = {
  ok: 'bg-[#2E8B5F]',
  warn: 'bg-[#C58A1C]',
  danger: 'bg-[#C8443A]',
  muted: 'bg-[#9A8F87]',
  busy: 'bg-[var(--accent-color)] animate-pulse',
  accent: 'bg-[var(--accent-color)]',
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
        glass ? 'glass shadow-sm' : `border ${TONE[info.tone]}`
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${DOT[info.tone]}`} />
      {info.label}
    </span>
  )
}
