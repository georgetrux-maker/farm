import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Info, Link2, Loader2, LogIn, Send, Unlink } from 'lucide-react'
import {
  disconnectSocial, fetchPublications, fetchSocialStatus, startSocialConnect,
  type Publication, type SocialAccount, type SocialStatus,
} from '../../services/api'
import { formatDateTime } from '../../lib/format'
import { FacebookLogo, TikTokLogo } from '../ui/BrandLogos'
import { StatusBadge } from '../ui/StatusBadge'
import { useToast } from '../ui/toastContext'

const PLATFORMS = [
  {
    id: 'tiktok' as const,
    name: 'TikTok',
    logo: <TikTokLogo className="w-6 h-6" />,
    badge: 'bg-[#111111] text-white',
    note: 'Đăng video thẳng lên tài khoản TikTok của bạn.',
    env: 'TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET',
  },
  {
    id: 'facebook' as const,
    name: 'Trang Facebook (Reels)',
    logo: <FacebookLogo className="w-6 h-6" />,
    badge: 'bg-[#1877F2] text-white',
    note: 'Đăng Reels lên Trang Facebook bạn quản lý. Video dọc 9:16, dài 3 đến 90 giây.',
    env: 'FACEBOOK_APP_ID, FACEBOOK_APP_SECRET',
  },
]

const GUIDE = [
  { icon: Link2, title: 'Bấm “Kết nối”', text: 'Chọn TikTok hoặc Trang Facebook bạn muốn đăng video.' },
  { icon: LogIn, title: 'Đăng nhập & cho phép', text: 'Đăng nhập trên trang của TikTok/Facebook và đồng ý cho Aura đăng video.' },
  { icon: Send, title: 'Đăng từ Aura', text: 'Ở mỗi video đã tạo, bấm Đăng TikTok hoặc Đăng Facebook là xong.' },
]

interface ConnectViewProps {
  isAdmin: boolean
}

/** Kết nối TikTok / Trang Facebook để đăng video, kèm lịch sử đăng. */
export const ConnectView: React.FC<ConnectViewProps> = ({ isAdmin }) => {
  const toast = useToast()
  const [status, setStatus] = useState<SocialStatus | null>(null)
  const [pubs, setPubs] = useState<Publication[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchSocialStatus()
      .then((s) => {
        setStatus(s)
        setLoadError(null)
      })
      .catch((e) => setLoadError(e.message))
    fetchPublications()
      .then(setPubs)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [load])

  const connect = async (platform: 'tiktok' | 'facebook') => {
    setBusy(platform)
    try {
      await startSocialConnect(platform) // chuyển sang trang cấp quyền của nền tảng
    } catch (e: any) {
      toast(e.message, 'error')
      setBusy(null)
    }
  }

  const disconnect = async (account: SocialAccount) => {
    setBusy(account.id)
    try {
      await disconnectSocial(account.id)
      toast(`Đã ngắt kết nối ${account.display_name}`, 'success')
      load()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(null)
      setConfirmId(null)
    }
  }

  const nothingConfigured = status && !status.platforms.tiktok && !status.platforms.facebook

  return (
    <div className="flex-1 h-full overflow-y-auto text-[var(--text-main)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6">
        <div>
          <p className="eyebrow">Kênh bán hàng</p>
          <h1 className="display text-3xl sm:text-4xl mt-1.5">Kênh liên kết</h1>
          <p className="text-[var(--text-muted)] mt-2">
            Kết nối một lần, sau đó đăng video lên TikTok hoặc Facebook ngay trong Aura.
          </p>
        </div>

        <section className="card p-5 sm:p-6">
          <h2 className="display text-xl">Kết nối trong 3 bước</h2>
          <ol className="grid sm:grid-cols-3 gap-3 sm:gap-4 mt-4">
            {GUIDE.map((g, i) => (
              <li key={g.title} className="flex sm:flex-col gap-3 p-4 rounded-2xl bg-[var(--bg-surface)]">
                <span className="relative w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center shrink-0">
                  <g.icon className="w-5 h-5" />
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--ink)] text-[var(--on-ink)] text-[11px] font-semibold flex items-center justify-center">
                    {i + 1}
                  </span>
                </span>
                <div>
                  <p className="font-semibold">{g.title}</p>
                  <p className="text-sm text-[var(--text-muted)] mt-0.5">{g.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {loadError && (
          <div className="flex gap-2 items-center text-sm p-3 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{loadError}</span>
            <button onClick={load} className="font-semibold underline">
              Thử lại
            </button>
          </div>
        )}
        {!status && !loadError && (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton rounded-[1.25rem] h-28" />
            ))}
          </div>
        )}

        {nothingConfigured && !isAdmin && (
          <div className="flex gap-2.5 items-start text-sm px-4 py-3 rounded-2xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-card)_70%,transparent)] text-[var(--text-sub)]">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent-text)]" />
            <span>Hệ thống chưa mở tính năng đăng tự động. Trong lúc chờ, bạn tải video về rồi đăng tay nhé.</span>
          </div>
        )}

        {status && (
          <div className="grid lg:grid-cols-2 gap-5">
          {PLATFORMS.map((p, i) => {
            const accounts = status.accounts.filter((a) => a.platform === p.id)
            const configured = status.platforms[p.id]
            return (
              <section key={p.id} className="card p-5 sm:p-6 space-y-4 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-12 h-12 shrink-0 rounded-2xl ${p.badge} flex items-center justify-center`}>{p.logo}</div>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-lg">{p.name}</h2>
                      <p className="text-sm text-[var(--text-muted)]">{p.note}</p>
                    </div>
                  </div>
                  {configured && (
                    <button onClick={() => connect(p.id)} disabled={busy === p.id} className="btn btn-primary">
                      {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                      {accounts.length ? 'Kết nối thêm' : 'Kết nối'}
                    </button>
                  )}
                </div>

                {!configured && (
                  <p className="text-sm text-[var(--text-muted)]">
                    {isAdmin
                      ? `Chưa cấu hình ứng dụng ${p.name}: nhập key ở Quản trị hệ thống → Cài đặt API (hoặc ${p.env} trong backend/.env).`
                      : 'Sắp ra mắt trên hệ thống này.'}
                  </p>
                )}

                {accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 text-sm px-4 py-3 rounded-2xl bg-[var(--bg-surface)] flex-wrap"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-[var(--ok-text)] shrink-0" />
                      <span className="font-medium truncate">{a.display_name}</span>
                      <span className="text-[var(--text-muted)]">· Đã kết nối</span>
                    </span>
                    {confirmId === a.id ? (
                      <span className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)]">Ngắt kết nối?</span>
                        <button onClick={() => disconnect(a)} disabled={busy === a.id} className="btn btn-danger btn-sm">
                          Ngắt
                        </button>
                        <button onClick={() => setConfirmId(null)} className="btn btn-secondary btn-sm">
                          Thôi
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmId(a.id)} className="btn btn-ghost btn-sm">
                        <Unlink className="w-4 h-4" /> Ngắt kết nối
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )
          })}
          </div>
        )}

        {pubs.length > 0 && (
          <section className="card p-5 sm:p-6">
            <h2 className="display text-xl mb-2">Lịch sử đăng video</h2>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {pubs.map((p) => (
                <li key={p.id} className="py-3.5 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 text-sm">
                    <span
                      className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${
                        p.platform === 'tiktok' ? 'bg-[#111111] text-white' : 'bg-[#1877F2] text-white'
                      }`}
                    >
                      {p.platform === 'tiktok' ? <TikTokLogo className="w-4 h-4" /> : <FacebookLogo className="w-4 h-4" />}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.product_title || 'Video'}</div>
                      <div className="text-[var(--text-muted)]">
                        {p.account_name && `${p.account_name} · `}
                        {formatDateTime(p.created_at)}
                      </div>
                      {p.error_message && <div className="text-[var(--danger-text)] mt-0.5">{p.error_message}</div>}
                    </div>
                  </div>
                  <StatusBadge status={p.status} kind="publication" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
