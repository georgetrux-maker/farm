import React, { useCallback, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { ToastContext, type ToastKind } from './toastContext'

interface Toast {
  id: number
  text: string
  kind: ToastKind
}

const ICON: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 shrink-0 text-[#8BD3AC]" />,
  error: <AlertTriangle className="w-5 h-5 shrink-0 text-[#F4A49C]" />,
  info: <Info className="w-5 h-5 shrink-0 text-[#E3A1B4]" />,
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const show = useCallback(
    (text: string, kind: ToastKind = 'info') => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-2), { id, text, kind }])
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4500)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Điện thoại: nằm trên thanh tab dưới; máy tính: góc phải dưới */}
      <div
        className="fixed z-[60] left-3 right-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:left-auto lg:right-6 lg:bottom-6 lg:w-[380px] flex flex-col gap-2 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 py-3 pl-4 pr-2 rounded-2xl bg-[#1E1916] text-[#F6F1EB] shadow-[var(--shadow-pop)] text-sm animate-fade-up ring-1 ring-white/10"
          >
            {ICON[t.kind]}
            <span className="flex-1 pt-0.5 leading-snug">{t.text}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="p-1 rounded-full text-[#F6F1EB]/60 hover:text-[#F6F1EB]"
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
