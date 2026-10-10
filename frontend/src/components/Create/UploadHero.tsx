import React, { useState } from 'react'
import {
  AlertTriangle, ArrowRight, ImagePlus, Layers, Link2, Loader2, Maximize2, Sparkles, Sun, Zap
} from 'lucide-react'
import { scrapeProduct } from '../../services/api'
import { formatVnd } from '../../lib/format'

const TIPS = [
  { icon: Sun, title: 'Đủ sáng', text: 'Ánh sáng tự nhiên, không bóng gắt' },
  { icon: Maximize2, title: 'Thấy trọn sản phẩm', text: 'Trải phẳng hoặc mặc trên ma-nơ-canh' },
  { icon: Layers, title: 'Nền đơn giản', text: 'Nền trơn giúp AI tách đồ chính xác' },
]

export interface SampleProduct {
  title: string
  price: number
  fabric: string
  category: string
  image_url: string
}

const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    title: 'Đầm Voan Hoa Nhí Vintage',
    price: 289000,
    fabric: 'Voan tơ mềm mại',
    category: 'Đầm / Váy',
    image_url: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?auto=format&fit=crop&w=600&q=80',
  },
  {
    title: 'Áo Blazer Công Sở Dáng Rộng',
    price: 350000,
    fabric: 'Tuyết mưa co giãn nhẹ',
    category: 'Áo Blazer',
    image_url: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=600&q=80',
  },
  {
    title: 'Áo Thun Cotton Basic Form Rộng',
    price: 149000,
    fabric: 'Cotton 100% thoáng mát',
    category: 'Áo thun',
    image_url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80',
  },
]

interface UploadHeroProps {
  onPick: () => void
  onFile: (file: File) => void
  uploading: boolean
  error: string | null
  onProductLoaded?: (data: { title: string; price: number; fabric?: string; category?: string; image_url: string }) => void
}

export const UploadHero: React.FC<UploadHeroProps> = ({
  onPick,
  onFile,
  uploading,
  error,
  onProductLoaded,
}) => {
  const [tab, setTab] = useState<'link' | 'upload'>('link')
  const [linkInput, setLinkInput] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapeError, setScrapeError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkInput.trim()) return
    setScraping(true)
    setScrapeError(null)
    try {
      const res = await scrapeProduct(linkInput.trim())
      if (res.image_url) {
        onProductLoaded?.({
          title: res.title || 'Sản phẩm thời trang',
          price: res.price || 199000,
          fabric: res.fabric || 'Cotton',
          category: res.category || 'Thời trang',
          image_url: res.image_url,
        })
      } else {
        setScrapeError('Không tìm thấy ảnh sản phẩm từ link này. Bạn vui lòng tải ảnh trực tiếp nhé!')
      }
    } catch (err: any) {
      setScrapeError(err.message || 'Không thể đọc link. Vui lòng kiểm tra lại đường dẫn!')
    } finally {
      setScraping(false)
    }
  }

  const handleSampleClick = (sp: SampleProduct) => {
    onProductLoaded?.({
      title: sp.title,
      price: sp.price,
      fabric: sp.fabric,
      category: sp.category,
      image_url: sp.image_url,
    })
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Tab Switcher: Link vs Upload */}
      <div className="flex justify-center">
        <div className="p-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] inline-flex gap-1 shadow-sm">
          <button
            type="button"
            onClick={() => setTab('link')}
            className={`px-5 py-2 rounded-full text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all ${
              tab === 'link'
                ? 'bg-[var(--ink)] text-[var(--on-ink)] shadow-md'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Link2 className="w-4 h-4 text-[var(--accent-text)]" /> Dán link Shopee / TikTok Shop
          </button>
          <button
            type="button"
            onClick={() => setTab('upload')}
            className={`px-5 py-2 rounded-full text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all ${
              tab === 'upload'
                ? 'bg-[var(--ink)] text-[var(--on-ink)] shadow-md'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <ImagePlus className="w-4 h-4" /> Tải ảnh từ máy tính
          </button>
        </div>
      </div>

      {/* 1. DÁN LINK SHOPEE / TIKTOK SHOP */}
      {tab === 'link' && (
        <div className="card p-6 sm:p-10 space-y-4 text-center max-w-3xl mx-auto shadow-sm">
          <div className="w-14 h-14 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] mx-auto flex items-center justify-center">
            <Link2 className="w-7 h-7" />
          </div>
          <h2 className="display text-2xl sm:text-3xl font-bold">Dán link sản phẩm để tạo video</h2>
          <p className="text-sm text-[var(--text-muted)] max-w-lg mx-auto">
            Hỗ trợ link <strong>Shopee, TikTok Shop, Lazada</strong> hoặc bất kỳ website thời trang nào. Hệ thống tự động bóc tách ảnh HD, tên, giá và chất vải!
          </p>

          <form onSubmit={handleScrape} className="flex flex-col sm:flex-row gap-2.5 max-w-xl mx-auto pt-2">
            <input
              type="url"
              required
              disabled={scraping}
              className="field flex-1 text-sm h-12 px-4 rounded-xl font-sans"
              placeholder="https://shopee.vn/dam-vintage-hoa-nhi-..."
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={scraping || !linkInput.trim()}
              className="btn btn-primary h-12 px-6 text-sm font-semibold flex items-center justify-center gap-2 shrink-0 rounded-xl"
            >
              {scraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-current" />}
              {scraping ? 'Đang bóc tách...' : 'Lấy dữ liệu'}
            </button>
          </form>

          {scrapeError && (
            <div className="flex gap-2 items-center justify-center text-xs p-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)] max-w-xl mx-auto">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{scrapeError}</span>
            </div>
          )}
        </div>
      )}

      {/* 2. TẢI ẢNH TỪ MÁY */}
      {tab === 'upload' && (
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
          className={`w-full min-h-[300px] sm:min-h-[340px] rounded-[28px] border-2 border-dashed flex flex-col items-center justify-center gap-4 px-6 py-10 text-center transition-all duration-300 ${
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
          <span className="text-[var(--text-muted)] text-sm">
            hoặc <span className="font-semibold text-[var(--text-main)] underline underline-offset-4">chọn ảnh từ máy</span>
            <span> · JPG, PNG, WEBP tối đa 10MB</span>
          </span>
        </button>
      )}

      {error && (
        <div className="flex gap-2 items-start text-sm p-3 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 3. BỘ ẢNH MẪU DÙNG THỬ 1-CLICK */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent-text)]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main)]">
              Chưa có ảnh? Thử ngay với ảnh mẫu có sẵn:
            </h3>
          </div>
          <span className="text-xs text-[var(--text-muted)]">Bấm 1 click để thử nghiệm</span>
        </div>

        <div className="grid sm:grid-cols-3 gap-3.5">
          {SAMPLE_PRODUCTS.map((sp) => (
            <button
              key={sp.title}
              type="button"
              onClick={() => handleSampleClick(sp)}
              className="card p-3 flex items-center gap-3.5 text-left group hover:border-[var(--accent-color)] hover:scale-[1.01] transition-all"
            >
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-[var(--bg-surface)] shrink-0">
                <img
                  src={sp.image_url}
                  alt={sp.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold text-[var(--accent-text)] uppercase">{sp.category}</span>
                <div className="text-sm font-bold truncate text-[var(--text-main)]">{sp.title}</div>
                <div className="text-xs font-semibold text-[var(--ok-text)] mt-0.5">{formatVnd(sp.price)}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-text)] shrink-0 mr-1" />
            </button>
          ))}
        </div>
      </div>

      {/* MẸO CHỤP ẢNH */}
      <div className="grid sm:grid-cols-3 gap-3 pt-2">
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
