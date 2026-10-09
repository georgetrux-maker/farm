import React, { useState, useEffect } from 'react'
import { X, CheckCircle2, ShieldCheck, RefreshCw, Terminal } from 'lucide-react'
import type { SystemAuditReport } from '../../types'
import { fetchSystemAudit } from '../../services/api'

interface AuditModalProps {
  isOpen: boolean
  onClose: () => void
}

export const AuditModal: React.FC<AuditModalProps> = ({ isOpen, onClose }) => {
  const [auditData, setAuditData] = useState<SystemAuditReport | null>(null)
  const [loading, setLoading] = useState(false)

  const loadAudit = async () => {
    setLoading(true)
    try {
      const data = await fetchSystemAudit()
      setAuditData(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    const id = setTimeout(loadAudit, 0)
    return () => clearTimeout(id)
  }, [isOpen])

  const percent = auditData ? Math.round((auditData.passed_tasks * 100) / Math.max(1, auditData.total_tasks)) : null
  const statusStyle = (status: string) =>
    status === 'PASSED'
      ? 'bg-[#00F5A0]/10 text-[#00F5A0] border-[#00F5A0]/20'
      : status === 'WARNING'
        ? 'bg-amber-400/10 text-amber-400 border-amber-400/20'
        : 'bg-red-500/10 text-red-400 border-red-500/20'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-3xl bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-colors">
        {/* Header */}
        <div className="h-16 px-6 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30 flex items-center justify-center text-[var(--accent-color)]">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-base text-[var(--text-main)]">Kiểm Tra Hệ Thống</h3>
                {percent !== null && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--accent-color)]/10 text-[var(--accent-color)] border border-[var(--accent-color)]/30 font-semibold">
                    {auditData?.passed_tasks}/{auditData?.total_tasks} ĐẠT
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)]">Kiểm tra trực tiếp trên máy chủ: cơ sở dữ liệu, FFmpeg, lồng tiếng và các engine AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadAudit}
              disabled={loading}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Chạy lại kiểm thử"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#00F5A0]' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Audit List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {auditData?.report ? (
            auditData.report.map((task) => (
              <div
                key={task.task}
                className="flex items-center justify-between p-3 rounded-xl bg-[#1A1D29] border border-white/[0.05] hover:border-white/[0.1] transition-colors text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-zinc-500 text-[11px] w-8">
                    #{task.task.toString().padStart(2, '0')}
                  </span>
                  <div>
                    <span className="font-semibold text-white block">{task.name}</span>
                    <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-1 mt-0.5">
                      <Terminal className="w-2.5 h-2.5 text-zinc-500" />
                      {task.module}
                    </span>
                    {task.note && <span className="text-[10px] text-zinc-400 block mt-0.5">{task.note}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-[10px] font-semibold border ${statusStyle(task.status)}`}>
                    <CheckCircle2 className="w-3 h-3" />
                    {task.status}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center py-12 text-zinc-500 font-mono text-xs">
              Đang kiểm tra hệ thống...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-14 px-6 border-t border-white/[0.08] bg-[#0A0B10]/60 flex items-center justify-between text-xs font-mono">
          <span className="text-zinc-400">
            Trạng thái:{' '}
            <strong className="text-[#00F5A0]">{auditData?.status ?? '...'}</strong>
          </span>
          <span className="text-zinc-400">
            Tỷ lệ đạt:{' '}
            <strong className="text-white">
              {auditData ? `${auditData.passed_tasks}/${auditData.total_tasks} (${percent}%)` : '...'}
            </strong>
          </span>
        </div>
      </div>
    </div>
  )
}
