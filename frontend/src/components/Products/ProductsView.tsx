import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckSquare, ExternalLink, EyeOff, Loader2, MoreHorizontal, Pencil, Plus, Search, Shirt, Sparkles, Square, Wand2, X,
} from 'lucide-react'
import {
  ApiError, archiveProduct, batchCreateVideos, fetchProductLibrary, fetchStudioOptions, updateProduct,
} from '../../services/api'
import type { LibraryProduct } from '../../types'
import { formatNumber, formatVnd } from '../../lib/format'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/toastContext'
import { ProductEditor } from './ProductEditor'

interface ProductsViewProps {
  credits: number
  onCreateVideo: (product: LibraryProduct) => void
  onCreditsChange: (credits: number) => void
  onOpenVideos: () => void
  onOpenDeposit: () => void
}

const PAGE_SIZE = 24

/** Sản phẩm của tôi: lọc theo loại, tìm, thêm/sửa/ẩn, tạo video cho một hoặc nhiều sản phẩm cùng lúc. */
export const ProductsView: React.FC<ProductsViewProps> = ({ credits, onCreateVideo, onCreditsChange, onOpenVideos, onOpenDeposit }) => {
  const toast = useToast()
  const [items, setItems] = useState<LibraryProduct[] | null>(null)
  const [categories, setCategories] = useState<{ category: string | null; count: number }[]>([])
  const [all, setAll] = useState(0)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<string | null | 'all'>('all')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<LibraryProduct | null | 'new'>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmBatch, setConfirmBatch] = useState(false)
  const [batchBusy, setBatchBusy] = useState(false)
  const [videoCost, setVideoCost] = useState(0)
  const reqId = useRef(0)

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    fetchStudioOptions()
      .then((o) => setVideoCost(o.pipeline_cost_credits))
      .catch(() => {})
  }, [])

  const load = useCallback(
    (nextPage: number) => {
      const id = ++reqId.current
      setLoading(true)
      fetchProductLibrary({ q, category, page: nextPage, pageSize: PAGE_SIZE })
        .then((res) => {
          if (id !== reqId.current) return
          setItems((prev) => (nextPage > 1 && prev ? [...prev, ...res.items] : res.items))
          setCategories(res.categories)
          setAll(res.all)
          setTotal(res.total)
          setPage(nextPage)
          setHasMore(res.has_more)
        })
        .catch((e) => toast(e.message, 'error'))
        .finally(() => id === reqId.current && setLoading(false))
    },
    [q, category, toast],
  )

  useEffect(() => {
    const id = setTimeout(() => load(1), 0)
    return () => clearTimeout(id)
  }, [load])

  // Bấm ra ngoài thì đóng menu "..."
  useEffect(() => {
    if (!menuFor) return
    const close = () => setMenuFor(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuFor])

  const replace = (p: LibraryProduct) => setItems((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, ...p } : x)))

  const toggleTryOn = async (p: LibraryProduct) => {
    try {
      replace(await updateProduct(p.id, { tryon_enabled: !p.tryon_enabled }))
      toast(p.tryon_enabled ? `Đã tắt thử đồ cho ${p.title}` : `Khách đã thử được ${p.title} trên Aura`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không lưu được', 'error')
    }
  }

  const hide = async (p: LibraryProduct) => {
    try {
      await archiveProduct(p.id)
      toast(`Đã ẩn ${p.title}. Video đã tạo vẫn còn trong Video của tôi.`, 'success')
      load(1)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không ẩn được', 'error')
    }
  }

  const toggleSelect = (id: string) => {
    if (!selected.has(id) && selected.size >= 50) {
      toast('Mỗi lần tạo tối đa 50 video', 'info')
      return
    }
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const batchCost = selected.size * videoCost
  const runBatch = async () => {
    setBatchBusy(true)
    try {
      const res = await batchCreateVideos([...selected])
      onCreditsChange(res.remaining_credits)
      toast(`Đang tạo ${res.total_jobs} video. Xem tiến độ ở Video của tôi.`, 'success')
      setConfirmBatch(false)
      setSelecting(false)
      setSelected(new Set())
      onOpenVideos()
    } catch (e) {
      toast(e instanceof ApiError && e.status === 402 ? `${e.message}. Hãy nạp thêm credit.` : (e as Error).message, 'error')
    } finally {
      setBatchBusy(false)
    }
  }

  const tabs: { key: string | null | 'all'; label: string; count: number }[] = [
    { key: 'all', label: 'Tất cả', count: all },
    ...categories.map((c) => ({ key: c.category, label: c.category ?? 'Chưa phân loại', count: c.count })),
  ]

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6 pb-28">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="display text-3xl sm:text-4xl">Sản phẩm của tôi</h1>
            <p className="text-[var(--text-muted)] mt-2">Quản lý sản phẩm và tạo video cho nhiều sản phẩm cùng lúc.</p>
          </div>
          <div className="flex gap-2">
            {all > 0 && (
              <button
                onClick={() => {
                  setSelecting((v) => !v)
                  setSelected(new Set())
                }}
                className="btn btn-secondary"
                aria-pressed={selecting}
              >
                {selecting ? <X className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
                {selecting ? 'Thôi chọn' : 'Chọn nhiều'}
              </button>
            )}
            <button onClick={() => setEditing('new')} className="btn btn-primary">
              <Plus className="w-4 h-4" /> Thêm sản phẩm
            </button>
          </div>
        </div>

        {all > 0 && (
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)] overflow-x-auto no-scrollbar md:max-w-[60%]" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.key ?? '__none__'}
                  role="tab"
                  aria-selected={category === t.key}
                  onClick={() => setCategory(t.key)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    category === t.key ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {t.label}
                  <span className="text-xs tabular-nums opacity-70">{t.count}</span>
                </button>
              ))}
            </div>
            <div className="relative md:ml-auto md:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="search"
                className="field rounded-full pl-10"
                placeholder="Tìm sản phẩm..."
                aria-label="Tìm sản phẩm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}

        {!items ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i}>
                <div className="skeleton rounded-2xl aspect-[3/4]" />
                <div className="skeleton rounded-full h-3.5 w-3/4 mt-3" />
              </div>
            ))}
          </div>
        ) : all === 0 ? (
          <div className="card text-center py-14 px-6">
            <Shirt className="w-10 h-10 mx-auto text-[var(--accent-text)]" />
            <h2 className="title text-xl mt-4">Chưa có sản phẩm nào</h2>
            <p className="text-[var(--text-muted)] mt-2 max-w-md mx-auto">
              Thêm sản phẩm một lần, sau đó tạo video cho từng sản phẩm hoặc nhiều sản phẩm cùng lúc. Sản phẩm đã tạo video cũng tự có ở đây.
            </p>
            <button onClick={() => setEditing('new')} className="btn btn-primary btn-lg mt-6">
              <Plus className="w-4 h-4" /> Thêm sản phẩm đầu tiên
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="card text-center py-12 px-6 text-[var(--text-muted)]">Không có sản phẩm phù hợp.</div>
        ) : (
          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6 transition-opacity ${loading && page === 1 ? 'opacity-60' : ''}`}>
            {items.map((p, i) => {
              const isSelected = selected.has(p.id)
              return (
                <article key={p.id} className="group animate-fade-up flex flex-col" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                  <button
                    onClick={() => (selecting ? toggleSelect(p.id) : onCreateVideo(p))}
                    className={`relative block w-full aspect-[3/4] rounded-2xl overflow-hidden bg-[var(--bg-surface)] ring-2 ring-offset-2 ring-offset-[var(--bg-app)] transition ${
                      isSelected ? 'ring-[var(--accent-color)]' : 'ring-transparent'
                    }`}
                    aria-label={selecting ? `Chọn ${p.title}` : `Tạo video cho ${p.title}`}
                    aria-pressed={selecting ? isSelected : undefined}
                  >
                    <img src={p.image_url} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                    {selecting && (
                      <span className="absolute top-2.5 left-2.5 w-7 h-7 rounded-lg bg-[var(--bg-card)] text-[var(--accent-text)] flex items-center justify-center shadow">
                        {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-[var(--text-muted)]" />}
                      </span>
                    )}
                  </button>
                  <div className="pt-3 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="font-semibold leading-snug line-clamp-2 min-w-0">{p.title}</h3>
                      <div className="relative shrink-0 -mr-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuFor(menuFor === p.id ? null : p.id)
                          }}
                          className="icon-btn w-8 h-8"
                          aria-label={`Thao tác với ${p.title}`}
                          aria-expanded={menuFor === p.id}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuFor === p.id && (
                          <div className="absolute right-0 top-9 z-20 w-56 card p-1.5 animate-scale-in origin-top-right" onClick={(e) => e.stopPropagation()}>
                            {[
                              { icon: Wand2, label: 'Tạo video', run: () => onCreateVideo(p) },
                              { icon: Pencil, label: 'Sửa thông tin', run: () => setEditing(p) },
                              { icon: Sparkles, label: p.tryon_enabled ? 'Tắt thử đồ ảo' : 'Bật thử đồ ảo', run: () => toggleTryOn(p) },
                              ...(p.product_url ? [{ icon: ExternalLink, label: 'Mở link mua', run: () => window.open(p.product_url!, '_blank', 'noopener') }] : []),
                              { icon: EyeOff, label: 'Ẩn sản phẩm', run: () => hide(p) },
                            ].map((a) => (
                              <button
                                key={a.label}
                                onClick={() => {
                                  setMenuFor(null)
                                  a.run()
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[var(--text-sub)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-main)]"
                              >
                                <a.icon className="w-4 h-4" /> {a.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-sm mt-0.5">
                      <strong className="text-[var(--accent-text)]">{formatVnd(p.price)}</strong>
                      {p.original_price && p.original_price > p.price && (
                        <span className="ml-1.5 text-xs line-through text-[var(--text-muted)]">{formatVnd(p.original_price)}</span>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs">
                      {p.category && <span className="text-[var(--text-muted)]">{p.category}</span>}
                      <span className="text-[var(--text-muted)]">{formatNumber(p.videos_count ?? 0)} video</span>
                      {p.tryon_enabled && <span className="tag">Thử đồ</span>}
                      {p.sizes.length > 0 && <span className="text-[var(--text-muted)]">{p.sizes.join(' ')}</span>}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {items && items.length > 0 && (
          <div className="flex items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
            <span>
              Đang hiện {formatNumber(items.length)} / {formatNumber(total)} sản phẩm
            </span>
            {hasMore && (
              <button onClick={() => load(page + 1)} disabled={loading} className="btn btn-secondary btn-sm">
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Xem thêm
              </button>
            )}
          </div>
        )}
      </div>

      {/* Thanh tạo video hàng loạt */}
      {selecting && selected.size > 0 && (
        <div className="sticky bottom-3 z-20 px-4 pointer-events-none">
          <div className="max-w-3xl mx-auto card shadow-[var(--shadow-pop)] p-3 flex items-center justify-between gap-3 pointer-events-auto animate-fade-up">
            <span className="text-sm font-semibold pl-2">Đã chọn {selected.size} sản phẩm</span>
            <button onClick={() => setConfirmBatch(true)} className="btn btn-primary">
              <Wand2 className="w-4 h-4" /> Tạo {selected.size} video
            </button>
          </div>
        </div>
      )}

      <ProductEditor
        open={editing !== null}
        product={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(p, created) => {
          setEditing(null)
          toast(created ? `Đã thêm ${p.title}` : `Đã lưu ${p.title}`, 'success')
          load(1)
        }}
      />

      <Modal open={confirmBatch} onClose={() => !batchBusy && setConfirmBatch(false)} title={`Tạo ${selected.size} video`} icon={<Wand2 className="w-5 h-5" />}>
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-sub)]">
            Mỗi sản phẩm một video, dùng người mẫu mặc định, kiểu Catwalk, giọng Hoài My và lời văn GenZ. AI tự viết lời review cho từng sản phẩm.
            Muốn chỉnh riêng thì bấm vào sản phẩm để tạo từng video.
          </p>
          <div className="rounded-2xl bg-[var(--bg-surface)] p-4 text-sm flex items-center justify-between">
            <span className="text-[var(--text-muted)]">Chi phí</span>
            <strong>
              {formatNumber(batchCost)} credit <span className="font-normal text-[var(--text-muted)]">(số dư {formatNumber(credits)})</span>
            </strong>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmBatch(false)} disabled={batchBusy} className="btn btn-ghost">
              Thôi
            </button>
            {batchCost > credits ? (
              <button onClick={onOpenDeposit} className="btn btn-accent">
                <Plus className="w-4 h-4" /> Nạp thêm {formatNumber(batchCost - credits)} credit
              </button>
            ) : (
              <button onClick={runBatch} disabled={batchBusy} className="btn btn-primary">
                {batchBusy && <Loader2 className="w-4 h-4 animate-spin" />} Tạo video
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
