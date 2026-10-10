import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Coins, Loader2, Lock, LockOpen, Minus, Plus, Search, X } from 'lucide-react'
import { adjustUserCredits, fetchAdminUsers, setUserLocked, type AdminUser } from '../../services/api'
import { formatDateTime, formatNumber, formatVnd } from '../../lib/format'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/toastContext'

type StatusFilter = 'all' | 'active' | 'locked'
type RoleFilter = 'all' | 'shop' | 'admin'
const PAGE_SIZE = 20

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'active', label: 'Đang hoạt động' },
  { id: 'locked', label: 'Đã khóa' },
]

const StatusPill: React.FC<{ locked: boolean }> = ({ locked }) => (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold whitespace-nowrap ${
      locked
        ? 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]'
        : 'bg-[var(--ok-bg)] text-[var(--ok-text)] border-[var(--ok-border)]'
    }`}
  >
    {locked ? <Lock className="w-3 h-3" /> : null}
    {locked ? 'Đã khóa' : 'Hoạt động'}
  </span>
)

/** Người dùng: tìm theo tên/email, cộng/trừ credit có ghi lý do, khóa/mở khóa tài khoản. */
export const UsersTab: React.FC<{ currentUserId: string }> = ({ currentUserId }) => {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [role, setRole] = useState<RoleFilter>('all')
  const [items, setItems] = useState<AdminUser[] | null>(null)
  const [counts, setCounts] = useState({ all: 0, active: 0, locked: 0 })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  // Cộng/trừ credit
  const [creditUser, setCreditUser] = useState<AdminUser | null>(null)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  // Khóa / mở khóa
  const [lockUser, setLockUser] = useState<AdminUser | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const load = useCallback(
    (nextPage: number) => {
      const id = ++reqId.current
      setLoading(true)
      fetchAdminUsers({ q, status, role, page: nextPage, pageSize: PAGE_SIZE })
        .then((res) => {
          if (id !== reqId.current) return
          setItems((prev) => (nextPage > 1 && prev ? [...prev, ...res.items] : res.items))
          setCounts(res.counts)
          setTotal(res.total)
          setPage(nextPage)
          setHasMore(res.has_more)
        })
        .catch((e) => toast(e.message, 'error'))
        .finally(() => id === reqId.current && setLoading(false))
    },
    [q, status, role, toast],
  )

  useEffect(() => {
    const id = setTimeout(() => load(1), 0)
    return () => clearTimeout(id)
  }, [load])

  const openCredit = (u: AdminUser, dir: 1 | -1 = 1) => {
    setCreditUser(u)
    setDirection(dir)
    setAmount('')
    setReason('')
    setFormError(null)
  }

  const delta = direction * (Number(amount.replace(/\D/g, '')) || 0)
  const submitCredit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!creditUser) return
    setFormError(null)
    if (!delta) return setFormError('Nhập số credit cần điều chỉnh')
    if (reason.trim().length < 3) return setFormError('Ghi lý do (ít nhất 3 ký tự), khách sẽ thấy trong lịch sử ví')
    if (creditUser.credits + delta < 0) return setFormError(`Khách chỉ còn ${formatNumber(creditUser.credits)} credit`)
    setBusy(true)
    try {
      const res = await adjustUserCredits(creditUser.id, delta, reason.trim())
      toast(
        `${delta > 0 ? 'Đã cộng' : 'Đã trừ'} ${formatNumber(Math.abs(delta))} credit cho ${creditUser.name}. Số dư mới: ${formatNumber(res.new_balance)}`,
        'success',
      )
      setCreditUser(null)
      load(1)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không điều chỉnh được credit')
    } finally {
      setBusy(false)
    }
  }

  const submitLock = async () => {
    if (!lockUser) return
    setBusy(true)
    try {
      await setUserLocked(lockUser.id, !lockUser.disabled)
      toast(lockUser.disabled ? `Đã mở khóa ${lockUser.name}` : `Đã khóa ${lockUser.name} và đăng xuất khỏi mọi thiết bị`, 'success')
      setLockUser(null)
      load(1)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Không cập nhật được tài khoản', 'error')
    } finally {
      setBusy(false)
    }
  }

  const actions = (u: AdminUser) => (
    <div className="flex items-center justify-end gap-1.5">
      <button onClick={() => openCredit(u)} className="btn btn-secondary btn-sm" aria-label={`Cộng trừ credit cho ${u.name}`}>
        <Coins className="w-4 h-4" /> Credit
      </button>
      {u.id !== currentUserId && (
        <button
          onClick={() => setLockUser(u)}
          className={`icon-btn w-9 h-9 ${u.disabled ? 'text-[var(--ok-text)]' : 'hover:text-[var(--danger-text)]'}`}
          title={u.disabled ? 'Mở khóa' : 'Khóa tài khoản'}
          aria-label={u.disabled ? `Mở khóa ${u.name}` : `Khóa ${u.name}`}
        >
          {u.disabled ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
        </button>
      )}
    </div>
  )

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative lg:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            className="field rounded-full pl-10 pr-9"
            placeholder="Tìm theo tên hoặc email"
            aria-label="Tìm người dùng"
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
        <div className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)] overflow-x-auto no-scrollbar w-full lg:w-fit" role="tablist">
          {STATUS_TABS.map((t) => (
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
              <span className="text-xs tabular-nums opacity-70">{formatNumber(counts[t.id])}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)] lg:ml-auto">
          Vai trò
          <select value={role} onChange={(e) => setRole(e.target.value as RoleFilter)} className="field rounded-full w-auto py-2.5">
            <option value="all">Tất cả</option>
            <option value="shop">Shop</option>
            <option value="admin">Quản trị viên</option>
          </select>
        </label>
      </div>

      {!items ? (
        <div className="skeleton h-64 rounded-3xl" />
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-muted)]">Không có người dùng phù hợp.</div>
      ) : (
        <div className={`card overflow-hidden transition-opacity ${loading && page === 1 ? 'opacity-60' : ''}`}>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-surface)] text-left text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Người dùng</th>
                  <th className="px-3 py-3 font-semibold">Vai trò</th>
                  <th className="px-3 py-3 font-semibold text-right">Số dư</th>
                  <th className="px-3 py-3 font-semibold text-right">Đã nạp</th>
                  <th className="px-3 py-3 font-semibold text-right">Video</th>
                  <th className="px-3 py-3 font-semibold">Ngày tạo</th>
                  <th className="px-3 py-3 font-semibold">Trạng thái</th>
                  <th className="px-5 py-3 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {items.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3 max-w-[18rem]">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-9 h-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold flex items-center justify-center shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {u.name}
                            {u.id === currentUserId && <span className="text-xs text-[var(--text-muted)]"> (bạn)</span>}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] truncate">{u.email || 'Chưa có email'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">{u.role === 'admin' ? 'Quản trị viên' : 'Shop'}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatNumber(u.credits)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--text-sub)]">{formatVnd(u.deposited_vnd)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[var(--text-sub)]">{formatNumber(u.videos)}</td>
                    <td className="px-3 py-3 text-[var(--text-muted)] tabular-nums whitespace-nowrap">{formatDateTime(u.created_at)}</td>
                    <td className="px-3 py-3">
                      <StatusPill locked={u.disabled} />
                    </td>
                    <td className="px-5 py-3">
                      {actions(u)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="lg:hidden divide-y divide-[var(--border-subtle)]">
            {items.map((u) => (
              <li key={u.id} className="p-4 space-y-2.5">
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold flex items-center justify-center shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{u.name}</p>
                    <p className="text-sm text-[var(--text-muted)] truncate">{u.email || 'Chưa có email'}</p>
                  </div>
                  <StatusPill locked={u.disabled} />
                </div>
                <div className="flex items-end justify-between gap-3">
                  <p className="text-sm text-[var(--text-muted)]">
                    <strong className="text-[var(--text-main)]">{formatNumber(u.credits)}</strong> credit · đã nạp {formatVnd(u.deposited_vnd)} ·{' '}
                    {formatNumber(u.videos)} video
                  </p>
                  {actions(u)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
          <span>
            Đang hiện {formatNumber(items.length)} / {formatNumber(total)} người dùng
          </span>
          {hasMore && (
            <button onClick={() => load(page + 1)} disabled={loading} className="btn btn-secondary btn-sm">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Xem thêm
            </button>
          )}
        </div>
      )}

      <Modal open={!!creditUser} onClose={() => !busy && setCreditUser(null)} title="Điều chỉnh credit" icon={<Coins className="w-5 h-5 text-[var(--gold)]" />}>
        {creditUser && (
          <form onSubmit={submitCredit} className="space-y-4" noValidate>
            <div className="rounded-2xl bg-[var(--bg-surface)] p-4 text-sm flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{creditUser.name}</p>
                <p className="text-[var(--text-muted)] truncate">{creditUser.email}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-[var(--text-muted)]">Số dư hiện tại</p>
                <p className="font-semibold">{formatNumber(creditUser.credits)} credit</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-surface)]" role="radiogroup" aria-label="Cộng hay trừ">
              {([
                [1, 'Cộng credit', Plus],
                [-1, 'Trừ credit', Minus],
              ] as const).map(([dir, label, Icon]) => (
                <button
                  key={dir}
                  type="button"
                  role="radio"
                  aria-checked={direction === dir}
                  onClick={() => setDirection(dir)}
                  className={`h-10 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    direction === dir ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="field-label">Số credit</span>
              <input
                className="field"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="Ví dụ: 50"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="field-label">Lý do (khách thấy trong lịch sử ví)</span>
              <input
                className="field"
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ví dụ: Bồi thường video lỗi ngày 10/10"
              />
            </label>
            {delta !== 0 && (
              <p className="text-sm text-[var(--text-muted)]">
                Số dư sau điều chỉnh:{' '}
                <strong className={creditUser.credits + delta < 0 ? 'text-[var(--danger-text)]' : 'text-[var(--text-main)]'}>
                  {formatNumber(creditUser.credits + delta)} credit
                </strong>
              </p>
            )}
            {formError && <p className="text-sm text-[var(--danger-text)]">{formError}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCreditUser(null)} disabled={busy} className="btn btn-ghost">
                Thôi
              </button>
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {direction > 0 ? 'Cộng credit' : 'Trừ credit'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!lockUser}
        onClose={() => !busy && setLockUser(null)}
        title={lockUser?.disabled ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
        icon={lockUser?.disabled ? <LockOpen className="w-5 h-5" /> : <Lock className="w-5 h-5 text-[var(--danger-text)]" />}
      >
        {lockUser && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-sub)]">
              {lockUser.disabled ? (
                <>
                  <strong>{lockUser.name}</strong> sẽ đăng nhập và dùng lại được ngay.
                </>
              ) : (
                <>
                  <strong>{lockUser.name}</strong> ({lockUser.email}) sẽ bị đăng xuất khỏi mọi thiết bị và không đăng nhập được cho tới khi
                  bạn mở khóa. Số dư và video vẫn được giữ nguyên.
                </>
              )}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setLockUser(null)} disabled={busy} className="btn btn-ghost">
                Thôi
              </button>
              <button onClick={submitLock} disabled={busy} className={`btn ${lockUser.disabled ? 'btn-primary' : 'btn-danger'}`}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {lockUser.disabled ? 'Mở khóa' : 'Khóa tài khoản'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
