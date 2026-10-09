import React, { useEffect, useState } from 'react'
import { Loader2, Send, CheckCircle2, AlertTriangle, Link2 } from 'lucide-react'
import {
  fetchCreatorInfo, fetchPublications, fetchSocialStatus, publishVideo, startSocialConnect,
  type Publication, type SocialStatus, type TikTokCreatorInfo,
} from '../../services/api'

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Công khai',
  MUTUAL_FOLLOW_FRIENDS: 'Bạn bè',
  FOLLOWER_OF_CREATOR: 'Người theo dõi',
  SELF_ONLY: 'Chỉ mình tôi',
}

const STATUS_LABELS: Record<Publication['status'], string> = {
  pending: 'Đang chờ',
  processing: 'Đang đăng...',
  published: 'Đã đăng',
  failed: 'Thất bại',
}

interface PublishPanelProps {
  jobId: string
  defaultCaption: string
}

export const PublishPanel: React.FC<PublishPanelProps> = ({ jobId, defaultCaption }) => {
  const [status, setStatus] = useState<SocialStatus | null>(null)
  const [accountId, setAccountId] = useState('')
  const [caption, setCaption] = useState(defaultCaption)
  const [creator, setCreator] = useState<TikTokCreatorInfo | null>(null)
  const [privacy, setPrivacy] = useState('')
  const [allowComment, setAllowComment] = useState(true)
  const [allowDuet, setAllowDuet] = useState(true)
  const [allowStitch, setAllowStitch] = useState(true)
  const [pubs, setPubs] = useState<Publication[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSocialStatus().then(setStatus).catch((e) => setError(e.message))
    fetchPublications(jobId).then(setPubs).catch(() => {})
  }, [jobId])

  const account = status?.accounts.find((a) => a.id === accountId)

  // TikTok: đọc lựa chọn quyền riêng tư của tài khoản mỗi khi chọn tài khoản
  useEffect(() => {
    if (account?.platform !== 'tiktok') return
    let cancelled = false
    fetchCreatorInfo(account.id)
      .then((info) => {
        if (cancelled) return
        setCreator(info)
        setPrivacy('')
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [account?.id, account?.platform])

  // Theo dõi trạng thái đăng
  const pending = pubs.some((p) => p.status === 'pending' || p.status === 'processing')
  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => fetchPublications(jobId).then(setPubs).catch(() => {}), 3000)
    return () => clearInterval(t)
  }, [pending, jobId])

  const handlePublish = async () => {
    if (!account) return
    setError(null)
    setBusy(true)
    try {
      await publishVideo({
        job_id: jobId,
        account_id: account.id,
        caption,
        ...(account.platform === 'tiktok'
          ? { privacy_level: privacy, allow_comment: allowComment, allow_duet: allowDuet, allow_stitch: allowStitch }
          : {}),
      })
      setPubs(await fetchPublications(jobId))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return <div className="text-xs text-[var(--text-muted)]">Đang tải tài khoản mạng xã hội...</div>
  }

  const canPublish = account && caption.trim() && (account.platform !== 'tiktok' || (creator && privacy)) && !busy

  return (
    <div className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="font-semibold text-sm">Đăng lên mạng xã hội</div>

      {status.accounts.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-muted)]">Chưa kết nối tài khoản nào.</p>
          <div className="flex gap-2 flex-wrap">
            {(['tiktok', 'facebook'] as const).map((p) =>
              status.platforms[p] ? (
                <button
                  key={p}
                  onClick={() => startSocialConnect(p).catch((e) => setError(e.message))}
                  className="px-3 py-2 rounded-lg border border-[var(--border-strong)] text-xs flex items-center gap-1.5"
                >
                  <Link2 className="w-3.5 h-3.5" /> Kết nối {p === 'tiktok' ? 'TikTok' : 'Trang Facebook'}
                </button>
              ) : null,
            )}
          </div>
          {!status.platforms.tiktok && !status.platforms.facebook && (
            <p className="text-[11px] text-amber-300">
              Máy chủ chưa cấu hình ứng dụng TikTok/Facebook. Trong lúc chờ, bạn có thể tải video và đăng tay.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {status.accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setAccountId(a.id)
                  setCreator(null)
                }}
                className={`px-3 py-2 rounded-lg border text-xs ${
                  accountId === a.id
                    ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-card)]'
                }`}
              >
                {a.platform === 'tiktok' ? 'TikTok' : 'Facebook'}: {a.display_name}
              </button>
            ))}
          </div>

          {account && (
            <>
              <label className="block">
                <span className="text-xs text-[var(--text-muted)] block mb-1">Nội dung bài đăng</span>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={2200}
                  rows={3}
                  className="w-full bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm outline-none"
                />
              </label>

              {account.platform === 'tiktok' &&
                (creator ? (
                  <div className="space-y-2 text-xs">
                    {creator.creator_nickname && (
                      <div className="text-[var(--text-muted)]">Đăng lên tài khoản: @{creator.creator_nickname}</div>
                    )}
                    <label className="block">
                      <span className="text-[var(--text-muted)] block mb-1">Ai có thể xem video này *</span>
                      <select
                        value={privacy}
                        onChange={(e) => setPrivacy(e.target.value)}
                        className="w-full bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 outline-none"
                      >
                        <option value="" disabled>
                          Chọn chế độ hiển thị
                        </option>
                        {(creator.privacy_level_options ?? []).map((o) => (
                          <option key={o} value={o}>
                            {PRIVACY_LABELS[o] ?? o}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-4">
                      {[
                        ['Cho phép bình luận', allowComment, setAllowComment, creator.comment_disabled],
                        ['Cho phép Duet', allowDuet, setAllowDuet, creator.duet_disabled],
                        ['Cho phép Stitch', allowStitch, setAllowStitch, creator.stitch_disabled],
                      ].map(([label, value, setter, disabled]) => (
                        <label key={label as string} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={!disabled && (value as boolean)}
                            disabled={disabled as boolean}
                            onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
                            className="accent-[var(--accent-color)]"
                          />
                          {label as string}
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Video sẽ được gắn nhãn "Nội dung do AI tạo". Khi đăng, bạn đồng ý với{' '}
                      <a
                        href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Chính sách sử dụng âm nhạc của TikTok
                      </a>
                      . Sau khi đăng, TikTok có thể mất vài phút để xử lý video.
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang đọc thông tin tài khoản TikTok...
                  </div>
                ))}

              <button
                onClick={handlePublish}
                disabled={!canPublish}
                className="w-full py-2.5 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Đăng lên {account.platform === 'tiktok' ? 'TikTok' : 'Facebook Reels'}
              </button>
            </>
          )}
        </>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {pubs.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {pubs.map((p) => (
            <li key={p.id} className="text-xs flex items-start gap-2">
              {p.status === 'published' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-color)] shrink-0 mt-0.5" />
              ) : p.status === 'failed' ? (
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 mt-0.5" />
              )}
              <span>
                {p.platform === 'tiktok' ? 'TikTok' : 'Facebook'} ({p.account_name}): {STATUS_LABELS[p.status]}
                {p.error_message && <span className="text-red-400"> – {p.error_message}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
