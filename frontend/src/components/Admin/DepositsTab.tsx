import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BadgeCheck, Loader2, Search, ShieldAlert, X } from 'lucide-react'
import { fetchAdminDeposits, verifyDeposit, type AdminDeposit } from '../../services/api'
import { formatDateTime, formatNumber, formatVnd } from '../../lib/format'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/toastContext'

type Status = 'pending' | 'success' | 'all'
const FILTERS: { id: Status; label: string }[] = [
  { id: 'pending', label: 'Chờ duyệt' },
  { id: 'success', label: 'Đã nhận tiền' },
  { id: 'all', label: 'Tất cả' },
]
const PAGE_SIZE = 20

function confirmedByText(by: string | null): string {
  if (!by) return ''
  if (by === 'sepay') return 'SePay tự xác nhận'
  if (by.startsWith('admin')) return 'Quản trị viên duyệt tay'
  if (by === 'cli') return 'Duyệt bằng dòng lệnh'
  return by
}

/** Lịch sử nạp tiền toàn sàn (chỉ lệnh nạp) và duyệt tay khi khách chuyển sai nội dung. */
export const DepositsTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const toast = useToast()
  const [status, setStatus] = useState<Status>('pending')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<AdminDeposit[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [confirming, setConfirming] = useState<AdminDeposit | null>(null)
  const [verifying, setVerifying] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const load = useCallback(
    (nextPage: number) => {
      const id = ++reqId.current
      if (nextPage > 1) setLoadingMore(true)
      fetchAdminDeposits({ status, q, page: nextPage, pageSize: PAGE_SIZE })
        .then((res) => {
          if (id !== reqId.current) return
          setItems((prev) => (nextPage > 1 && prev ? [...prev, ...res.items] : res.items))
          setTotal(res.total)
          setPage(nextPage)
          setHasMore(res.has_more)
        })
        .catch((e) => toast(e.message, 'error'))
        .finally(() => id === reqId.current && setLoadingMore(false))
    },
    [status, q, toast],
  )

  useEffect(() => {
    const id = setTimeout(() => load(1), 0)
    return () => clearTimeout(id)
  }, [load])

  const verify = async () => {
    if (!confirming) return
    setVerifying(true)
    try {
      const res = await verifyDeposit(confirming.id)
      toast(
        res.status === 'success'
          ? `Đã cộng ${formatNumber(res.credits_added ?? 0)} credit cho ${confirming.user_name || 'khách'}`
          : 'Giao dịch này đã được ghi nhận trước đó',
        res.status === 'success' ? 'success' : 'info',
      )
      setConfirming(null)
      load(1)
      onChanged()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f.id} className="chip" aria-pressed={status === f.id} onClick={() => setStatus(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            className="field pl-10 pr-9"
            placeholder="Mã nạp, tên shop hoặc email"
            aria-label="Tìm giao dịch nạp tiền"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)]" aria-label="Xóa tìm kiếm">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {!items ? (
        <div className="skeleton h-64 rounded-3xl" />
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-muted)]">
          {status === 'pending' && !q ? 'Không có lệnh nạp nào đang chờ.' : 'Không có giao dịch phù hợp.'}
        </div>
      ) : (
        <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
          {items.map((d) => (
            <li key={d.id} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{d.user_name || d.user_id}</p>
                <p className="text-sm text-[var(--text-muted)] truncate">{d.user_email}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1 font-mono">{d.transfer_content || d.id}</p>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6">
                <div className="sm:text-right">
                  <p className="font-semibold">{d.amount_vnd ? formatVnd(d.amount_vnd) : '—'}</p>
                  <p className="text-sm text-[var(--text-muted)]">{formatNumber(d.amount_credits)} credit</p>
                </div>
                <div className="sm:w-44 sm:text-right">
                  <span
                    className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                      d.status === 'success' ? 'bg-[var(--ok-bg)] text-[var(--ok-text)]' : 'bg-[var(--warn-bg)] text-[var(--warn-text)]'
                    }`}
                  >
                    {d.status === 'success' ? 'Đã nhận tiền' : 'Chờ duyệt'}
                  </span>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {d.status === 'success'
                      ? `${confirmedByText(d.confirmed_by)} ${formatDateTime(d.confirmed_at)}`.trim()
                      : `Tạo lúc ${formatDateTime(d.created_at)}`}
                  </p>
                </div>
                {d.status === 'pending' && (
                  <button onClick={() => setConfirming(d)} className="btn btn-secondary btn-sm shrink-0">
                    <BadgeCheck className="w-4 h-4" /> Duyệt tay
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {items && items.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
          <span>
            Đang hiện {formatNumber(items.length)} / {formatNumber(total)} giao dịch
          </span>
          {hasMore && (
            <button onClick={() => load(page + 1)} disabled={loadingMore} className="btn btn-secondary btn-sm">
              {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Xem thêm
            </button>
          )}
        </div>
      )}

      <Modal open={!!confirming} onClose={() => !verifying && setConfirming(null)} title="Xác nhận đã nhận tiền" icon={<ShieldAlert className="w-5 h-5" />}>
        {confirming && (
          <div className="space-y-4">
            <dl className="rounded-2xl bg-[var(--bg-surface)] p-4 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-[var(--text-muted)]">Khách</dt>
              <dd className="font-semibold truncate">{confirming.user_name} · {confirming.user_email}</dd>
              <dt className="text-[var(--text-muted)]">Số tiền</dt>
              <dd className="font-semibold">{confirming.amount_vnd ? formatVnd(confirming.amount_vnd) : '—'}</dd>
              <dt className="text-[var(--text-muted)]">Cộng</dt>
              <dd className="font-semibold">{formatNumber(confirming.amount_credits)} credit</dd>
              <dt className="text-[var(--text-muted)]">Nội dung CK</dt>
              <dd className="font-mono break-all">{confirming.transfer_content}</dd>
            </dl>
            <p className="text-sm text-[var(--text-muted)]">
              Chỉ duyệt khi sao kê ngân hàng đã có khoản tiền này. Thao tác được ghi lại tên quản trị viên và không hoàn tác được.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirming(null)} disabled={verifying} className="btn btn-ghost">
                Hủy
              </button>
              <button onClick={verify} disabled={verifying} className="btn btn-primary">
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />} Đã nhận tiền, cộng credit
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
