import React, { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, ImagePlus, Info, Layers, Link2, Loader2, Maximize2, Sparkles, Sun, Zap } from 'lucide-react'
import {
  fetchSampleProducts, prepareSampleProduct, scrapeProduct, type ProductPrefill, type SampleProduct,
} from '../../services/api'
import { formatVnd } from '../../lib/format'

const TIPS = [
  { icon: Sun, title: 'Đủ sáng', text: 'Ánh sáng tự nhiên, không bóng gắt' },
  { icon: Maximize2, title: 'Thấy trọn sản phẩm', text: 'Trải phẳng hoặc mặc trên ma-nơ-canh' },
  { icon: Layers, title: 'Nền đơn giản', text: 'Nền trơn giúp AI tách đồ chính xác' },
]

interface UploadHeroProps {
  onPick: () => void
  onFile: (file: File) => void
  uploading: boolean
  error: string | null
  /** Có thông tin sản phẩm (từ link hoặc ảnh mẫu). image_url null = còn thiếu ảnh, người dùng cần tải lên */
  onProductLoaded: (data: ProductPrefill, note: string | null) => void
  /** Đã lấy được tên/giá từ link nhưng chưa có ảnh */
  pendingPrefill?: ProductPrefill | null
}

/** Bước đầu: tải ảnh (cách chính), hoặc dán link sản phẩm, hoặc thử ngay với ảnh mẫu. */
export const UploadHero: React.FC<UploadHeroProps> = ({ onPick, onFile, uploading, error, onProductLoaded, pendingPrefill }) => {
  const [dragging, setDragging] = useState(false)
  const [link, setLink] = useState('')
  const [scraping, setScraping] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [samples, setSamples] = useState<SampleProduct[]>([])
  const [preparing, setPreparing] = useState<string | null>(null)
  const [sampleError, setSampleError] = useState<string | null>(null)

  useEffect(() => {
    fetchSampleProducts()
      .then((res) => setSamples(res.products))
      .catch(() => setSamples([]))
  }, [])

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault()
    const url = link.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      setLinkError('Link cần bắt đầu bằng https:// (copy nguyên link từ trình duyệt hoặc nút Chia sẻ)')
      return
    }
    setScraping(true)
    setLinkError(null)
    try {
      const res = await scrapeProduct(url)
      if (!res.title && !res.image_url) {
        setLinkError(res.message || 'Không đọc được thông tin từ link này. Bạn tải ảnh sản phẩm lên nhé.')
        return
      }
      onProductLoaded(
        { title: res.title || '', price: res.price, fabric: res.fabric, category: res.category, image_url: res.image_url },
        res.message,
      )
    } catch (err: any) {
      setLinkError(err.message || 'Không đọc được link. Vui lòng kiểm tra lại đường dẫn.')
    } finally {
      setScraping(false)
    }
  }

  const pickSample = async (sp: SampleProduct) => {
    setPreparing(sp.id)
    setSampleError(null)
    try {
      onProductLoaded(await prepareSampleProduct(sp.id), null)
    } catch (err: any) {
      setSampleError(err.message)
    } finally {
      setPreparing(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {pendingPrefill && (
        <div className="flex gap-2.5 items-start text-sm p-3.5 rounded-2xl border border-[var(--ok-border)] bg-[var(--ok-bg)] text-[var(--ok-text)]">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Đã lấy thông tin <strong>{pendingPrefill.title}</strong>
            {pendingPrefill.price ? ` (${formatVnd(pendingPrefill.price)})` : ''} từ link. Giờ bạn tải ảnh sản phẩm lên là xong.
          </span>
        </div>
      )}

      {/* 1. TẢI ẢNH TỪ MÁY: cách chính, chắc chắn nhất */}
      <button
        onClick={onPick}
        disabled={uploading}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) onFile(f)
        }}
        className={`w-full min-h-[280px] sm:min-h-[340px] rounded-[28px] border-2 border-dashed flex flex-col items-center justify-center gap-4 px-6 py-10 text-center transition-all duration-300 ${
          dragging
            ? 'border-[var(--accent-color)] bg-[var(--accent-soft)] scale-[1.01]'
            : 'border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--bg-card)_70%,transparent)] hover:border-[var(--accent-color)] hover:bg-[var(--bg-card)]'
        }`}
      >
        <span className="w-16 h-16 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center">
          {uploading ? <Loader2 className="w-7 h-7 animate-spin" /> : <ImagePlus className="w-7 h-7" />}
        </span>
        <span className="display text-2xl sm:text-3xl">
          {uploading ? 'Đang tải ảnh lên...' : dragging ? 'Thả ảnh vào đây' : 'Kéo thả ảnh sản phẩm vào đây'}
        </span>
        <span className="text-[var(--text-muted)]">
          hoặc <span className="font-semibold text-[var(--text-main)] underline underline-offset-4">chọn ảnh từ máy</span>
          <span className="block sm:inline text-sm mt-1 sm:mt-0"> · JPG, PNG, WEBP tối đa 10MB</span>
        </span>
      </button>

      {error && (
        <div className="flex gap-2 items-start text-sm p-3 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. DÁN LINK SẢN PHẨM */}
      <form onSubmit={handleScrape} className="card p-4 sm:p-5 space-y-3">
        <label htmlFor="product-link" className="flex items-center gap-2 font-semibold">
          <Link2 className="w-4 h-4 text-[var(--accent-text)]" /> Hoặc dán link sản phẩm
          <span className="font-normal text-sm text-[var(--text-muted)]">(Shopee, TikTok Shop, website thời trang...)</span>
        </label>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            id="product-link"
            type="url"
            inputMode="url"
            disabled={scraping}
            className="field flex-1"
            placeholder="https://shopee.vn/..."
            value={link}
            onChange={(e) => {
              setLink(e.target.value)
              setLinkError(null)
            }}
          />
          <button type="submit" disabled={scraping || !link.trim()} className="btn btn-secondary shrink-0">
            {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {scraping ? 'Đang đọc link...' : 'Lấy thông tin sản phẩm'}
          </button>
        </div>
        {linkError ? (
          <p className="flex gap-2 items-start text-sm text-[var(--danger-text)]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {linkError}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            Tự điền tên, giá, chất liệu và lấy ảnh nếu trang cho phép. Shopee/TikTok Shop thường chặn đọc tự động: khi đó bạn chỉ cần tải ảnh lên.
          </p>
        )}
      </form>

      {/* 3. ẢNH MẪU DÙNG THỬ */}
      {samples.length > 0 && (
        <section>
          <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Sparkles className="w-4 h-4 text-[var(--accent-text)]" /> Chưa có ảnh? Thử ngay với sản phẩm mẫu
          </h3>
          <div className="grid sm:grid-cols-3 gap-3">
            {samples.map((sp) => (
              <button
                key={sp.id}
                type="button"
                onClick={() => pickSample(sp)}
                disabled={preparing !== null}
                className="card p-3 flex items-center gap-3 text-left group hover:border-[var(--border-strong)] transition-colors"
              >
                <span className="w-14 h-[4.5rem] rounded-xl overflow-hidden bg-[var(--bg-surface)] shrink-0">
                  <img src={sp.thumbnail_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-[var(--text-muted)]">{sp.category}</span>
                  <span className="block text-sm font-semibold line-clamp-2">{sp.title}</span>
                  <span className="block text-sm text-[var(--text-sub)] mt-0.5">{formatVnd(sp.price)}</span>
                </span>
                {preparing === sp.id ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-main)] shrink-0" />
                )}
              </button>
            ))}
          </div>
          {sampleError && (
            <p className="flex gap-2 items-start text-sm text-[var(--danger-text)] mt-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {sampleError}
            </p>
          )}
        </section>
      )}

      {/* MẸO CHỤP ẢNH */}
      <div className="grid sm:grid-cols-3 gap-3">
        {TIPS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-3 p-4 rounded-2xl bg-[color-mix(in_srgb,var(--bg-card)_60%,transparent)]">
            <Icon className="w-5 h-5 text-[var(--accent-text)] shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold">{title}</div>
              <div className="text-sm text-[var(--text-muted)]">{text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
