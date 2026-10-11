import React, { useEffect, useRef, useState } from 'react'
import { Bookmark, Clapperboard, LogOut, Moon, Shirt, ShoppingBag, Sun, Trash2, TrendingUp } from 'lucide-react'
import {
  deleteBuyerTryon, fetchBuyerTryons, fetchSavedFeed, type BuyerTryon, type FeedItem, type UserProfile,
} from '../../services/api'
import { formatDateTime, formatVnd } from '../../lib/format'
import type { ThemeMode } from '../../lib/theme'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { Wordmark } from '../ui/Wordmark'
import { useToast } from '../ui/toastContext'
import { BeforeAfter } from './TryOnSheet'
import { FeedView } from './FeedView'

type BuyerView = 'feed' | 'trending' | 'saved' | 'tryons'
const TABS: { id: BuyerView; label: string; icon: React.ElementType }[] = [
  { id: 'feed', label: 'Feed', icon: Clapperboard },
  { id: 'trending', label: 'Xu hướng', icon: TrendingUp },
  { id: 'saved', label: 'Đã lưu', icon: Bookmark },
  { id: 'tryons', label: 'Ảnh thử đồ', icon: Shirt },
]

/** "#feed/JOB_1" -> { view: 'feed', id: 'JOB_1' } */
function parseBuyerHash(hash: string): { view: BuyerView; id: string | null } {
  const [head, id] = hash.replace(/^#\/?/, '').split('/')
  const view = (['feed', 'trending', 'saved', 'tryons'] as const).find((v) => v === head) ?? 'feed'
  return { view, id: view === 'feed' && id ? decodeURIComponent(id) : null }
}

const SavedView: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => {
  const [items, setItems] = useState<FeedItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchSavedFeed()
      .then((res) => alive && setItems(res.items))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [])
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <h1 className="display text-3xl">Video đã lưu</h1>
        {items === null ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton rounded-2xl aspect-[9/16]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-[var(--text-muted)]">Bấm biểu tượng lưu trên video để xem lại ở đây.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((i) => (
              <button key={i.id} type="button" onClick={() => onOpen(i.id)} className="group text-left min-w-0">
                <span className="block relative aspect-[9/16] rounded-2xl overflow-hidden bg-[var(--bg-surface)]">
                  <img src={i.poster_url || i.product.image_url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]" />
                </span>
                <span className="block mt-2 text-sm font-semibold truncate">{i.product.title}</span>
                <span className="block text-xs text-[var(--text-muted)] truncate">
                  {formatVnd(i.product.price)} · {i.shop.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const TryonsView: React.FC = () => {
  const toast = useToast()
  const [items, setItems] = useState<BuyerTryon[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBuyerTryons()
      .then((res) => alive && setItems(res.items))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [])
  const remove = async (id: string) => {
    try {
      await deleteBuyerTryon(id)
      setItems((list) => list?.filter((t) => t.id !== id) ?? null)
      toast('Đã xóa ảnh khỏi máy chủ', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không xóa được', 'error')
    }
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div>
          <h1 className="display text-3xl">Ảnh thử đồ</h1>
          <p className="text-[var(--text-muted)] mt-1.5">Ảnh của bạn và ảnh mặc thử tự xóa khỏi máy chủ khi hết hạn. Bạn có thể xóa sớm hơn.</p>
        </div>
        {items === null ? (
          <div className="skeleton rounded-2xl h-64" />
        ) : items.length === 0 ? (
          <p className="text-[var(--text-muted)]">Chưa có ảnh nào. Bấm “Thử đồ” trên video có biểu tượng chiếc áo để thử.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {items.map((t) => (
              <article key={t.id} className="card p-3 sm:p-4 space-y-3">
                <BeforeAfter before={t.before_url} after={t.after_url} className="aspect-[3/4]" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{t.product?.title}</p>
                    <p className="text-sm text-[var(--text-muted)]">
                      {t.product && formatVnd(t.product.price)}
                      {t.size ? ` · size ${t.size}` : ''}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">Tự xóa lúc {formatDateTime(t.expires_at)}</p>
                  </div>
                  <button type="button" onClick={() => remove(t.id)} className="icon-btn shrink-0" aria-label="Xóa ảnh thử đồ này">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {t.product?.product_url && (
                  <a href={t.product.product_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full">
                    <ShoppingBag className="w-4 h-4" /> Mua ngay
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface BuyerAppProps {
  user: UserProfile
  mode: ThemeMode
  onModeChange: (mode: ThemeMode) => void
  onLogout: () => void
}

/** App của người mua: feed video, video đã lưu, ảnh thử đồ. */
export const BuyerApp: React.FC<BuyerAppProps> = ({ user, mode, onModeChange, onLogout }) => {
  const [route, setRoute] = useState(() => parseBuyerHash(window.location.hash))
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEscapeKey(menuOpen, () => setMenuOpen(false))

  useEffect(() => {
    const onHash = () => setRoute(parseBuyerHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const go = (view: BuyerView, id?: string) => {
    window.location.hash = id ? `${view}/${encodeURIComponent(id)}` : view
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col text-[var(--text-main)]">
      <header className="h-14 shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => go('feed')} aria-label="Aura, về feed">
          <Wordmark className="text-xl" />
        </button>
        <nav className="hidden sm:flex gap-1" aria-label="Menu người mua">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => go(t.id)}
              aria-current={route.view === t.id ? 'page' : undefined}
              className={`h-9 px-3.5 rounded-full text-sm font-semibold flex items-center gap-1.5 ${
                route.view === t.id ? 'bg-[var(--accent-soft)] text-[var(--accent-text)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </nav>
        <div className="relative flex items-center gap-1" ref={menuRef}>
          <button
            type="button"
            onClick={() => onModeChange(mode === 'dark' ? 'light' : 'dark')}
            className="icon-btn"
            aria-label={mode === 'dark' ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
          >
            {mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-label="Tài khoản"
            className="w-9 h-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold"
          >
            {user.name.trim().charAt(0).toUpperCase() || 'A'}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 w-60 card p-2 shadow-[var(--shadow-pop)] z-30 animate-scale-in">
              <div className="px-3 py-2">
                <p className="font-semibold truncate">{user.name}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{user.email}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">Tài khoản người mua</p>
              </div>
              <button type="button" onClick={onLogout} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm hover:bg-[var(--bg-surface)]">
                <LogOut className="w-4 h-4" /> Đăng xuất
              </button>
            </div>
          )}
        </div>
      </header>

      <main id="noi-dung" className="flex-1 min-h-0 flex">
        {route.view === 'feed' && <FeedView key="feed" user={user} startId={route.id} onRequireLogin={() => {}} />}
        {route.view === 'trending' && <FeedView key="trending" user={user} initialSort="top" onRequireLogin={() => {}} />}
        {route.view === 'saved' && <SavedView onOpen={(id) => go('feed', id)} />}
        {route.view === 'tryons' && <TryonsView />}
      </main>

      <nav className="sm:hidden shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-card)] grid grid-cols-4 pb-[env(safe-area-inset-bottom)]" aria-label="Menu người mua">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => go(t.id)}
            aria-current={route.view === t.id ? 'page' : undefined}
            className={`h-14 flex flex-col items-center justify-center gap-0.5 text-xs font-medium ${
              route.view === t.id ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'
            }`}
          >
            <t.icon className="w-5 h-5" />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
