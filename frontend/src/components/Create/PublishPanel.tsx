import React, { useEffect, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import {
  fetchCreatorInfo, fetchPublications, fetchSocialStatus, publishVideo, startSocialConnect,
  type Publication, type SocialStatus, type TikTokCreatorInfo,
} from '../../services/api'
import { FacebookLogo, TikTokLogo } from '../ui/BrandLogos'
import { StatusBadge } from '../ui/StatusBadge'
import { useToast } from '../ui/toastContext'

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Công khai',
  MUTUAL_FOLLOW_FRIENDS: 'Bạn bè',
  FOLLOWER_OF_CREATOR: 'Người theo dõi',
  SELF_ONLY: 'Chỉ mình tôi',
}

export type SocialPlatform = 'tiktok' | 'facebook'

interface PublishPanelProps {
  jobId: string
  defaultCaption: string
  /** Bấm "Đăng TikTok/Facebook" ở trên: cuộn tới đây và chọn sẵn tài khoản của nền tảng đó (n đổi mỗi lần bấm) */
  request?: { platform: SocialPlatform; n: number } | null
}

const PLATFORM_NAME: Record<SocialPlatform, string> = { tiktok: 'TikTok', facebook: 'Facebook' }

export const PublishPanel: React.FC<PublishPanelProps> = ({ jobId, defaultCaption, request }) => {
  const toast = useToast()
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
  const [handled, setHandled] = useState(0)
  const [missing, setMissing] = useState<SocialPlatform | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

  // Chọn sẵn tài khoản của nền tảng vừa bấm (khi đã tải xong danh sách tài khoản)
  if (request && status && request.n !== handled) {
    setHandled(request.n)
    const match = status.accounts.find((a) => a.platform === request.platform)
    setMissing(match ? null : request.platform)
    if (match && match.id !== accountId) {
      setAccountId(match.id)
      setCreator(null)
    }
  }
  useEffect(() => {
    if (request?.n) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [request?.n])

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
      toast('Đã gửi video, đang đăng lên ' + (account.platform === 'tiktok' ? 'TikTok' : 'Facebook'), 'success')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return <div className="text-sm text-[var(--text-muted)]">Đang tải tài khoản mạng xã hội...</div>
  }

  const canPublish = account && caption.trim() && (account.platform !== 'tiktok' || (creator && privacy)) && !busy

  return (
    <section ref={sectionRef} className="card p-5 space-y-4 scroll-mt-6">
      <h3 className="font-semibold">Đăng lên mạng xã hội</h3>

      {missing && status.accounts.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap text-sm px-4 py-3 rounded-2xl bg-[var(--bg-surface)]">
          <span>Bạn chưa kết nối tài khoản {PLATFORM_NAME[missing]}.</span>
          {status.platforms[missing] ? (
            <button onClick={() => startSocialConnect(missing).catch((e) => setError(e.message))} className="btn btn-secondary btn-sm">
              {missing === 'tiktok' ? <TikTokLogo className="w-4 h-4" /> : <FacebookLogo className="w-4 h-4 text-[#1877F2]" />}
              Kết nối {PLATFORM_NAME[missing]}
            </button>
          ) : (
            <span className="text-[var(--text-muted)]">Hệ thống chưa bật đăng {PLATFORM_NAME[missing]}, bạn tải video về để đăng tay.</span>
          )}
        </div>
      )}

      {status.accounts.length === 0 ? (
        <div className="space-y-2">
          {missing && !status.platforms[missing] && (status.platforms.tiktok || status.platforms.facebook) && (
            <p className="text-sm text-[var(--text-muted)]">Hệ thống chưa bật đăng {PLATFORM_NAME[missing]}.</p>
          )}
          <p className="text-sm text-[var(--text-muted)]">Chưa kết nối tài khoản nào.</p>
          <div className="flex gap-2 flex-wrap">
            {(['tiktok', 'facebook'] as const).map((p) =>
              status.platforms[p] ? (
                <button
                  key={p}
                  onClick={() => startSocialConnect(p).catch((e) => setError(e.message))}
                  className="btn btn-secondary btn-sm"
                >
                  {p === 'tiktok' ? <TikTokLogo className="w-4 h-4" /> : <FacebookLogo className="w-4 h-4 text-[#1877F2]" />}
                  Kết nối {p === 'tiktok' ? 'TikTok' : 'Trang Facebook'}
                </button>
              ) : null,
            )}
          </div>
          {!status.platforms.tiktok && !status.platforms.facebook && (
            <p className="text-sm text-[var(--text-muted)]">
              Hệ thống chưa mở tính năng đăng tự động. Bạn tải video về rồi đăng tay nhé.
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
                  setMissing(null)
                }}
                aria-pressed={accountId === a.id}
                className="chip"
              >
                {a.platform === 'tiktok' ? <TikTokLogo className="w-4 h-4" /> : <FacebookLogo className="w-4 h-4" />}
                {a.display_name}
              </button>
            ))}
          </div>

          {account && (
            <>
              <label className="block">
                <span className="field-label">Nội dung bài đăng</span>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={2200}
                  rows={3}
                  className="field resize-y"
                />
              </label>

              {account.platform === 'tiktok' &&
                (creator ? (
                  <div className="space-y-2 text-sm">
                    {creator.creator_nickname && (
                      <div className="text-[var(--text-muted)]">Đăng lên tài khoản: @{creator.creator_nickname}</div>
                    )}
                    <label className="block">
                      <span className="field-label">Ai có thể xem video này *</span>
                      <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} className="field">
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
                    <p className="text-xs text-[var(--text-muted)]">
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
                  <div className="text-sm text-[var(--text-muted)] flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Đang đọc thông tin tài khoản TikTok...
                  </div>
                ))}

              <button onClick={handlePublish} disabled={!canPublish} className="btn btn-primary w-full">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Đăng lên {account.platform === 'tiktok' ? 'TikTok' : 'Facebook Reels'}
              </button>
            </>
          )}
        </>
      )}

      {error && <p className="text-sm text-[var(--danger-text)]">{error}</p>}

      {pubs.length > 0 && (
        <ul className="space-y-2 pt-1">
          {pubs.map((p) => (
            <li key={p.id} className="text-sm flex items-start justify-between gap-2">
              <span className="min-w-0">
                {p.platform === 'tiktok' ? 'TikTok' : 'Facebook'}
                {p.account_name && ` · ${p.account_name}`}
                {p.error_message && <span className="block text-[var(--danger-text)]">{p.error_message}</span>}
              </span>
              <StatusBadge status={p.status} kind="publication" />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
