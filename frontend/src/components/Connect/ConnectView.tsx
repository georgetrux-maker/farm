import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Info, Link2, Loader2, Unlink } from 'lucide-react'
import {
  disconnectSocial, fetchPublications, fetchSocialStatus, startSocialConnect,
  type Publication, type SocialAccount, type SocialStatus,
} from '../../services/api'
import { formatDateTime } from '../../lib/format'
import { StatusBadge } from '../ui/StatusBadge'
import { useToast } from '../ui/toastContext'

const PLATFORMS = [
  {
    id: 'tiktok' as const,
    name: 'TikTok',
    badge: 'TT',
    color: 'bg-black border border-white/20',
    note: 'Đăng video thẳng lên tài khoản TikTok của bạn.',
    env: 'TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET',
  },
  {
    id: 'facebook' as const,
    name: 'Trang Facebook (Reels)',
    badge: 'f',
    color: 'bg-[#1877F2]',
    note: 'Đăng Reels lên Trang Facebook bạn quản lý. Video dọc 9:16, dài 3 đến 90 giây.',
    env: 'FACEBOOK_APP_ID, FACEBOOK_APP_SECRET',
  },
]

const card = 'rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 sm:p-5'

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
    <div className="flex-1 h-full overflow-y-auto bg-[var(--bg-app)] text-[var(--text-main)]">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-5 sm:py-6 space-y-5">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold">Kết nối mạng xã hội</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Kết nối một lần, sau đó bấm "Đăng" ngay dưới mỗi video để đưa lên TikTok hoặc Facebook.
          </p>
        </div>

        {loadError && (
          <div className="flex gap-2 items-center text-sm p-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{loadError}</span>
            <button onClick={load} className="font-semibold underline">
              Thử lại
            </button>
          </div>
        )}
        {!status && !loadError && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
          </div>
        )}

        {nothingConfigured && !isAdmin && (
          <div className="flex gap-2 items-start text-sm p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)]">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Hệ thống chưa mở tính năng đăng tự động. Trong lúc chờ, bạn tải video về rồi đăng tay nhé.</span>
          </div>
        )}

        {status &&
          PLATFORMS.map((p) => {
            const accounts = status.accounts.filter((a) => a.platform === p.id)
            const configured = status.platforms[p.id]
            return (
              <section key={p.id} className={`${card} space-y-3`}>
                <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 shrink-0 rounded-xl ${p.color} flex items-center justify-center text-white font-bold`}
                    >
                      {p.badge}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-semibold">{p.name}</h2>
                      <p className="text-sm text-[var(--text-muted)]">{p.note}</p>
                    </div>
                  </div>
                  {configured && (
                    <button
                      onClick={() => connect(p.id)}
                      disabled={busy === p.id}
                      className="px-4 py-2.5 rounded-xl bg-[var(--accent-color)] text-black text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                    >
                      {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                      {accounts.length ? 'Kết nối thêm' : 'Kết nối'}
                    </button>
                  )}
                </div>

                {!configured && (
                  <p className="text-sm text-[var(--warn-text)]">
                    {isAdmin
                      ? `Máy chủ chưa cấu hình ứng dụng ${p.name}: đặt ${p.env} trong backend/.env.`
                      : 'Chưa mở trên hệ thống này.'}
                  </p>
                )}

                {accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 text-sm px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] flex-wrap"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-[var(--accent-color)] shrink-0" />
                      <span className="truncate">{a.display_name}</span>
                    </span>
                    {confirmId === a.id ? (
                      <span className="flex items-center gap-2">
                        <span className="text-[var(--text-muted)]">Ngắt kết nối?</span>
                        <button
                          onClick={() => disconnect(a)}
                          disabled={busy === a.id}
                          className="px-3 py-1.5 rounded-lg bg-[var(--danger-solid)] text-white font-semibold disabled:opacity-60"
                        >
                          Ngắt
                        </button>
                        <button onClick={() => setConfirmId(null)} className="px-3 py-1.5 rounded-lg border border-[var(--border-strong)]">
                          Thôi
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmId(a.id)}
                        className="text-[var(--text-muted)] hover:text-[var(--danger-text)] flex items-center gap-1.5"
                      >
                        <Unlink className="w-4 h-4" /> Ngắt kết nối
                      </button>
                    )}
                  </div>
                ))}
              </section>
            )
          })}

        {pubs.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold mb-3">Lịch sử đăng video</h2>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {pubs.map((p) => (
                <li key={p.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    <div className="font-medium truncate">{p.product_title || 'Video'}</div>
                    <div className="text-[var(--text-muted)]">
                      {p.platform === 'tiktok' ? 'TikTok' : 'Facebook'}
                      {p.account_name && ` · ${p.account_name}`} · {formatDateTime(p.created_at)}
                    </div>
                    {p.error_message && <div className="text-[var(--danger-text)] mt-0.5">{p.error_message}</div>}
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
