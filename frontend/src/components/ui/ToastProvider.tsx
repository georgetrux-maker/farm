import React, { useCallback, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { ToastContext, type ToastKind } from './toastContext'

interface Toast {
  id: number
  text: string
  kind: ToastKind
}

const STYLE: Record<ToastKind, string> = {
  success: 'border-[var(--accent-border)] text-[var(--text-main)]',
  error: 'border-[var(--danger-border)] text-[var(--text-main)]',
  info: 'border-[var(--border-strong)] text-[var(--text-main)]',
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const show = useCallback(
    (text: string, kind: ToastKind = 'info') => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-3), { id, text, kind }])
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4500)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="fixed z-[60] bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 flex flex-col gap-2 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3.5 rounded-xl border bg-[var(--bg-card)] shadow-2xl text-sm ${STYLE[t.kind]}`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[var(--accent-text)]" />
            ) : t.kind === 'error' ? (
              <AlertTriangle className="w-5 h-5 shrink-0 text-[var(--danger-text)]" />
            ) : (
              <Info className="w-5 h-5 shrink-0 text-[var(--text-muted)]" />
            )}
            <span className="flex-1">{t.text}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="text-[var(--text-muted)] hover:text-[var(--text-main)]"
              aria-label="Đóng thông báo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
