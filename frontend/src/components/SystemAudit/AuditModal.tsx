import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import type { SystemAuditReport } from '../../types'
import { fetchSystemAudit } from '../../services/api'
import { Modal } from '../ui/Modal'

interface AuditModalProps {
  open: boolean
  onClose: () => void
}

const ITEM_STATUS: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  PASSED: { label: 'Đạt', icon: CheckCircle2, className: 'text-[var(--accent-text)]' },
  WARNING: { label: 'Cần chú ý', icon: AlertTriangle, className: 'text-[var(--warn-text)]' },
  FAILED: { label: 'Lỗi', icon: XCircle, className: 'text-[var(--danger-text)]' },
}

const OVERALL: Record<string, string> = {
  ALL_SYSTEMS_OPERATIONAL: 'Mọi thành phần đều hoạt động',
  OK_WITH_WARNINGS: 'Chạy được, còn vài mục nên bật thêm',
  DEGRADED: 'Có lỗi cần sửa trước khi dùng',
}

/** Tình trạng máy chủ cho quản trị viên: cơ sở dữ liệu, FFmpeg, lồng tiếng, các engine AI. */
export const AuditModal: React.FC<AuditModalProps> = ({ open, onClose }) => {
  const [data, setData] = useState<SystemAuditReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchSystemAudit())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [open, load])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Kiểm tra hệ thống"
      icon={<ShieldCheck className="w-5 h-5 text-[var(--accent-text)]" />}
      width="max-w-2xl"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-[var(--text-muted)]">
          {data ? (
            <>
              <strong className="text-[var(--text-main)]">
                {data.passed_tasks}/{data.total_tasks} mục đạt
              </strong>{' '}
              · {OVERALL[data.status] ?? data.status}
            </>
          ) : (
            'Kiểm tra trực tiếp trên máy chủ'
          )}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 rounded-lg border border-[var(--border-strong)] text-sm flex items-center gap-2 shrink-0 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Kiểm tra lại
        </button>
      </div>

      {error && <p className="text-sm text-[var(--danger-text)] mb-3">{error}</p>}
      {!data && !error && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Đang kiểm tra...
        </div>
      )}

      {data && (
        <ul className="space-y-2">
          {data.report.map((item) => {
            const st = ITEM_STATUS[item.status] ?? ITEM_STATUS.WARNING
            const Icon = st.icon
            return (
              <li key={item.task} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--bg-surface)]">
                <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${st.className}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{item.name}</span>
                    <span className={`text-xs font-semibold whitespace-nowrap ${st.className}`}>{st.label}</span>
                  </div>
                  {item.note && <p className="text-sm text-[var(--text-muted)] mt-0.5">{item.note}</p>}
                  <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5 break-all">{item.module}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
