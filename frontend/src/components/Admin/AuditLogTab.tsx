import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, ScrollText, Search, X } from 'lucide-react'
import { fetchAuditLogs, type AuditLog } from '../../services/api'
import { formatDateTime, formatNumber } from '../../lib/format'
import { useToast } from '../ui/toastContext'

const PAGE_SIZE = 30

/** Nhóm màu theo loại thao tác (nhãn chữ luôn đi kèm, không chỉ dựa vào màu) */
function tone(action: string): string {
  if (action === 'user.lock' || action === 'deposit.cancel') return 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]'
  if (action.startsWith('deposit.') || action === 'user.unlock') return 'bg-[var(--ok-bg)] text-[var(--ok-text)] border-[var(--ok-border)]'
  if (action === 'settings.update' || action === 'user.credits') return 'bg-[var(--warn-bg)] text-[var(--warn-text)] border-[var(--warn-border)]'
  return 'bg-[var(--bg-surface)] text-[var(--text-sub)] border-[var(--border-subtle)]'
}

/** Nhật ký hệ thống: ai đã làm gì, lúc nào (duyệt/hủy nạp tiền, điều chỉnh credit, khóa tài khoản, đổi cấu hình...). */
export const AuditLogTab: React.FC = () => {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [actions, setActions] = useState<Record<string, string>>({})
  const [items, setItems] = useState<AuditLog[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const load = useCallback(
    (nextPage: number) => {
      const id = ++reqId.current
      setLoading(true)
      fetchAuditLogs({ q, action: action || undefined, page: nextPage, pageSize: PAGE_SIZE })
        .then((res) => {
          if (id !== reqId.current) return
          setItems((prev) => (nextPage > 1 && prev ? [...prev, ...res.items] : res.items))
          setActions(res.actions)
          setTotal(res.total)
          setPage(nextPage)
          setHasMore(res.has_more)
        })
        .catch((e) => toast(e.message, 'error'))
        .finally(() => id === reqId.current && setLoading(false))
    },
    [q, action, toast],
  )

  useEffect(() => {
    const id = setTimeout(() => load(1), 0)
    return () => clearTimeout(id)
  }, [load])

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            className="field rounded-full pl-10 pr-9"
            placeholder="Tìm người thực hiện, đối tượng, chi tiết"
            aria-label="Tìm trong nhật ký"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)]"
              aria-label="Xóa tìm kiếm"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)] sm:ml-auto">
          Loại thao tác
          <select value={action} onChange={(e) => setAction(e.target.value)} className="field rounded-full w-auto py-2.5">
            <option value="">Tất cả</option>
            {Object.entries(actions).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!items ? (
        <div className="skeleton h-64 rounded-3xl" />
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-muted)]">
          <ScrollText className="w-8 h-8 mx-auto mb-2" />
          {q || action ? 'Không có mục nào phù hợp.' : 'Chưa có thao tác nào được ghi lại.'}
        </div>
      ) : (
        <div className={`card overflow-hidden transition-opacity ${loading && page === 1 ? 'opacity-60' : ''}`}>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-surface)] text-left text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Thời gian</th>
                  <th className="px-3 py-3 font-semibold">Người thực hiện</th>
                  <th className="px-3 py-3 font-semibold">Thao tác</th>
                  <th className="px-3 py-3 font-semibold">Đối tượng</th>
                  <th className="px-5 py-3 font-semibold">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {items.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-3 text-[var(--text-muted)] tabular-nums whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                    <td className="px-3 py-3 font-medium whitespace-nowrap">{l.actor_name}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold whitespace-nowrap ${tone(l.action)}`}>
                        {l.action_label}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs max-w-[12rem] truncate" title={l.target ?? ''}>
                      {l.target || '—'}
                    </td>
                    <td className="px-5 py-3 text-[var(--text-sub)] max-w-[22rem] truncate" title={l.detail ?? ''}>
                      {l.detail || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="md:hidden divide-y divide-[var(--border-subtle)]">
            {items.map((l) => (
              <li key={l.id} className="p-4 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${tone(l.action)}`}>{l.action_label}</span>
                  <span className="text-xs text-[var(--text-muted)]">{formatDateTime(l.created_at)}</span>
                </div>
                <p className="text-sm">
                  <strong>{l.actor_name}</strong>
                  {l.target && <span className="text-[var(--text-muted)]"> · {l.target}</span>}
                </p>
                {l.detail && <p className="text-sm text-[var(--text-sub)] break-words">{l.detail}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
          <span>
            Đang hiện {formatNumber(items.length)} / {formatNumber(total)} mục
          </span>
          {hasMore && (
            <button onClick={() => load(page + 1)} disabled={loading} className="btn btn-secondary btn-sm">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Xem thêm
            </button>
          )}
        </div>
      )}
    </div>
  )
}
