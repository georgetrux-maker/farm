import React, { useState } from 'react'
import { Check, Copy, Download, Info } from 'lucide-react'
import type { AIJob } from '../../types'
import { videoFileName } from '../../lib/format'
import { useToast } from '../ui/toastContext'
import { PublishPanel } from './PublishPanel'

const label = 'text-xs font-medium text-[var(--text-muted)] block mb-1.5'

function CopyButton({ text }: { text: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true)
            toast('Đã sao chép', 'success')
            setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => toast('Trình duyệt không cho sao chép, hãy bôi đen để chép tay', 'error'))
      }}
      className="p-2 rounded-lg hover:bg-[var(--bg-card)] text-[var(--text-muted)] shrink-0"
      title="Sao chép"
      aria-label="Sao chép"
    >
      {copied ? <Check className="w-4 h-4 text-[var(--accent-text)]" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}

interface VideoResultProps {
  job: AIJob
  productTitle?: string | null
  /** Nút thêm ở cuối (vd "Tạo video mới") */
  actions?: React.ReactNode
}

/** Video đã tạo: xem, tải về (tên file theo sản phẩm), copy caption/hashtag, đăng mạng xã hội. */
export const VideoResult: React.FC<VideoResultProps> = ({ job, productTitle, actions }) => {
  const script = job.script
  const caption = `${script?.post_caption ?? ''}\n${(script?.hashtags ?? []).join(' ')}`.trim()
  if (!job.output_video_url) return null

  return (
    <div className="grid md:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] gap-5">
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-3 sm:p-4">
        <video
          src={job.output_video_url}
          controls
          playsInline
          preload="metadata"
          poster={job.output_image_url ?? undefined}
          className="w-full aspect-[9/16] max-h-[70dvh] rounded-xl bg-black object-contain"
        />
      </div>
      <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 sm:p-5 space-y-4">
        {script?.warning && <p className="text-sm text-[var(--warn-text)]">{script.warning}</p>}
        {script?.tts_warning && <p className="text-sm text-[var(--warn-text)]">{script.tts_warning}</p>}

        <div className="flex gap-2 flex-wrap">
          <a
            href={job.output_video_url}
            download={videoFileName(productTitle)}
            className="px-4 py-2.5 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-sm flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Tải video
          </a>
          {actions}
        </div>

        {script && (
          <>
            <div>
              <span className={label}>Caption đăng kèm (đã gồm hashtag)</span>
              <div className="flex gap-2 items-start p-3 rounded-lg bg-[var(--bg-surface)] text-sm">
                <p className="flex-1 whitespace-pre-line">{caption}</p>
                <CopyButton text={caption} />
              </div>
            </div>
            <div>
              <span className={label}>Lời thoại trong video</span>
              <div className="flex gap-2 items-start p-3 rounded-lg bg-[var(--bg-surface)] text-sm text-[var(--text-sub)]">
                <p className="flex-1">{script.full_script}</p>
                <CopyButton text={script.full_script} />
              </div>
            </div>
          </>
        )}

        <PublishPanel jobId={job.job_id} defaultCaption={caption} />

        <p className="text-xs text-[var(--text-muted)] flex gap-1.5">
          <Info className="w-4 h-4 shrink-0" />
          Video có hình ảnh do AI tạo. Khi đăng TikTok/Facebook, hãy bật nhãn "Nội dung do AI tạo" theo quy định của nền
          tảng.
        </p>
      </div>
    </div>
  )
}
