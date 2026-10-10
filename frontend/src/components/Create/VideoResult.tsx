import React, { useRef, useState } from 'react'
import { Check, Copy, Download, Info, RotateCcw } from 'lucide-react'
import type { AIJob } from '../../types'
import { formatDateTime, formatVnd, videoFileName } from '../../lib/format'
import { useStudioLabels } from '../../lib/useStudioLabels'
import { FacebookLogo, TikTokLogo } from '../ui/BrandLogos'
import { StatusBadge } from '../ui/StatusBadge'
import { useToast } from '../ui/toastContext'
import { PublishPanel, type SocialPlatform } from './PublishPanel'

function CopyButton({ text, label }: { text: string; label: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true)
            toast(`Đã sao chép ${label}`, 'success')
            setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => toast('Trình duyệt không cho sao chép, hãy bôi đen để chép tay', 'error'))
      }}
      className="btn btn-ghost btn-sm -mr-2"
      aria-label={`Sao chép ${label}`}
    >
      {copied ? <Check className="w-4 h-4 text-[var(--ok-text)]" /> : <Copy className="w-4 h-4" />}
      {copied ? 'Đã chép' : 'Sao chép'}
    </button>
  )
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

interface VideoResultProps {
  job: AIJob
  productTitle?: string | null
  price?: number | null
  originalPrice?: number | null
  /** Tạo video mới với đúng sản phẩm và cài đặt của video này (được sửa trước khi tạo) */
  onRemake?: () => void
  /** Nút thêm sau các nút chính (vd "Tạo video mới") */
  actions?: React.ReactNode
}

/** Kết quả: video trong khung điện thoại, thông tin video, tải về, đăng mạng xã hội, các cảnh trong video. */
export const VideoResult: React.FC<VideoResultProps> = ({ job, productTitle, price, originalPrice, onRemake, actions }) => {
  const labels = useStudioLabels()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [publishRequest, setPublishRequest] = useState<{ platform: SocialPlatform; n: number } | null>(null)
  const script = job.script
  const caption = `${script?.post_caption ?? ''}\n${(script?.hashtags ?? []).join(' ')}`.trim()
  if (!job.output_video_url) return null

  const params = job.params ?? {}
  const details = [
    ['Người mẫu', labels.model(params.avatar_id)],
    ['Kiểu video', labels.template(params.template)],
    ['Giọng đọc', labels.voice(params.voice)],
    ['Lời review', labels.style(params.script_style)],
    ['Khung hình', script?.video_resolution ? `${script.video_resolution} (9:16)` : '9:16 dọc'],
    ['Tạo lúc', formatDateTime(job.completed_at || job.created_at)],
  ].filter(([, v]) => v) as [string, string][]
  const scenes = script?.scenes ?? []
  const publish = (platform: SocialPlatform) => setPublishRequest((r) => ({ platform, n: (r?.n ?? 0) + 1 }))

  const seek = (time: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = time
    v.play().catch(() => {})
  }

  return (
    <div className="grid md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 md:gap-10 items-start">
      <div className="w-full max-w-[290px] md:max-w-none mx-auto md:sticky md:top-6">
        <div className="phone-frame">
          <video
            ref={videoRef}
            src={job.output_video_url}
            controls
            playsInline
            preload="metadata"
            poster={job.output_image_url ?? undefined}
            className="w-full aspect-[9/16] bg-black object-cover"
          />
        </div>
      </div>

      <div className="space-y-5 min-w-0">
        <section className="card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="display text-xl sm:text-2xl leading-snug">{productTitle || 'Video review'}</h3>
              {price ? (
                <p className="mt-1 flex items-baseline gap-2 flex-wrap">
                  <span className="text-lg font-semibold text-[var(--accent-text)]">{formatVnd(price)}</span>
                  {originalPrice && originalPrice > price && (
                    <span className="text-sm text-[var(--text-muted)] line-through">{formatVnd(originalPrice)}</span>
                  )}
                </p>
              ) : null}
            </div>
            <StatusBadge status={job.status} />
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 mt-4 pt-4 border-t border-[var(--border-subtle)]">
            {details.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-[var(--text-muted)]">{k}</dt>
                <dd className="text-sm font-medium truncate">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="flex gap-2.5 flex-wrap">
          <a href={job.output_video_url} download={videoFileName(productTitle)} className="btn btn-primary btn-lg">
            <Download className="w-4 h-4" /> Tải về
          </a>
          <button onClick={() => publish('tiktok')} className="btn btn-secondary btn-lg">
            <TikTokLogo className="w-4 h-4" /> Đăng TikTok
          </button>
          <button onClick={() => publish('facebook')} className="btn btn-secondary btn-lg">
            <FacebookLogo className="w-4 h-4 text-[#1877F2]" /> Đăng Facebook
          </button>
          {onRemake && (
            <button onClick={onRemake} className="btn btn-ghost btn-lg">
              <RotateCcw className="w-4 h-4" /> Tạo lại với cài đặt này
            </button>
          )}
          {actions}
        </div>

        {(script?.warning || script?.tts_warning) && (
          <div className="text-sm px-4 py-3 rounded-2xl border border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn-text)] space-y-1">
            {script?.warning && <p>{script.warning}</p>}
            {script?.tts_warning && <p>{script.tts_warning}</p>}
          </div>
        )}

        {scenes.length > 0 && (
          <section className="card p-5">
            <h3 className="font-semibold mb-3">Các cảnh trong video</h3>
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
              {scenes.map((s) => (
                <button
                  key={s.time}
                  onClick={() => seek(s.time)}
                  className="group shrink-0 w-28 text-left"
                  aria-label={`Xem cảnh lúc ${clock(s.time)}${s.caption ? `: ${s.caption}` : ''}`}
                >
                  <div className="relative rounded-xl overflow-hidden ring-1 ring-[var(--border-subtle)] group-hover:ring-[var(--accent-color)] transition">
                    <img src={s.image_url} alt="" loading="lazy" className="w-full aspect-[9/16] object-cover bg-black" />
                    <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[11px] font-semibold tabular-nums">
                      {clock(s.time)}
                    </span>
                  </div>
                  {s.caption && <p className="text-xs text-[var(--text-sub)] mt-1.5 line-clamp-2 leading-snug">{s.caption}</p>}
                </button>
              ))}
            </div>
          </section>
        )}

        {script && (
          <>
            <section className="card p-5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="font-semibold">Caption đăng kèm</h3>
                <CopyButton text={caption} label="caption" />
              </div>
              <p className="whitespace-pre-line text-[var(--text-sub)] leading-relaxed">{caption}</p>
            </section>
            <section className="card p-5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="font-semibold">Lời review trong video</h3>
                <CopyButton text={script.full_script} label="lời review" />
              </div>
              <p className="whitespace-pre-line text-[var(--text-sub)] leading-relaxed">{script.full_script}</p>
            </section>
          </>
        )}

        <PublishPanel jobId={job.job_id} defaultCaption={caption} request={publishRequest} />

        <p className="text-sm text-[var(--text-muted)] flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          Video có hình ảnh do AI tạo. Khi đăng TikTok/Facebook, hãy bật nhãn "Nội dung do AI tạo" theo quy định của nền tảng.
        </p>
      </div>
    </div>
  )
}
