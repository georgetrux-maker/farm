import React, { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, Check, Copy, Loader2, QrCode, ScanLine, Settings2, Undo2, Wallet, XCircle,
} from 'lucide-react'
import {
  createDeposit, fetchCreditHistory, fetchStudioOptions, fetchWalletSummary, type DepositInfo, type WalletSummary,
} from '../../services/api'
import type { CreditTransaction } from '../../types'
import { formatDateTime, formatNumber, formatVnd } from '../../lib/format'
import { StatStrip } from '../ui/StatStrip'
import { useToast } from '../ui/toastContext'

interface WalletViewProps {
  credits: number
  /** Lệnh nạp đang chờ tiền về (App tự theo dõi và cộng số dư khi tiền về) */
  pending: DepositInfo | null
  onCreated: (deposit: DepositInfo) => void
  /** Bỏ mã đang chờ để tạo mã khác */
  onDiscard: () => void
}

const VND_PER_CREDIT = 100
const MIN_VND = 10000
/** Gói credit (1 credit = 100đ) */
const PACKAGES = [100, 500, 1000, 2500]
const SUGGESTED = 500

const CopyRow: React.FC<{ label: string; value: string; copyValue?: string; highlight?: boolean }> = ({
  label, value, copyValue, highlight,
}) => {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-[var(--bg-surface)]">
      <div className="min-w-0">
        <span className="text-xs text-[var(--text-muted)] block">{label}</span>
        <span className={`font-semibold break-all ${highlight ? 'text-[var(--accent-text)] font-mono' : ''}`}>{value}</span>
      </div>
      <button
        onClick={() =>
          navigator.clipboard
            .writeText(copyValue ?? value)
            .then(() => {
              setCopied(true)
              toast(`Đã sao chép ${label.toLowerCase()}`, 'success')
              setTimeout(() => setCopied(false), 1500)
            })
            .catch(() => toast('Trình duyệt không cho sao chép, hãy chép tay', 'error'))
        }
        className="icon-btn"
        aria-label={`Sao chép ${label.toLowerCase()}`}
      >
        {copied ? <Check className="w-4 h-4 text-[var(--ok-text)]" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  )
}

function txLabel(t: CreditTransaction) {
  if (t.transaction_type === 'deposit') return `Nạp tiền ${t.amount_vnd ? formatVnd(t.amount_vnd) : ''}`.trim()
  if (t.transaction_type === 'refund')
    return t.description?.includes('hủy') ? 'Hoàn credit: bạn hủy ở bước duyệt ảnh' : 'Hoàn credit: video bị lỗi'
  if (t.transaction_type === 'adjust') return t.description || 'Điều chỉnh bởi quản trị viên'
  return t.description || 'Tạo video'
}

const TX_STATUS: Record<CreditTransaction['status'], { label: string; cls: string }> = {
  success: { label: 'Thành công', cls: 'bg-[var(--ok-bg)] text-[var(--ok-text)] border-[var(--ok-border)]' },
  pending: { label: 'Chờ thanh toán', cls: 'bg-[var(--warn-bg)] text-[var(--warn-text)] border-[var(--warn-border)]' },
  cancelled: { label: 'Đã hủy', cls: 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-subtle)]' },
}

function TxIcon({ t }: { t: CreditTransaction }) {
  const plus = t.amount_credits > 0
  const Icon =
    t.status === 'cancelled' ? XCircle
      : t.transaction_type === 'refund' ? Undo2
        : t.transaction_type === 'adjust' ? Settings2
          : plus ? ArrowDownLeft : ArrowUpRight
  return (
    <span
      className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${
        plus && t.status === 'success' ? 'bg-[var(--ok-bg)] text-[var(--ok-text)]' : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
      }`}
    >
      <Icon className="w-4 h-4" />
    </span>
  )
}

/** Ví Credits: số dư, chọn gói nạp, mã VietQR hiện ngay trên trang, lịch sử giao dịch. */
export const WalletView: React.FC<WalletViewProps> = ({ credits, pending, onCreated, onDiscard }) => {
  const [pkg, setPkg] = useState(SUGGESTED)
  const [custom, setCustom] = useState('')
  const [videoCost, setVideoCost] = useState<number | null>(null)
  const [summary, setSummary] = useState<WalletSummary | null>(null)
  const [history, setHistory] = useState<CreditTransaction[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrFailed, setQrFailed] = useState<string | null>(null) // mã giao dịch có ảnh QR không tải được

  useEffect(() => {
    fetchStudioOptions()
      .then((o) => setVideoCost(o.pipeline_cost_credits))
      .catch(() => {})
  }, [])

  // Tải lại lịch sử và tổng mỗi khi số dư đổi (vừa nạp, tạo video, được hoàn) hoặc vừa tạo/bỏ mã QR
  const reload = useCallback(() => {
    fetchCreditHistory()
      .then(setHistory)
      .catch(() => setHistory((h) => h ?? []))
    fetchWalletSummary()
      .then(setSummary)
      .catch(() => {})
  }, [])
  useEffect(() => {
    const id = setTimeout(reload, 0)
    return () => clearTimeout(id)
  }, [reload, credits, pending])

  const customVnd = Number(custom.replace(/\D/g, ''))
  const vnd = custom ? customVnd : pkg * VND_PER_CREDIT
  const receive = Math.floor(vnd / VND_PER_CREDIT)

  const handleCreate = async () => {
    setError(null)
    if (vnd < MIN_VND) return setError(`Số tiền nạp tối thiểu là ${formatVnd(MIN_VND)}`)
    if (vnd % VND_PER_CREDIT) return setError(`Số tiền phải là bội số của ${VND_PER_CREDIT}đ`)
    setCreating(true)
    try {
      onCreated(await createDeposit(vnd))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể tạo mã VietQR')
    } finally {
      setCreating(false)
    }
  }

  const videosFor = (c: number) => (videoCost ? Math.floor(c / videoCost) : null)

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6">
        <div>
          <h1 className="display text-3xl sm:text-4xl">Ví Credits</h1>
          <p className="text-[var(--text-muted)] mt-2">
            1 credit = {formatVnd(VND_PER_CREDIT)}
            {videoCost ? `, mỗi video ${formatNumber(videoCost)} credit` : ''}. Nạp qua VietQR, credit được cộng tự động.
          </p>
        </div>

        {/* Số dư (con số chính của trang) + các tổng trong một dải */}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] gap-3 sm:gap-4">
          <div className="rounded-[1.25rem] p-5 border border-[var(--accent-border)] bg-[radial-gradient(90%_120%_at_0%_0%,var(--accent-soft),transparent_70%)] bg-[var(--bg-card)] shadow-[var(--shadow-card)]">
            <span className="text-sm text-[var(--text-muted)] flex items-center gap-1.5">
              <Wallet className="w-4 h-4" /> Số dư hiện tại
            </span>
            <div className="text-5xl font-semibold tracking-tight mt-2">
              {formatNumber(credits)} <span className="text-base font-medium text-[var(--text-muted)] tracking-normal">credit</span>
            </div>
            <div className="text-sm text-[var(--text-muted)] mt-1.5">
              ≈ {formatVnd(credits * VND_PER_CREDIT)}
              {videosFor(credits) !== null ? `, đủ ${formatNumber(videosFor(credits)!)} video` : ''}
            </div>
          </div>
          <StatStrip
            items={[
              { label: 'Đã nạp', value: summary ? formatVnd(summary.deposited_vnd) : '…', sub: summary ? `${formatNumber(summary.deposited_credits)} credit` : undefined },
              { label: 'Đã dùng', value: summary ? formatNumber(summary.used_credits) : '…', sub: 'credit để tạo video' },
              {
                label: 'Được hoàn',
                value: summary ? formatNumber(summary.refunded_credits) : '…',
                sub: summary?.adjusted_credits
                  ? `điều chỉnh ${summary.adjusted_credits > 0 ? '+' : ''}${formatNumber(summary.adjusted_credits)}`
                  : 'credit từ video lỗi/hủy',
              },
            ]}
          />
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-5 sm:gap-6 items-start">
          {/* Chọn gói */}
          <section className="card p-4 sm:p-6 space-y-4">
            <h2 className="title text-lg">Chọn gói nạp</h2>
            <div className="grid grid-cols-2 gap-3">
              {PACKAGES.map((c) => {
                const active = !custom && pkg === c
                return (
                  <button
                    key={c}
                    onClick={() => {
                      setPkg(c)
                      setCustom('')
                    }}
                    aria-pressed={active}
                    disabled={!!pending}
                    className={`relative text-left p-4 rounded-2xl border-2 transition-colors disabled:opacity-60 ${
                      active
                        ? 'border-[var(--accent-color)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {c === SUGGESTED && (
                      <span className="tag absolute -top-2.5 right-3">
                        Gợi ý
                      </span>
                    )}
                    <span className="block text-xl font-semibold">{formatNumber(c)} credit</span>
                    <span className="block text-sm text-[var(--text-sub)] mt-0.5">{formatVnd(c * VND_PER_CREDIT)}</span>
                    {videosFor(c) !== null && (
                      <span className="block text-xs text-[var(--text-muted)] mt-1.5">≈ {formatNumber(videosFor(c)!)} video</span>
                    )}
                    {active && <Check className="absolute bottom-3 right-3 w-4 h-4 text-[var(--accent-text)]" />}
                  </button>
                )
              })}
            </div>
            <label className="block">
              <span className="field-label">Hoặc nhập số tiền khác (đồng)</span>
              <input
                inputMode="numeric"
                value={custom}
                disabled={!!pending}
                onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="Ví dụ: 30000"
                className="field"
              />
            </label>
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[var(--bg-surface)] text-sm">
              <span className="text-[var(--text-muted)]">Thanh toán {formatVnd(vnd || 0)}</span>
              <strong>Nhận {formatNumber(receive)} credit</strong>
            </div>
            {error && <p className="text-sm text-[var(--danger-text)]">{error}</p>}
            {pending ? (
              <p className="text-sm text-[var(--text-muted)]">
                Bạn đang có một mã QR chờ thanh toán.{' '}
                <button onClick={onDiscard} className="font-semibold text-[var(--accent-text)] underline underline-offset-2">
                  Nạp số tiền khác
                </button>
              </p>
            ) : (
              <button onClick={handleCreate} disabled={creating} className="btn btn-primary btn-lg w-full">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                Tạo mã QR thanh toán
              </button>
            )}
          </section>

          {/* Mã QR */}
          <section className="card p-4 sm:p-6 lg:sticky lg:top-0">
            <h2 className="title text-lg mb-4">Thanh toán VietQR</h2>
            {!pending ? (
              <div className="flex flex-col items-center text-center gap-3 py-6 px-2">
                <span className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center">
                  <ScanLine className="w-8 h-8" />
                </span>
                <p className="font-medium">Chọn gói rồi bấm “Tạo mã QR thanh toán”</p>
                <ol className="text-sm text-[var(--text-muted)] text-left space-y-1.5 mt-1">
                  <li>1. Mở app ngân hàng bất kỳ, chọn quét mã QR.</li>
                  <li>2. Giữ nguyên số tiền và nội dung chuyển khoản.</li>
                  <li>3. Credit được cộng tự động sau vài giây đến vài phút.</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-3 animate-fade-in">
                {qrFailed === pending.transaction_id ? (
                  <p className="text-sm p-3 rounded-2xl border border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn-text)]">
                    Không tải được ảnh mã QR. Bạn chuyển khoản theo đúng thông tin bên dưới, nhớ ghi đúng nội dung chuyển khoản.
                  </p>
                ) : (
                  <div className="flex flex-col items-center p-4 rounded-3xl bg-white border border-[var(--border-subtle)]">
                    <img
                      src={pending.qr_code_url}
                      alt="Mã VietQR"
                      onError={() => setQrFailed(pending.transaction_id)}
                      className="w-52 h-52 object-contain"
                    />
                    <span className="text-sm text-slate-600 mt-1">Quét bằng app ngân hàng bất kỳ</span>
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  <CopyRow label={`Số tài khoản (${pending.bank_id})`} value={pending.account_number} />
                  {pending.account_holder && (
                    <div className="px-4 py-2.5 rounded-2xl bg-[var(--bg-surface)]">
                      <span className="text-xs text-[var(--text-muted)] block">Chủ tài khoản</span>
                      <span className="font-semibold">{pending.account_holder}</span>
                    </div>
                  )}
                  <CopyRow label="Số tiền" value={formatVnd(pending.amount_vnd)} copyValue={String(pending.amount_vnd)} />
                  <CopyRow label="Nội dung chuyển khoản (bắt buộc)" value={pending.transfer_content} highlight />
                </div>
                <div className="flex items-start gap-2 text-sm text-[var(--text-muted)] px-4 py-3 rounded-2xl border border-[var(--border-subtle)]">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-text)] shrink-0 mt-0.5" />
                  <span>Đang chờ tiền về. Bạn có thể rời trang này, credit vẫn được cộng tự động.</span>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Lịch sử */}
        <section className="card p-4 sm:p-6">
          <h2 className="title text-lg mb-3">Lịch sử giao dịch</h2>
          {!history ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton rounded-xl h-11" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-4">Chưa có giao dịch nào.</p>
          ) : (
            <>
              {/* Máy tính: bảng */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                    <th className="py-2.5 font-medium">Nội dung</th>
                    <th className="py-2.5 font-medium">Mã giao dịch</th>
                    <th className="py-2.5 font-medium">Thời gian</th>
                    <th className="py-2.5 font-medium">Trạng thái</th>
                    <th className="py-2.5 font-medium text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((t) => (
                    <tr key={t.id} className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <TxIcon t={t} />
                          <span className="truncate max-w-[22rem]">{txLabel(t)}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs text-[var(--text-muted)]">{t.id}</td>
                      <td className="py-3 pr-3 text-[var(--text-muted)] tabular-nums whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                      <td className="py-3 pr-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-md border text-xs font-semibold ${TX_STATUS[t.status].cls}`}>
                          {TX_STATUS[t.status].label}
                        </span>
                      </td>
                      <td
                        className={`py-3 text-right font-semibold tabular-nums ${
                          t.status !== 'success' ? 'text-[var(--text-muted)]' : t.amount_credits > 0 ? 'text-[var(--ok-text)]' : ''
                        }`}
                      >
                        {t.amount_credits > 0 ? '+' : ''}
                        {formatNumber(t.amount_credits)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Điện thoại: danh sách */}
              <ul className="md:hidden divide-y divide-[var(--border-subtle)]">
                {history.map((t) => (
                  <li key={t.id} className="py-3 flex items-center gap-3 text-sm">
                    <TxIcon t={t} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{txLabel(t)}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {formatDateTime(t.created_at)}
                        {t.status !== 'success' && <> · {TX_STATUS[t.status].label}</>}
                      </div>
                    </div>
                    <span
                      className={`font-semibold tabular-nums whitespace-nowrap ${
                        t.status !== 'success' ? 'text-[var(--text-muted)]' : t.amount_credits > 0 ? 'text-[var(--ok-text)]' : ''
                      }`}
                    >
                      {t.amount_credits > 0 ? '+' : ''}
                      {formatNumber(t.amount_credits)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
