import React, { useEffect, useState } from 'react'
import { X, QrCode, Copy, Check, Loader2 } from 'lucide-react'
import { createDeposit, fetchDepositStatus, type DepositInfo } from '../../services/api'

interface VietQRModalProps {
  isOpen: boolean
  onClose: () => void
  /** Gọi với số dư mới sau khi máy chủ xác nhận đã nhận tiền */
  onSuccessDeposit: (newBalance: number) => void
}

const PACKAGES = [100000, 200000, 500000]

interface CopyRowProps {
  label: string
  value: string
  field: string
  accent?: boolean
  copiedField: string | null
  onCopy: (text: string, field: string) => void
}

const CopyRow: React.FC<CopyRowProps> = ({ label, value, field, accent, copiedField, onCopy }) => (
  <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
    <div>
      <span className="text-[var(--text-muted)] text-[9px] block uppercase">{label}</span>
      <span className={accent ? 'text-[var(--accent-color)] font-bold' : 'text-[var(--text-main)] font-bold'}>{value}</span>
    </div>
    <button
      onClick={() => onCopy(value, field)}
      className="p-1.5 rounded-lg hover:bg-[var(--bg-card)] text-[var(--text-muted)]"
      title="Sao chép"
    >
      {copiedField === field ? <Check className="w-3.5 h-3.5 text-[var(--accent-color)]" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  </div>
)

export const VietQRModal: React.FC<VietQRModalProps> = ({ isOpen, onClose, onSuccessDeposit }) => {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [depositAmount, setDepositAmount] = useState(200000)
  const [deposit, setDeposit] = useState<DepositInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Đang chờ tiền về: hỏi máy chủ mỗi 5 giây
  useEffect(() => {
    if (!isOpen || !deposit) return
    const timer = setInterval(async () => {
      try {
        const tx = await fetchDepositStatus(deposit.transaction_id)
        if (tx.status === 'success') {
          clearInterval(timer)
          onSuccessDeposit(tx.balance)
          setDeposit(null)
          onClose()
        }
      } catch (e) {
        console.error(e)
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [isOpen, deposit, onClose, onSuccessDeposit])

  if (!isOpen) return null

  const handleCreate = async () => {
    setLoading(true)
    setError(null)
    try {
      setDeposit(await createDeposit(depositAmount))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setDeposit(null)
    setError(null)
    onClose()
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[var(--accent-color)]" />
            <h3 className="font-semibold text-sm text-[var(--text-main)]">Nạp Credit Qua VietQR</h3>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!deposit ? (
          <>
            <label className="text-[10px] text-[var(--text-muted)] uppercase font-mono block mb-1.5">Chọn Gói Nạp</label>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {PACKAGES.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setDepositAmount(amt)}
                  className={`py-2 rounded-xl text-xs font-mono font-medium transition-all border ${
                    depositAmount === amt
                      ? 'bg-[var(--accent-color)]/10 border-[var(--accent-color)] text-[var(--accent-color)]'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {amt.toLocaleString('vi-VN')}đ
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              Nhận {(depositAmount / 100).toLocaleString('vi-VN')} credit (100đ = 1 credit).
            </p>
            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-xs flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Tạo Mã QR Thanh Toán</span>
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white mb-4">
              <img src={deposit.qr_code_url} alt="Mã VietQR" className="w-48 h-48 object-contain" />
              <span className="text-[10px] text-zinc-500 font-mono mt-1">Quét mã bằng app ngân hàng bất kỳ</span>
            </div>
            <div className="space-y-2 mb-4 text-xs font-mono">
              <CopyRow label={`Số tài khoản (${deposit.bank_id})`} value={deposit.account_number} field="stk" copiedField={copiedField} onCopy={copyToClipboard} />
              <CopyRow label="Số tiền" value={`${deposit.amount_vnd.toLocaleString('vi-VN')}đ`} field="amount" copiedField={copiedField} onCopy={copyToClipboard} />
              <CopyRow label="Nội dung chuyển khoản (bắt buộc)" value={deposit.transfer_content} field="code" accent copiedField={copiedField} onCopy={copyToClipboard} />
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-color)] shrink-0" />
              <span>
                Đang chờ xác nhận tiền về. Credit sẽ được cộng tự động, bạn có thể đóng cửa sổ này.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
