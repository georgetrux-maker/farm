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

/** Hộp thoại dùng chung: đóng bằng Esc, bấm ra ngoài, hoặc nút X. Trên điện thoại trượt lên từ dưới. */
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, icon, children, width = 'max-w-md' }) => {
  const panelRef = useRef<HTMLDivElement>(null)
  useEscapeKey(open, onClose)

  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 bg-[rgba(20,16,14,0.5)] backdrop-blur-[6px] animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`relative w-full ${width} max-h-[92dvh] overflow-y-auto bg-[var(--bg-card)] text-[var(--text-main)] rounded-t-[28px] sm:rounded-[28px] shadow-[var(--shadow-pop)] px-5 pb-6 pt-3 sm:p-7 outline-none animate-sheet-up sm:animate-scale-in`}
      >
        {/* Thanh kéo trên điện thoại */}
        <div className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border-strong)]" />
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon}
            {title && <h3 className="display text-xl truncate">{title}</h3>}
          </div>
          <button onClick={onClose} aria-label="Đóng" className="icon-btn -mr-2">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
