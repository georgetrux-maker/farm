import React from 'react'
import { JOB_STATUS, PUBLICATION_STATUS, type StatusTone } from '../../lib/jobStatus'

const TONE: Record<StatusTone, string> = {
  ok: 'bg-[var(--accent-soft)] text-[var(--accent-text)] border-[var(--accent-border)]',
  warn: 'bg-[var(--warn-bg)] text-[var(--warn-text)] border-[var(--warn-border)]',
  danger: 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]',
  muted: 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)]',
  busy: 'bg-[var(--bg-surface)] text-[var(--text-main)] border-[var(--border-strong)]',
}

interface StatusBadgeProps {
  status: string
  /** Trạng thái của video (mặc định) hay của bài đăng mạng xã hội */
  kind?: 'job' | 'publication'
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, kind = 'job' }) => {
  const map = kind === 'job' ? JOB_STATUS : PUBLICATION_STATUS
  const info = map[status] ?? { label: status, tone: 'muted' as const }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${TONE[info.tone]}`}
    >
      {info.label}
    </span>
  )
}
