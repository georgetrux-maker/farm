import React, { useState } from 'react'
import { Check, Loader2, ThumbsDown, ThumbsUp } from 'lucide-react'
import { approveJob, rejectJob } from '../../services/api'
import { useToast } from '../ui/toastContext'

interface TryOnReviewProps {
  jobId: string
  imageUrl: string
  /** Số credit được hoàn nếu hủy (đã trừ phí thử đồ) */
  refundCredits: number
  previewCost: number
  onApproved: () => void
  onRejected: (remainingCredits: number) => void
}

const CHECKS = ['Màu sắc giống sản phẩm thật', 'Họa tiết, chi tiết không bị sai', 'Phom dáng vừa vặn với người mẫu']

/** Xem ảnh thử đồ rồi chọn: tạo video, hoặc hủy (có bước xác nhận vì tốn phí thử đồ). */
export const TryOnReview: React.FC<TryOnReviewProps> = ({
  jobId,
  imageUrl,
  refundCredits,
  previewCost,
  onApproved,
  onRejected,
}) => {
  const toast = useToast()
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [confirmReject, setConfirmReject] = useState(false)

  const approve = async () => {
    setBusy('approve')
    try {
      await approveJob(jobId)
      onApproved()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const reject = async () => {
    setBusy('reject')
    try {
      const res = await rejectJob(jobId)
      toast(`Đã hủy video và hoàn ${res.credits_refunded} credit vào ví.`, 'success')
      onRejected(res.remaining_credits)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(null)
      setConfirmReject(false)
    }
  }

  return (
    <div className="grid sm:grid-cols-2 gap-6 sm:gap-10 items-center">
      <div className="rounded-3xl overflow-hidden bg-[var(--bg-surface)]">
        <img src={imageUrl} alt="Ảnh thử đồ" className="w-full max-h-[64vh] object-contain" />
      </div>
      <div>
        <p className="eyebrow">Bước duyệt</p>
        <h2 className="display text-2xl sm:text-3xl mt-1.5">Ảnh thử đồ đã xong</h2>
        <p className="text-[var(--text-muted)] mt-2">Video sẽ được tạo từ ảnh này. Bạn kiểm tra giúp:</p>
        <ul className="mt-4 space-y-2.5 text-sm">
          {CHECKS.map((c) => (
            <li key={c} className="flex items-center gap-2.5">
              <span className="w-5 h-5 shrink-0 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center">
                <Check className="w-3 h-3" />
              </span>
              {c}
            </li>
          ))}
        </ul>

        {!confirmReject ? (
          <div className="mt-7 flex flex-col gap-2.5">
            <button onClick={approve} disabled={busy !== null} className="btn btn-primary btn-lg w-full">
              {busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
              Ưng ý, tạo video
            </button>
            <button onClick={() => setConfirmReject(true)} disabled={busy !== null} className="btn btn-secondary btn-lg w-full">
              <ThumbsDown className="w-4 h-4" /> Không ưng, hủy video này
            </button>
          </div>
        ) : (
          <div className="mt-7 p-4 rounded-2xl border border-[var(--warn-border)] bg-[var(--warn-bg)] space-y-3 animate-fade-up">
            <p className="text-sm text-[var(--text-main)]">
              Hủy video này? Bạn được hoàn <strong>{refundCredits} credit</strong>
              {previewCost > 0 && <> (giữ lại {previewCost} credit phí thử đồ đã dùng)</>}.
            </p>
            <div className="flex gap-2">
              <button onClick={reject} disabled={busy !== null} className="btn btn-danger flex-1">
                {busy === 'reject' && <Loader2 className="w-4 h-4 animate-spin" />}
                Hủy video
              </button>
              <button onClick={() => setConfirmReject(false)} disabled={busy !== null} className="btn btn-secondary flex-1">
                Quay lại
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
