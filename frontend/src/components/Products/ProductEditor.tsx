import React, { useRef, useState } from 'react'
import { ImagePlus, Link2, Loader2, Plus, X } from 'lucide-react'
import {
  createLibraryProduct, scrapeProduct, updateProduct, uploadImage, type ProductInput,
} from '../../services/api'
import type { LibraryProduct } from '../../types'
import { formatVnd } from '../../lib/format'
import { Toggle } from '../Create/Pickers'
import { Modal } from '../ui/Modal'

const QUICK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Freesize']

interface ProductEditorProps {
  open: boolean
  /** null = thêm mới */
  product: LibraryProduct | null
  onClose: () => void
  onSaved: (product: LibraryProduct, created: boolean) => void
}

const digits = (v: string) => Number(v.replace(/\D/g, '')) || 0

/** Thêm / sửa sản phẩm: ảnh, tên, giá, giá gốc, loại, chất liệu, link mua, size, cho khách thử đồ. */
export const ProductEditor: React.FC<ProductEditorProps> = ({ open, product, onClose, onSaved }) => {
  const [form, setForm] = useState(() => toForm(product))
  const [formFor, setFormFor] = useState<string | null>(product?.id ?? null)
  const [sizeDraft, setSizeDraft] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState<'upload' | 'scrape' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Mở cho sản phẩm khác (hoặc thêm mới): nạp lại ô nhập
  const key = open ? (product?.id ?? 'new') : null
  if (key !== formFor) {
    setFormFor(key)
    setForm(toForm(product))
    setError(null)
    setLink('')
    setSizeDraft('')
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const addSize = (raw: string) => {
    const size = raw.trim().toUpperCase().replace(/,/g, '')
    if (!size || size.length > 10) return
    setForm((f) => (f.sizes.includes(size) || f.sizes.length >= 12 ? f : { ...f, sizes: [...f.sizes, size] }))
    setSizeDraft('')
  }

  const upload = async (file: File) => {
    setBusy('upload')
    setError(null)
    try {
      set('image_url', (await uploadImage(file)).media_url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được ảnh')
    } finally {
      setBusy(null)
    }
  }

  const fillFromLink = async () => {
    const url = link.trim()
    if (!/^https?:\/\//i.test(url)) return setError('Link cần bắt đầu bằng https://')
    setBusy('scrape')
    setError(null)
    try {
      const res = await scrapeProduct(url)
      setForm((f) => ({
        ...f,
        title: res.title || f.title,
        price: res.price ? String(res.price) : f.price,
        category: res.category || f.category,
        fabric_type: res.fabric || f.fabric_type,
        image_url: res.image_url || f.image_url,
        product_url: f.product_url || url,
      }))
      if (res.message) setError(res.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được link')
    } finally {
      setBusy(null)
    }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const price = digits(form.price)
    const original = digits(form.original_price)
    if (!form.image_url) return setError('Vui lòng tải ảnh sản phẩm')
    if (form.title.trim().length < 2) return setError('Vui lòng nhập tên sản phẩm')
    if (!price) return setError('Vui lòng nhập giá bán')
    if (original && original <= price) return setError('Giá gốc phải cao hơn giá bán (hoặc để trống)')
    if (form.product_url && !/^https?:\/\//i.test(form.product_url.trim())) return setError('Link mua phải bắt đầu bằng https://')
    const data: ProductInput = {
      title: form.title.trim(),
      price,
      image_url: form.image_url,
      original_price: original || (product ? 0 : null),
      category: form.category.trim() || null,
      fabric_type: form.fabric_type.trim() || null,
      product_url: form.product_url.trim() || (product ? '' : null),
      sizes: form.sizes,
      tryon_enabled: form.tryon_enabled,
    }
    setBusy('save')
    try {
      const saved = product
        ? await updateProduct(product.id, { ...data, image_url: data.image_url === product.image_url ? undefined : data.image_url })
        : await createLibraryProduct(data)
      onSaved(saved, !product)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được sản phẩm')
    } finally {
      setBusy(null)
    }
  }

  const price = digits(form.price)
  const original = digits(form.original_price)

  return (
    <Modal open={open} onClose={() => busy !== 'save' && onClose()} title={product ? 'Sửa sản phẩm' : 'Thêm sản phẩm'} width="max-w-2xl">
      <form onSubmit={save} className="space-y-5" noValidate>
        {!product && (
          <div className="rounded-2xl bg-[var(--bg-surface)] p-3 sm:p-4">
            <span className="field-label flex items-center gap-1.5">
              <Link2 className="w-4 h-4" /> Điền nhanh từ link sản phẩm (không bắt buộc)
            </span>
            <div className="flex gap-2">
              <input
                className="field"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://shopee.vn/..."
                inputMode="url"
              />
              <button type="button" onClick={fillFromLink} disabled={!link.trim() || busy !== null} className="btn btn-secondary shrink-0">
                {busy === 'scrape' && <Loader2 className="w-4 h-4 animate-spin" />} Lấy thông tin
              </button>
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-[9rem_minmax(0,1fr)] gap-4 sm:gap-5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative w-32 sm:w-full aspect-[3/4] rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden flex flex-col items-center justify-center gap-1 text-sm text-[var(--text-muted)] hover:border-[var(--accent-color)] transition-colors"
            aria-label={form.image_url ? 'Đổi ảnh sản phẩm' : 'Tải ảnh sản phẩm'}
          >
            {busy === 'upload' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : form.image_url ? (
              <img src={form.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <>
                <ImagePlus className="w-6 h-6 text-[var(--accent-text)]" />
                Tải ảnh
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

          <div className="grid sm:grid-cols-2 gap-3.5 content-start">
            <label className="block sm:col-span-2">
              <span className="field-label">Tên sản phẩm *</span>
              <input className="field" value={form.title} maxLength={200} onChange={(e) => set('title', e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Giá bán (đồng) *</span>
              <input className="field" inputMode="numeric" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="189000" />
            </label>
            <label className="block">
              <span className="field-label">Giá gốc</span>
              <input className="field" inputMode="numeric" value={form.original_price} onChange={(e) => set('original_price', e.target.value)} placeholder="Để trống nếu không giảm" />
            </label>
            <label className="block">
              <span className="field-label">Loại sản phẩm</span>
              <input className="field" value={form.category} maxLength={100} onChange={(e) => set('category', e.target.value)} placeholder="Áo, Váy, Set đồ..." />
            </label>
            <label className="block">
              <span className="field-label">Chất liệu</span>
              <input className="field" value={form.fabric_type} maxLength={100} onChange={(e) => set('fabric_type', e.target.value)} placeholder="Cotton, lụa..." />
            </label>
            {price > 0 && (
              <p className="sm:col-span-2 text-sm text-[var(--text-muted)]">
                Hiển thị: <strong className="text-[var(--accent-text)]">{formatVnd(price)}</strong>
                {original > price && <span className="line-through ml-2">{formatVnd(original)}</span>}
              </p>
            )}
          </div>
        </div>

        <label className="block">
          <span className="field-label">Link mua (Shopee, TikTok Shop hoặc website)</span>
          <input
            className="field"
            inputMode="url"
            value={form.product_url}
            maxLength={2000}
            onChange={(e) => set('product_url', e.target.value)}
            placeholder="https://..."
          />
          <span className="text-xs text-[var(--text-muted)] mt-1 block">Nút "Mua ngay" trên feed của Aura sẽ mở link này.</span>
        </label>

        <div>
          <span className="field-label">Size</span>
          <div className="flex flex-wrap gap-2 items-center">
            {form.sizes.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)] text-sm font-semibold">
                {s}
                <button type="button" onClick={() => set('sizes', form.sizes.filter((x) => x !== s))} className="p-0.5 rounded hover:bg-[var(--bg-card)]" aria-label={`Bỏ size ${s}`}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            <input
              className="field w-28 py-1.5"
              value={sizeDraft}
              maxLength={10}
              placeholder="Thêm size"
              aria-label="Thêm size"
              onChange={(e) => setSizeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addSize(sizeDraft)
                }
              }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {QUICK_SIZES.filter((s) => !form.sizes.includes(s.toUpperCase())).map((s) => (
              <button key={s} type="button" onClick={() => addSize(s)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border-subtle)] text-xs text-[var(--text-sub)] hover:border-[var(--border-strong)]">
                <Plus className="w-3 h-3" /> {s}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] p-4">
          <Toggle
            checked={form.tryon_enabled}
            onChange={(v) => set('tryon_enabled', v)}
            label="Cho khách thử đồ ảo trên Aura"
            description="Khách xem video trên feed của Aura có thể thử sản phẩm này lên ảnh của mình. Mỗi lượt thử trừ credit của shop."
          />
        </div>

        {error && <p className="text-sm text-[var(--danger-text)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy === 'save'} className="btn btn-ghost">
            Hủy
          </button>
          <button type="submit" disabled={busy !== null} className="btn btn-primary">
            {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}
            {product ? 'Lưu thay đổi' : 'Thêm sản phẩm'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface FormState {
  title: string
  price: string
  original_price: string
  category: string
  fabric_type: string
  image_url: string
  product_url: string
  sizes: string[]
  tryon_enabled: boolean
}

function toForm(p: LibraryProduct | null): FormState {
  return {
    title: p?.title ?? '',
    price: p?.price ? String(p.price) : '',
    original_price: p?.original_price ? String(p.original_price) : '',
    category: p?.category ?? '',
    fabric_type: p?.fabric_type ?? '',
    image_url: p?.image_url ?? '',
    product_url: p?.product_url ?? '',
    sizes: p?.sizes ?? [],
    tryon_enabled: p?.tryon_enabled ?? false,
  }
}
