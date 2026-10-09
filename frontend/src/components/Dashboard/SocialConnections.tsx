import React, { useEffect, useState } from 'react'
import { Link2, Loader2, Trash2 } from 'lucide-react'
import {
  disconnectSocial, fetchPublications, fetchSocialStatus, startSocialConnect,
  type Publication, type SocialStatus,
} from '../../services/api'

const PLATFORMS = [
  {
    id: 'tiktok' as const,
    name: 'TikTok',
    badge: 'TT',
    color: 'bg-black border border-white/20',
    note: 'Đăng video thẳng lên tài khoản TikTok. Ứng dụng chưa được TikTok duyệt chỉ đăng được ở chế độ "Chỉ mình tôi".',
  },
  {
    id: 'facebook' as const,
    name: 'Trang Facebook (Reels)',
    badge: 'f',
    color: 'bg-[#1877F2]',
    note: 'Đăng Reels lên Trang Facebook bạn quản lý. Video dọc 9:16, dài 3 đến 90 giây.',
  },
]

const STATUS: Record<Publication['status'], string> = {
  pending: 'Đang chờ',
  processing: 'Đang đăng',
  published: 'Đã đăng',
  failed: 'Thất bại',
}

export const SocialConnections: React.FC = () => {
  const [status, setStatus] = useState<SocialStatus | null>(null)
  const [pubs, setPubs] = useState<Publication[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    fetchSocialStatus().then(setStatus).catch((e) => setError(e.message))
    fetchPublications().then(setPubs).catch(() => {})
  }
  useEffect(() => {
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [])

  const connect = async (platform: 'tiktok' | 'facebook') => {
    setBusy(platform)
    setError(null)
    try {
      await startSocialConnect(platform)
    } catch (e: any) {
      setError(e.message)
      setBusy(null)
    }
  }

  const disconnect = async (id: string) => {
    if (!window.confirm('Ngắt kết nối tài khoản này?')) return
    await disconnectSocial(id).catch((e) => setError(e.message))
    load()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="p-6 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm space-y-5">
        <div className="border-b border-[var(--border-subtle)] pb-4">
          <h3 className="font-semibold text-base text-[var(--text-main)]">Kết Nối Mạng Xã Hội</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Kết nối một lần, sau đó đăng video ngay từ màn hình Tạo Video.
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {!status && <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />}

        {status &&
          PLATFORMS.map((p) => {
            const accounts = status.accounts.filter((a) => a.platform === p.id)
            const configured = status.platforms[p.id]
            return (
              <div key={p.id} className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3.5">
                    <div className={`w-10 h-10 rounded-xl ${p.color} flex items-center justify-center text-white font-bold text-sm`}>
                      {p.badge}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-[var(--text-main)]">{p.name}</h4>
                      <p className="text-[11px] text-[var(--text-muted)] max-w-md">{p.note}</p>
                    </div>
                  </div>
                  {configured ? (
                    <button
                      onClick={() => connect(p.id)}
                      disabled={busy === p.id}
                      className="px-3 py-2 rounded-lg bg-[var(--accent-color)] text-black text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                      {accounts.length ? 'Kết nối thêm' : 'Kết nối'}
                    </button>
                  ) : (
                    <span className="text-[11px] text-amber-400">Máy chủ chưa cấu hình ứng dụng {p.name}</span>
                  )}
                </div>
                {accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]"
                  >
                    <span>
                      <span className="text-[var(--accent-color)]">●</span> {a.display_name}
                    </span>
                    <button
                      onClick={() => disconnect(a.id)}
                      className="text-[var(--text-muted)] hover:text-red-400 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Ngắt kết nối
                    </button>
                  </div>
                ))}
              </div>
            )
          })}
      </div>

      {pubs.length > 0 && (
        <div className="p-6 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm">
          <h3 className="font-semibold text-sm text-[var(--text-main)] mb-3">Lịch Sử Đăng Video</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[var(--text-muted)] text-left">
                <tr>
                  <th className="py-2 pr-3 font-medium">Thời điểm</th>
                  <th className="py-2 pr-3 font-medium">Kênh</th>
                  <th className="py-2 pr-3 font-medium">Video</th>
                  <th className="py-2 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {pubs.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--border-subtle)]">
                    <td className="py-2 pr-3 font-mono">{p.created_at}</td>
                    <td className="py-2 pr-3">
                      {p.platform === 'tiktok' ? 'TikTok' : 'Facebook'} · {p.account_name}
                    </td>
                    <td className="py-2 pr-3 font-mono">{p.job_id}</td>
                    <td className={`py-2 ${p.status === 'failed' ? 'text-red-400' : ''}`}>
                      {STATUS[p.status]}
                      {p.error_message && ` – ${p.error_message}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
