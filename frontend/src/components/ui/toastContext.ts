import { createContext, useContext } from 'react'

export type ToastKind = 'success' | 'error' | 'info'
export type ShowToast = (text: string, kind?: ToastKind) => void

export const ToastContext = createContext<ShowToast>(() => {})

/** Hiện thông báo nổi ngắn (thay cho alert() của trình duyệt). */
export function useToast(): ShowToast {
  return useContext(ToastContext)
}
