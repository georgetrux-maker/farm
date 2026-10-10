import React, { useEffect, useState } from 'react'
import { Check, Copy, Loader2, QrCode } from 'lucide-react'
import { createDeposit, fetchStudioOptions, type DepositInfo } from '../../services/api'
import { formatNumber, formatVnd } from '../../lib/format'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/toastContext'

interface VietQRModalProps {
  open: boolean
  onClose: () => void
  /** Lệnh nạp đang chờ tiền về (App tự theo dõi và cộng số dư khi tiền về) */
  pending: DepositInfo | null
  onCreated: (deposit: DepositInfo) => void
  /** Bỏ mã đang chờ để tạo mã khác */
  onDiscard: () => void
}

const PACKAGES = [50000, 100000, 200000, 500000]
const VND_PER_CREDIT = 100
const MIN_VND = 10000

interface CopyRowProps {
  label: string
  value: string
  copyValue?: string
  highlight?: boolean
}

const CopyRow: React.FC<CopyRowProps> = ({ label, value, copyValue, highlight }) => {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-surface)]">
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
        className="p-2 rounded-lg hover:bg-[var(--bg-card)] text-[var(--text-muted)] shrink-0"
        aria-label={`Sao chép ${label.toLowerCase()}`}
      >
        {copied ? <Check className="w-4 h-4 text-[var(--accent-text)]" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  )
}

export const VietQRModal: React.FC<VietQRModalProps> = ({ open, onClose, pending, onCreated, onDiscard }) => {
  const [amount, setAmount] = useState(100000)
  const [custom, setCustom] = useState('')
  const [videoCost, setVideoCost] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrFailed, setQrFailed] = useState<string | null>(null) // mã giao dịch có ảnh QR không tải được

  useEffect(() => {
    if (!open || videoCost !== null) return
    fetchStudioOptions()
      .then((o) => setVideoCost(o.pipeline_cost_credits))
      .catch(() => {})
  }, [open, videoCost])

  const customVnd = Number(custom.replace(/\D/g, ''))
  const chosen = custom ? customVnd : amount
  const credits = Math.floor(chosen / VND_PER_CREDIT)

  const handleCreate = async () => {
    setError(null)
    if (chosen < MIN_VND) return setError(`Số tiền nạp tối thiểu là ${formatVnd(MIN_VND)}`)
    if (chosen % VND_PER_CREDIT) return setError(`Số tiền phải là bội số của ${VND_PER_CREDIT}đ`)
    setLoading(true)
    try {
      onCreated(await createDeposit(chosen))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nạp credit qua VietQR"
      icon={<QrCode className="w-5 h-5 text-[var(--accent-text)]" />}
    >
      {!pending ? (
        <div className="space-y-4">
          <div>
            <span className="text-sm font-medium text-[var(--text-muted)] block mb-2">Chọn số tiền</span>
            <div className="grid grid-cols-2 gap-2">
              {PACKAGES.map((amt) => {
                const active = !custom && amount === amt
                return (
                  <button
                    key={amt}
                    onClick={() => {
                      setAmount(amt)
                      setCustom('')
                    }}
                    aria-pressed={active}
                    className={`py-3 rounded-xl text-sm font-semibold border transition-colors ${
                      active
                        ? 'bg-[var(--accent-soft)] border-[var(--accent-color)] text-[var(--accent-text)]'
                        : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-main)]'
                    }`}
                  >
                    {formatVnd(amt)}
                  </button>
                )
              })}
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-[var(--text-muted)] block mb-1.5">Hoặc nhập số tiền khác (đồng)</span>
            <input
              inputMode="numeric"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="Ví dụ: 30000"
              className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--accent-color)]"
            />
          </label>

          <div className="p-3 rounded-xl bg-[var(--bg-surface)] text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Bạn nhận</span>
              <strong>{formatNumber(credits)} credit</strong>
            </div>
            {videoCost ? (
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Đủ tạo khoảng</span>
                <strong>{formatNumber(Math.floor(credits / videoCost))} video</strong>
              </div>
            ) : null}
            <p className="text-xs text-[var(--text-muted)] pt-1">
              {formatVnd(VND_PER_CREDIT)} = 1 credit{videoCost ? `, mỗi video ${videoCost} credit` : ''}.
            </p>
          </div>

          {error && <p className="text-sm text-[var(--danger-text)]">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Tạo mã QR thanh toán
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {qrFailed === pending.transaction_id ? (
            <p className="text-sm p-3 rounded-xl border border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn-text)]">
              Không tải được ảnh mã QR. Bạn chuyển khoản theo đúng thông tin bên dưới, nhớ ghi đúng nội dung chuyển khoản.
            </p>
          ) : (
            <div className="flex flex-col items-center p-4 rounded-2xl bg-white">
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
              <div className="p-3 rounded-xl bg-[var(--bg-surface)]">
                <span className="text-xs text-[var(--text-muted)] block">Chủ tài khoản</span>
                <span className="font-semibold">{pending.account_holder}</span>
              </div>
            )}
            <CopyRow label="Số tiền" value={formatVnd(pending.amount_vnd)} copyValue={String(pending.amount_vnd)} />
            <CopyRow label="Nội dung chuyển khoản (bắt buộc)" value={pending.transfer_content} highlight />
          </div>
          <div className="flex items-start gap-2 text-sm text-[var(--text-muted)] p-3 rounded-xl border border-[var(--border-subtle)]">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-text)] shrink-0 mt-0.5" />
            <span>
              Đang chờ tiền về. Credit được cộng tự động sau khi chuyển khoản, bạn có thể đóng cửa sổ này và tiếp tục làm
              việc.
            </span>
          </div>
          <button onClick={onDiscard} className="text-sm text-[var(--accent-text)] font-medium">
            Nạp số tiền khác
          </button>
        </div>
      )}
    </Modal>
  )
}
