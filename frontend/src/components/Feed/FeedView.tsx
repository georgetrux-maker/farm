import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Bookmark, Heart, Loader2, Share2, Shirt, ShoppingBag, Volume2, VolumeX } from 'lucide-react'
import {
  countFeedView, fetchFeed, fetchFeedItem, reactFeed, type FeedItem, type FeedSort, type UserProfile,
} from '../../services/api'
import { formatNumber, formatVnd } from '../../lib/format'
import { useToast } from '../ui/toastContext'
import { TryOnSheet } from './TryOnSheet'

interface FeedViewProps {
  /** null = khách chưa đăng nhập: vẫn xem được, bấm thích/lưu/thử đồ thì mời đăng nhập */
  user: UserProfile | null
  /** Mở từ link chia sẻ: video này hiện đầu tiên */
  startId?: string | null
  /** Tab mở sẵn: Dành cho bạn (mới nhất) hoặc Xu hướng */
  initialSort?: FeedSort
  onRequireLogin: (reason: string) => void
}

const PAGE_SIZE = 8

const openShop = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

/** Một video toàn khung: tự phát khi đang xem, chạm để bật/tắt tiếng; nút thích, lưu, chia sẻ, thử đồ, mua ngay. */
const FeedCard: React.FC<{
  item: FeedItem
  active: boolean
  muted: boolean
  onToggleMute: () => void
  onReact: (kind: 'like' | 'save') => void
  onShare: () => void
  onTryOn: () => void
}> = ({ item, active, muted, onToggleMute, onReact, onShare, onTryOn }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (active) v.play().catch(() => {})
    else v.pause()
  }, [active])

  const p = item.product
  return (
    <article className="relative h-full w-full snap-start snap-always overflow-hidden bg-[#0E0B0A] text-white" aria-label={p.title}>
      <video
        ref={videoRef}
        src={item.video_url}
        poster={item.poster_url ?? undefined}
        muted={muted}
        loop
        playsInline
        preload={active ? 'auto' : 'metadata'}
        onClick={onToggleMute}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <button
        type="button"
        onClick={onToggleMute}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center"
        aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      {/* Nút thao tác bên phải */}
      <div className="absolute z-10 right-3 bottom-40 flex flex-col items-center gap-4">
        {[
          { key: 'like', icon: Heart, label: item.liked ? 'Bỏ thích' : 'Thích', count: item.likes, on: item.liked, run: () => onReact('like') },
          { key: 'save', icon: Bookmark, label: item.saved ? 'Bỏ lưu' : 'Lưu', count: item.saves, on: item.saved, run: () => onReact('save') },
          { key: 'share', icon: Share2, label: 'Chia sẻ', count: null, on: false, run: onShare },
        ].map((a) => (
          <button key={a.key} type="button" onClick={a.run} aria-label={a.label} aria-pressed={a.key !== 'share' ? a.on : undefined} className="flex flex-col items-center gap-1">
            <span className="w-12 h-12 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
              <a.icon className={`w-6 h-6 ${a.on ? 'fill-current text-[#FF7A93]' : ''}`} />
            </span>
            {a.count !== null && <span className="text-xs font-semibold tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">{formatNumber(a.count)}</span>}
          </button>
        ))}
        {p.tryon_enabled && (
          <button type="button" onClick={onTryOn} aria-label="Thử đồ lên ảnh của bạn" className="flex flex-col items-center gap-1">
            <span className="w-12 h-12 rounded-full bg-white text-[#1E1916] flex items-center justify-center shadow-lg">
              <Shirt className="w-6 h-6" />
            </span>
            <span className="text-xs font-semibold [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">Thử đồ</span>
          </button>
        )}
      </div>

      {/* Thông tin sản phẩm + Mua ngay */}
      <div className="absolute inset-x-0 bottom-0 pt-24 pb-4 px-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
        <p className="font-semibold text-sm">@{item.shop.name}</p>
        {item.caption && <p className="text-sm text-white/85 mt-1 line-clamp-2 pr-16">{item.caption}</p>}
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/95 text-[#1E1916] p-2.5 pr-3 pointer-events-auto">
          <img src={p.image_url} alt="" className="w-12 h-14 rounded-xl object-cover bg-[#F1ECE6] shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{p.title}</p>
            <p className="text-sm">
              <strong className="text-[#A8506A]">{formatVnd(p.price)}</strong>
              {p.original_price && p.original_price > p.price && (
                <span className="line-through text-[#6F6660] ml-1.5 text-xs">{formatVnd(p.original_price)}</span>
              )}
            </p>
            {p.sizes.length > 0 && <p className="text-xs text-[#6F6660] truncate">Size {p.sizes.join(', ')}</p>}
          </div>
          {p.product_url && (
            <button type="button" onClick={() => openShop(p.product_url!)} className="shrink-0 h-10 px-4 rounded-xl bg-[#1E1916] text-white text-sm font-semibold flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4" /> Mua ngay
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

/** Feed video dọc của Aura: vuốt lên/xuống để xem video kế tiếp. */
export const FeedView: React.FC<FeedViewProps> = ({ user, startId, initialSort = 'new', onRequireLogin }) => {
  const toast = useToast()
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [active, setActive] = useState(0)
  const [muted, setMuted] = useState(true)
  const [tryOn, setTryOn] = useState<FeedItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<FeedSort>(initialSort)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const counted = useRef(new Set<string>())

  // Trang đầu (kèm video được chia sẻ, nếu có, ở vị trí đầu tiên)
  useEffect(() => {
    let alive = true
    Promise.all([fetchFeed(1, PAGE_SIZE, sort), startId ? fetchFeedItem(startId).catch(() => null) : Promise.resolve(null)])
      .then(([res, first]) => {
        if (!alive) return
        const rest = res.items.filter((i) => i.id !== first?.id)
        setItems(first ? [first, ...rest] : rest)
        setHasMore(res.has_more)
        setPage(1)
        setActive(0)
        scrollerRef.current?.scrollTo({ top: 0 })
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Không tải được feed'))
    return () => {
      alive = false
    }
  }, [startId, sort, user?.id])

  // Video nào đang chiếm phần lớn màn hình thì là video đang xem
  useEffect(() => {
    const root = scrollerRef.current
    if (!root || !items?.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index))
        }
      },
      { root, threshold: 0.6 },
    )
    root.querySelectorAll('[data-index]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [items])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const res = await fetchFeed(page + 1, PAGE_SIZE, sort)
      setItems((list) => {
        const seen = new Set((list ?? []).map((i) => i.id))
        return [...(list ?? []), ...res.items.filter((i) => !seen.has(i.id))]
      })
      setHasMore(res.has_more)
      setPage((n) => n + 1)
    } catch {
      // thử lại khi cuộn tiếp
    } finally {
      setLoadingMore(false)
    }
  }, [page, sort])

  // Đếm lượt xem một lần cho mỗi video; gần hết danh sách thì tải thêm
  const current = items?.[active]
  useEffect(() => {
    if (!current || counted.current.has(current.id)) return
    counted.current.add(current.id)
    countFeedView(current.id)
  }, [current])
  const nearEnd = !!items && active >= items.length - 2
  useEffect(() => {
    if (!nearEnd || !hasMore || loadingMore) return
    const id = setTimeout(loadMore, 0)
    return () => clearTimeout(id)
  }, [nearEnd, hasMore, loadingMore, loadMore])

  const patch = (id: string, change: Partial<FeedItem>) =>
    setItems((list) => list?.map((i) => (i.id === id ? { ...i, ...change } : i)) ?? null)

  const react = async (item: FeedItem, kind: 'like' | 'save') => {
    if (!user) return onRequireLogin(kind === 'like' ? 'Đăng nhập để thả tim video' : 'Đăng nhập để lưu video')
    const on = kind === 'like' ? !item.liked : !item.saved
    const countKey = kind === 'like' ? 'likes' : 'saves'
    patch(item.id, { [kind === 'like' ? 'liked' : 'saved']: on, [countKey]: Math.max(0, item[countKey] + (on ? 1 : -1)) })
    try {
      const res = await reactFeed(item.id, kind, on)
      patch(item.id, { [countKey]: res.count })
      if (kind === 'save' && on) toast('Đã lưu video', 'success')
    } catch (e) {
      patch(item.id, { [kind === 'like' ? 'liked' : 'saved']: !on, [countKey]: item[countKey] })
      toast(e instanceof Error ? e.message : 'Không lưu được', 'error')
    }
  }

  const share = async (item: FeedItem) => {
    const url = `${window.location.origin}${window.location.pathname}#feed/${item.id}`
    try {
      if (navigator.share) {
        await navigator.share({ title: item.product.title, text: `${item.product.title} của ${item.shop.name} trên Aura`, url })
      } else {
        await navigator.clipboard.writeText(url)
        toast('Đã sao chép link video', 'success')
      }
    } catch {
      // người dùng đóng hộp chia sẻ
    }
  }

  const openTryOn = (item: FeedItem) => {
    if (!user) return onRequireLogin('Đăng nhập để thử đồ lên ảnh của bạn')
    setTryOn(item)
  }

  return (
    <div className="flex-1 h-full min-h-0 flex justify-center bg-[#0E0B0A]">
      <div
        ref={scrollerRef}
        className="relative h-full w-full sm:max-w-[min(100%,calc((100dvh-4rem)*9/16))] overflow-y-scroll snap-y snap-mandatory no-scrollbar"
        aria-label="Feed video"
      >
        {/* Tab nổi phía trên video (như demo) */}
        <div
          role="tablist"
          aria-label="Nguồn video"
          className="sticky top-3 z-20 -mb-10 h-10 mx-auto w-fit flex items-center gap-1 rounded-full bg-black/35 backdrop-blur px-1.5"
        >
          {(
            [
              { id: 'new', label: 'Dành cho bạn' },
              { id: 'top', label: 'Xu hướng' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={sort === t.id}
              onClick={() => {
                if (sort !== t.id) {
                  setItems(null)
                  setSort(t.id)
                }
              }}
              className={`h-8 px-3.5 rounded-full text-sm font-semibold transition-colors ${
                sort === t.id ? 'bg-white text-[#1E1916]' : 'text-white/85 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {items === null ? (
          <div className="h-full flex items-center justify-center text-white/70">
            {error ?? <Loader2 className="w-6 h-6 animate-spin" aria-label="Đang tải" />}
          </div>
        ) : items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center text-white/80 px-8">
            <p className="font-semibold text-lg">Chưa có video nào trên feed</p>
            <p className="text-sm text-white/60">Các shop đang chuẩn bị video, bạn quay lại sau nhé.</p>
          </div>
        ) : (
          items.map((item, i) => (
            <div key={item.id} data-index={i} className="h-full">
              {Math.abs(i - active) <= 2 ? (
                <FeedCard
                  item={item}
                  active={i === active && !tryOn}
                  muted={muted}
                  onToggleMute={() => setMuted((m) => !m)}
                  onReact={(kind) => react(item, kind)}
                  onShare={() => share(item)}
                  onTryOn={() => openTryOn(item)}
                />
              ) : (
                <div className="h-full snap-start" />
              )}
            </div>
          ))
        )}
        {loadingMore && (
          <div className="absolute bottom-2 inset-x-0 flex justify-center text-white/70">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
      </div>
      {tryOn && <TryOnSheet item={tryOn} onClose={() => setTryOn(null)} />}
    </div>
  )
}
