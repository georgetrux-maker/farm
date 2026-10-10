import React, { useState } from 'react'
import { Loader2, ThumbsDown, ThumbsUp } from 'lucide-react'
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
    <div className="grid sm:grid-cols-2 gap-5 sm:gap-6 items-center">
      <img
        src={imageUrl}
        alt="Ảnh thử đồ"
        className="w-full max-h-[60dvh] object-contain rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
      />
      <div className="space-y-4">
        <h2 className="font-semibold text-lg">Ảnh thử đồ đã xong</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Kiểm tra màu sắc, họa tiết và phom dáng có đúng với sản phẩm thật không. Video sẽ được tạo từ ảnh này.
        </p>

        {!confirmReject ? (
          <>
            <button
              onClick={approve}
              disabled={busy !== null}
              className="w-full py-3 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
              Ưng ý, tạo video
            </button>
            <button
              onClick={() => setConfirmReject(true)}
              disabled={busy !== null}
              className="w-full py-3 rounded-xl border border-[var(--border-strong)] text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ThumbsDown className="w-4 h-4" /> Không ưng, hủy video này
            </button>
          </>
        ) : (
          <div className="p-4 rounded-xl border border-[var(--warn-border)] bg-[var(--warn-bg)] space-y-3">
            <p className="text-sm text-[var(--text-main)]">
              Hủy video này? Bạn được hoàn <strong>{refundCredits} credit</strong>
              {previewCost > 0 && <> (giữ lại {previewCost} credit phí thử đồ đã dùng)</>}.
            </p>
            <div className="flex gap-2">
              <button
                onClick={reject}
                disabled={busy !== null}
                className="flex-1 py-2.5 rounded-xl bg-[var(--danger-solid)] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy === 'reject' && <Loader2 className="w-4 h-4 animate-spin" />}
                Hủy video
              </button>
              <button
                onClick={() => setConfirmReject(false)}
                disabled={busy !== null}
                className="flex-1 py-2.5 rounded-xl border border-[var(--border-strong)] text-sm font-medium"
              >
                Quay lại
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
