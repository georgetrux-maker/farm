import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useEscapeKey } from '../../hooks/useEscapeKey'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  icon?: React.ReactNode
  children: React.ReactNode
  /** Lớp Tailwind cho độ rộng tối đa, mặc định max-w-md */
  width?: string
}

/** Hộp thoại dùng chung: đóng bằng Esc, bấm ra ngoài, hoặc nút X. */
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, icon, children, width = 'max-w-md' }) => {
  const panelRef = useRef<HTMLDivElement>(null)
  useEscapeKey(open, onClose)

  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`relative w-full ${width} max-h-[92dvh] overflow-y-auto bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 outline-none`}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            {title && <h3 className="font-semibold text-base text-[var(--text-main)] truncate">{title}</h3>}
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
