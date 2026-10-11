import React, { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, RotateCcw, ShoppingBag, Trash2 } from 'lucide-react'
import {
  createBuyerTryon, deleteBuyerTryon, fetchTryonInfo, uploadBuyerPhoto, type BuyerTryon, type FeedItem,
} from '../../services/api'
import { formatDateTime, formatVnd } from '../../lib/format'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/toastContext'

/** Hai ảnh chồng nhau, kéo thanh giữa để so sánh trước và sau khi mặc thử. */
export const BeforeAfter: React.FC<{ before: string; after: string; className?: string }> = ({ before, after, className = '' }) => {
  const [pos, setPos] = useState(50)
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-[var(--bg-surface)] select-none ${className}`}>
      <img src={before} alt="Ảnh của bạn" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      <img
        src={after}
        alt="Ảnh mặc thử"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
        draggable={false}
      />
      <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)] pointer-events-none" style={{ left: `${pos}%` }}>
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white text-[#1E1916] shadow-lg flex items-center justify-center text-xs font-bold">
          ‹›
        </span>
      </div>
      <span className="absolute top-3 left-3 rounded-full bg-black/55 text-white text-xs font-semibold px-2.5 py-1">Trước</span>
      <span className="absolute top-3 right-3 rounded-full bg-black/55 text-white text-xs font-semibold px-2.5 py-1">Sau</span>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Kéo để so sánh trước và sau"
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
      />
    </div>
  )
}

interface TryOnSheetProps {
  item: FeedItem
  onClose: () => void
}

/** Người mua thử sản phẩm lên ảnh của mình: tải ảnh, đồng ý điều khoản ảnh, chọn size, xem trước/sau, mua ngay. */
export const TryOnSheet: React.FC<TryOnSheetProps> = ({ item, onClose }) => {
  const toast = useToast()
  const p = item.product
  const [info, setInfo] = useState<{ daily_limit: number; used_24h: number; privacy_text: string } | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [size, setSize] = useState<string | null>(p.sizes.length === 1 ? p.sizes[0] : null)
  const [busy, setBusy] = useState<'upload' | 'tryon' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BuyerTryon | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    fetchTryonInfo()
      .then((res) => alive && setInfo(res))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [result])

  const upload = async (file: File) => {
    setBusy('upload')
    setError(null)
    try {
      setPhoto((await uploadBuyerPhoto(file)).photo_url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được ảnh')
    } finally {
      setBusy(null)
    }
  }

  const tryOn = async () => {
    if (!photo) return setError('Bạn tải ảnh toàn thân của mình lên trước nhé')
    if (!consent) return setError('Bạn cần đồng ý điều khoản về ảnh để thử đồ')
    setBusy('tryon')
    setError(null)
    try {
      setResult(await createBuyerTryon({ product_id: p.id, photo_url: photo, size, job_id: item.id }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa thử được, bạn thử lại nhé')
    } finally {
      setBusy(null)
    }
  }

  const removeNow = async () => {
    if (!result) return
    setBusy('delete')
    try {
      await deleteBuyerTryon(result.id)
      toast('Đã xóa ảnh của bạn khỏi máy chủ', 'success')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không xóa được ảnh', 'error')
    } finally {
      setBusy(null)
    }
  }

  const left = info ? Math.max(0, info.daily_limit - info.used_24h) : null
  const buy = p.product_url && (
    <a href={p.product_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg flex-1">
      <ShoppingBag className="w-4 h-4" /> Mua ngay{size ? `, size ${size}` : ''}
    </a>
  )

  return (
    <Modal open onClose={() => busy !== 'tryon' && onClose()} title="Thử đồ lên ảnh của bạn" width="max-w-lg">
      <div className="flex items-center gap-3 mb-5">
        <img src={p.image_url} alt="" className="w-12 h-14 rounded-xl object-cover bg-[var(--bg-surface)] shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold truncate">{p.title}</p>
          <p className="text-sm">
            <span className="text-[var(--accent-text)] font-semibold">{formatVnd(p.price)}</span>
            <span className="text-[var(--text-muted)]"> · {item.shop.name}</span>
          </p>
        </div>
      </div>

      {result ? (
        <div className="space-y-4 animate-fade-in">
          <BeforeAfter before={result.before_url} after={result.after_url} className="aspect-[9/16] h-[46vh] mx-auto max-w-full" />
          {result.engine !== 'fashn' && (
            <p className="text-xs text-[var(--text-muted)] text-center">Bản xem thử: hệ thống chưa bật AI thử đồ nên trang phục chỉ được đặt lên ảnh.</p>
          )}
          {p.sizes.length > 0 && <SizePicker sizes={p.sizes} value={size} onChange={setSize} />}
          <div className="flex flex-wrap gap-2">
            {buy}
            <button type="button" onClick={() => setResult(null)} className="btn btn-secondary btn-lg">
              <RotateCcw className="w-4 h-4" /> Thử ảnh khác
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
            <span>Ảnh tự xóa lúc {formatDateTime(result.expires_at)}</span>
            <button type="button" onClick={removeNow} disabled={busy !== null} className="inline-flex items-center gap-1 font-semibold text-[var(--danger-text)]">
              {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Xóa ảnh ngay
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative w-full max-w-[13rem] mx-auto aspect-[3/4] rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden flex flex-col items-center justify-center gap-1.5 text-sm text-[var(--text-muted)] hover:border-[var(--accent-color)] transition-colors"
            aria-label={photo ? 'Đổi ảnh của bạn' : 'Tải ảnh toàn thân của bạn'}
          >
            {busy === 'upload' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : photo ? (
              <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <>
                <ImagePlus className="w-6 h-6 text-[var(--accent-text)]" />
                <span className="font-semibold text-[var(--text-main)]">Tải ảnh toàn thân</span>
                <span className="px-4 text-center text-xs">Đứng thẳng, đủ sáng, thấy rõ người</span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
              e.target.value = ''
            }}
          />
          {p.sizes.length > 0 && <SizePicker sizes={p.sizes} value={size} onChange={setSize} />}
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--accent-color)]" />
            <span className="text-[var(--text-sub)]">
              Tôi đồng ý cho Aura dùng ảnh này để thử đồ. {info?.privacy_text ?? 'Ảnh tự xóa sau một thời gian ngắn và không hiện cho ai khác.'}
            </span>
          </label>
          {error && <p className="text-sm text-[var(--danger-text)]">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--text-muted)]">{left !== null ? `Còn ${left} lượt thử trong 24 giờ` : ''}</span>
            <button type="button" onClick={tryOn} disabled={busy !== null || left === 0} className="btn btn-primary btn-lg">
              {busy === 'tryon' && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy === 'tryon' ? 'Đang mặc thử...' : 'Thử ngay'}
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Thử đồ miễn phí cho bạn, shop trả phí cho lượt thử này.</p>
        </div>
      )}
    </Modal>
  )
}

const SizePicker: React.FC<{ sizes: string[]; value: string | null; onChange: (s: string) => void }> = ({ sizes, value, onChange }) => (
  <div>
    <span className="field-label">Chọn size</span>
    <div role="radiogroup" aria-label="Chọn size" className="flex flex-wrap gap-2">
      {sizes.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={`min-w-11 h-10 px-3 rounded-xl border text-sm font-semibold transition-colors ${
            value === s ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--on-ink)]' : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  </div>
)
