import React, { useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { fetchProductLibrary } from '../../services/api'
import type { LibraryProduct } from '../../types'
import { formatVnd } from '../../lib/format'
import { Modal } from '../ui/Modal'

interface ProductPickerModalProps {
  open: boolean
  onClose: () => void
  onPick: (product: LibraryProduct) => void
  onAdd: () => void
}

/** Chọn sản phẩm từ "Sản phẩm của tôi" (tìm theo tên), hoặc thêm sản phẩm mới. */
export const ProductPickerModal: React.FC<ProductPickerModalProps> = ({ open, onClose, onPick, onAdd }) => {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<LibraryProduct[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    const id = setTimeout(() => {
      setLoading(true)
      fetchProductLibrary({ q, pageSize: 60 })
        .then((res) => {
          if (!alive) return
          setItems(res.items)
          setError(null)
        })
        .catch((e) => alive && setError(e instanceof Error ? e.message : 'Không tải được sản phẩm'))
        .finally(() => alive && setLoading(false))
    }, q ? 250 : 0)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [open, q])

  return (
    <Modal open={open} onClose={onClose} title="Chọn sản phẩm" width="max-w-3xl">
      <div className="flex gap-2 mb-4">
        <label className="relative flex-1">
          <span className="sr-only">Tìm sản phẩm</span>
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input className="field pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên sản phẩm" />
        </label>
        <button type="button" onClick={onAdd} className="btn btn-secondary shrink-0">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm sản phẩm</span>
        </button>
      </div>
      {error && <p className="text-sm text-[var(--danger-text)] mb-3">{error}</p>}
      {items === null ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton rounded-2xl aspect-[3/4]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 space-y-3">
          <p className="text-[var(--text-muted)]">{q ? 'Không có sản phẩm nào khớp với tìm kiếm.' : 'Bạn chưa có sản phẩm nào.'}</p>
          <button type="button" onClick={onAdd} className="btn btn-primary">
            <Plus className="w-4 h-4" /> Thêm sản phẩm
          </button>
        </div>
      ) : (
        <div className={`grid grid-cols-3 sm:grid-cols-4 gap-3 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {items.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(p)} className="group text-left min-w-0">
              <span className="block overflow-hidden rounded-2xl bg-[var(--bg-surface)] ring-2 ring-transparent group-hover:ring-[var(--border-strong)] transition">
                <img src={p.image_url} alt="" loading="lazy" className="w-full aspect-[3/4] object-cover" />
              </span>
              <span className="block mt-2 text-sm font-semibold truncate">{p.title}</span>
              <span className="block text-xs text-[var(--accent-text)] font-semibold">{formatVnd(p.price)}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
