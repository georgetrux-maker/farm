import React, { useCallback, useEffect, useRef, useState } from 'react'
import { BadgeCheck, Ban, Loader2, Search, ShieldAlert, X } from 'lucide-react'
import {
  cancelDeposit, fetchAdminDeposits, verifyDeposit, type AdminDeposit, type AdminDepositStatus,
} from '../../services/api'
import { formatDateTime, formatNumber, formatVnd } from '../../lib/format'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/toastContext'

type Filter = AdminDepositStatus | 'all'
const TABS: { id: Filter; label: string }[] = [
  { id: 'pending', label: 'Chờ duyệt' },
  { id: 'success', label: 'Thành công' },
  { id: 'cancelled', label: 'Đã hủy' },
  { id: 'all', label: 'Tất cả' },
]
const PAGE_SIZE = 20

const STATUS: Record<AdminDepositStatus, { label: string; cls: string }> = {
  pending: { label: 'Chờ duyệt', cls: 'bg-[var(--warn-bg)] text-[var(--warn-text)] border-[var(--warn-border)]' },
  success: { label: 'Thành công', cls: 'bg-[var(--ok-bg)] text-[var(--ok-text)] border-[var(--ok-border)]' },
  cancelled: { label: 'Đã hủy', cls: 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)]' },
}


/** Nạp credit: số credit; mua gói: tên gói trong nội dung lệnh ("GOI TX... · Gói Starter 1 tháng") */
const creditText = (d: AdminDeposit) =>
  d.transaction_type === 'subscription'
    ? d.transfer_content?.split('·')[1]?.trim() || 'Gói tháng'
    : `${formatNumber(d.amount_credits)} credit`

function sourceText(d: AdminDeposit): string {
  const by = d.confirmed_by
  if (d.status === 'pending') return 'Chờ tiền về'
  if (!by) return '-'
  if (by === 'sepay') return 'SePay tự động'
  if (d.status === 'cancelled') return 'Quản trị viên hủy'
  if (by.startsWith('admin')) return 'Quản trị viên duyệt'
  if (by === 'cli') return 'Dòng lệnh'
  return by
}

const StatusPill: React.FC<{ status: AdminDepositStatus }> = ({ status }) => (
  <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap ${STATUS[status].cls}`}>
    {STATUS[status].label}
  </span>
)

/** Giao dịch nạp tiền toàn sàn: lọc theo trạng thái, tìm, duyệt tay khi khách chuyển sai nội dung, hủy lệnh treo. */
export const TransactionsTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const toast = useToast()
  const [status, setStatus] = useState<Filter>('pending')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<AdminDeposit[] | null>(null)
  const [counts, setCounts] = useState<Partial<Record<Filter, number>>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<{ kind: 'verify' | 'cancel'; deposit: AdminDeposit } | null>(null)
  const [busy, setBusy] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const load = useCallback(
    (nextPage: number) => {
      const id = ++reqId.current
      setLoading(true)
      fetchAdminDeposits({ status, q, page: nextPage, pageSize: PAGE_SIZE })
        .then((res) => {
          if (id !== reqId.current) return
          setItems((prev) => (nextPage > 1 && prev ? [...prev, ...res.items] : res.items))
          setCounts(res.counts ?? {})
          setTotal(res.total)
          setPage(nextPage)
          setHasMore(res.has_more)
        })
        .catch((e) => toast(e.message, 'error'))
        .finally(() => id === reqId.current && setLoading(false))
    },
    [status, q, toast],
  )

  useEffect(() => {
    const id = setTimeout(() => load(1), 0)
    return () => clearTimeout(id)
  }, [load])

  const confirm = async () => {
    if (!action) return
    const { kind, deposit } = action
    setBusy(true)
    try {
      if (kind === 'verify') {
        const res = await verifyDeposit(deposit.id)
        toast(
          res.status !== 'success'
            ? 'Giao dịch này đã được ghi nhận trước đó'
            : deposit.transaction_type === 'subscription'
              ? `Đã kích hoạt gói cho ${deposit.user_name || 'khách'}`
              : `Đã cộng ${formatNumber(res.credits_added ?? 0)} credit cho ${deposit.user_name || 'khách'}`,
          res.status === 'success' ? 'success' : 'info',
        )
      } else {
        await cancelDeposit(deposit.id)
        toast(`Đã hủy lệnh ${deposit.transfer_content || deposit.id}`, 'success')
      }
      setAction(null)
      load(1)
      onChanged()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Thao tác không thành công', 'error')
    } finally {
      setBusy(false)
    }
  }

  const actions = (d: AdminDeposit) =>
    d.status === 'success' ? null : (
      <div className="flex items-center justify-end gap-1.5">
        <button onClick={() => setAction({ kind: 'verify', deposit: d })} className="btn btn-primary btn-sm">
          <BadgeCheck className="w-4 h-4" /> Duyệt
        </button>
        {d.status === 'pending' && (
          <button onClick={() => setAction({ kind: 'cancel', deposit: d })} className="btn btn-secondary btn-sm">
            <Ban className="w-4 h-4" /> Hủy
          </button>
        )}
      </div>
    )

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)] overflow-x-auto no-scrollbar w-full md:w-fit" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={status === t.id}
              onClick={() => setStatus(t.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                status === t.id ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
              }`}
            >
              {t.label}
              <span className="text-xs tabular-nums opacity-70">{formatNumber(counts[t.id] ?? 0)}</span>
            </button>
          ))}
        </div>
        <div className="relative md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            className="field rounded-full pl-10 pr-9"
            placeholder="Mã giao dịch, tên shop hoặc email"
            aria-label="Tìm giao dịch"
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
      </div>

      {!items ? (
        <div className="skeleton h-64 rounded-3xl" />
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-muted)]">
          {status === 'pending' && !q ? 'Không có lệnh nạp nào đang chờ.' : 'Không có giao dịch phù hợp.'}
        </div>
      ) : (
        <div className={`card overflow-hidden transition-opacity ${loading && page === 1 ? 'opacity-60' : ''}`}>
          {/* Máy tính: bảng */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-surface)] text-left text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Mã giao dịch</th>
                  <th className="px-3 py-3 font-semibold">Khách hàng</th>
                  <th className="px-3 py-3 font-semibold text-right">Số tiền</th>
                  <th className="px-3 py-3 font-semibold">Thời gian</th>
                  <th className="px-3 py-3 font-semibold">Trạng thái</th>
                  <th className="px-3 py-3 font-semibold">Xác nhận</th>
                  <th className="px-5 py-3 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {items.map((d) => (
                  <tr key={d.id}>
                    <td className="px-5 py-3.5 font-mono text-xs">{d.transfer_content || d.id}</td>
                    <td className="px-3 py-3.5 max-w-[14rem]">
                      <p className="font-medium truncate">{d.user_name || d.user_id}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate">{d.user_email}</p>
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums">
                      <p className="font-semibold">{d.amount_vnd ? formatVnd(d.amount_vnd) : '-'}</p>
                      <p className="text-xs text-[var(--text-muted)]">{creditText(d)}</p>
                    </td>
                    <td className="px-3 py-3.5 text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                      {formatDateTime(d.status === 'pending' ? d.created_at : d.confirmed_at || d.created_at)}
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusPill status={d.status} />
                    </td>
                    <td className="px-3 py-3.5 text-[var(--text-muted)] whitespace-nowrap">{sourceText(d)}</td>
                    <td className="px-5 py-3.5">
                      {actions(d)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Điện thoại / máy tính bảng: thẻ */}
          <ul className="lg:hidden divide-y divide-[var(--border-subtle)]">
            {items.map((d) => (
              <li key={d.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{d.user_name || d.user_id}</p>
                    <p className="text-sm text-[var(--text-muted)] truncate">{d.user_email}</p>
                  </div>
                  <StatusPill status={d.status} />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-semibold">
                      {d.amount_vnd ? formatVnd(d.amount_vnd) : '-'}{' '}
                      <span className="font-normal text-[var(--text-muted)]">· {creditText(d)}</span>
                    </p>
                    <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">{d.transfer_content || d.id}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {formatDateTime(d.created_at)} · {sourceText(d)}
                    </p>
                  </div>
                  {actions(d)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
          <span>
            Đang hiện {formatNumber(items.length)} / {formatNumber(total)} giao dịch
          </span>
          {hasMore && (
            <button onClick={() => load(page + 1)} disabled={loading} className="btn btn-secondary btn-sm">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Xem thêm
            </button>
          )}
        </div>
      )}

      <Modal
        open={!!action}
        onClose={() => !busy && setAction(null)}
        title={action?.kind === 'cancel' ? 'Hủy lệnh nạp tiền' : 'Xác nhận đã nhận tiền'}
        icon={<ShieldAlert className="w-5 h-5" />}
      >
        {action && (
          <div className="space-y-4">
            <dl className="rounded-2xl bg-[var(--bg-surface)] p-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-[var(--text-muted)]">Khách</dt>
              <dd className="font-semibold truncate">
                {action.deposit.user_name} · {action.deposit.user_email}
              </dd>
              <dt className="text-[var(--text-muted)]">Số tiền</dt>
              <dd className="font-semibold">{action.deposit.amount_vnd ? formatVnd(action.deposit.amount_vnd) : '-'}</dd>
              <dt className="text-[var(--text-muted)]">{action.deposit.transaction_type === 'subscription' ? 'Mua' : 'Credit'}</dt>
              <dd className="font-semibold">{creditText(action.deposit)}</dd>
              <dt className="text-[var(--text-muted)]">Nội dung CK</dt>
              <dd className="font-mono break-all">{action.deposit.transfer_content}</dd>
            </dl>
            <p className="text-sm text-[var(--text-muted)]">
              {action.kind === 'cancel'
                ? 'Dùng khi khách không chuyển tiền. Nếu sau này tiền vẫn về, bạn vẫn duyệt lại được ở tab Đã hủy. Thao tác được ghi vào nhật ký.'
                : 'Chỉ duyệt khi sao kê ngân hàng đã có khoản tiền này. Thao tác được ghi vào nhật ký và không hoàn tác được.'}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAction(null)} disabled={busy} className="btn btn-ghost">
                Thôi
              </button>
              <button onClick={confirm} disabled={busy} className={`btn ${action.kind === 'cancel' ? 'btn-danger' : 'btn-primary'}`}>
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : action.kind === 'cancel' ? (
                  <Ban className="w-4 h-4" />
                ) : (
                  <BadgeCheck className="w-4 h-4" />
                )}
                {action.kind === 'cancel'
                  ? 'Hủy lệnh'
                  : action.deposit.transaction_type === 'subscription'
                    ? 'Đã nhận tiền, kích hoạt gói'
                    : 'Đã nhận tiền, cộng credit'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
