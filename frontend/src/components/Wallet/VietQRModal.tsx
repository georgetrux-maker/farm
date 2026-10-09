import React, { useState } from 'react'
import { X, QrCode, Copy, Check, Zap } from 'lucide-react'

interface VietQRModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccessDeposit: (addedCredits: number) => void
}

export const VietQRModal: React.FC<VietQRModalProps> = ({
  isOpen,
  onClose,
  onSuccessDeposit,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [depositAmount, setDepositAmount] = useState(200000)

  if (!isOpen) return null

  const bankName = 'MB Bank (Quân Đội)'
  const accountNumber = '0988123456'
  const transferCode = 'AURA8921'
  const qrUrl = `https://img.vietqr.io/image/MB-${accountNumber}-compact2.png?amount=${depositAmount}&addInfo=${transferCode}`

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleSimulatePayment = () => {
    // 200,000 VND -> 2,000 credits
    const credits = Math.floor(depositAmount / 100)
    onSuccessDeposit(credits)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[var(--accent-color)]" />
            <h3 className="font-semibold text-sm text-[var(--text-main)]">Nạp Credit Qua VietQR Chuẩn NAPAS</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Amount Selector */}
        <div className="mb-4">
          <label className="text-[10px] text-zinc-400 uppercase font-mono block mb-1.5">Chọn Gói Nạp</label>
          <div className="grid grid-cols-3 gap-2">
            {[100000, 200000, 500000].map((amt) => (
              <button
                key={amt}
                onClick={() => setDepositAmount(amt)}
                className={`py-2 rounded-xl text-xs font-mono font-medium transition-all border ${
                  depositAmount === amt
                    ? 'bg-[#00F5A0]/10 border-[#00F5A0] text-[#00F5A0]'
                    : 'bg-[#1A1D29] border-white/[0.06] text-zinc-400 hover:text-white'
                }`}
              >
                {amt.toLocaleString()}đ
              </button>
            ))}
          </div>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white border border-white/20 mb-4">
          <img
            src={qrUrl}
            alt="Mã VietQR"
            className="w-48 h-48 object-contain"
          />
          <span className="text-[10px] text-zinc-500 font-mono mt-1">Quét mã bằng app ngân hàng bất kỳ</span>
        </div>

        {/* Transfer details */}
        <div className="space-y-2 mb-4 text-xs font-mono">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#1A1D29] border border-white/[0.06]">
            <div>
              <span className="text-zinc-500 text-[9px] block uppercase">Ngân hàng</span>
              <span className="text-white font-sans font-medium">{bankName}</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#1A1D29] border border-white/[0.06]">
            <div>
              <span className="text-zinc-500 text-[9px] block uppercase">Số tài khoản</span>
              <span className="text-white font-bold">{accountNumber}</span>
            </div>
            <button
              onClick={() => copyToClipboard(accountNumber, 'stk')}
              className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300"
            >
              {copiedField === 'stk' ? <Check className="w-3.5 h-3.5 text-[#00F5A0]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#1A1D29] border border-white/[0.06]">
            <div>
              <span className="text-zinc-500 text-[9px] block uppercase">Nội dung chuyển khoản</span>
              <span className="text-[#00F5A0] font-bold">{transferCode}</span>
            </div>
            <button
              onClick={() => copyToClipboard(transferCode, 'code')}
              className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300"
            >
              {copiedField === 'code' ? <Check className="w-3.5 h-3.5 text-[#00F5A0]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Confirmation Button */}
        <button
          onClick={handleSimulatePayment}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#00D68B] text-black font-semibold text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,245,160,0.3)] hover:opacity-95 transition-all"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Xác Nhận Nạp +{(depositAmount / 100).toLocaleString()} Credits Ngay</span>
        </button>
      </div>
    </div>
  )
}
