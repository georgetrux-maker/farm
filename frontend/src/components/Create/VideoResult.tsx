import React, { useState } from 'react'
import { Check, Copy, Download, Info } from 'lucide-react'
import type { AIJob } from '../../types'
import { videoFileName } from '../../lib/format'
import { useToast } from '../ui/toastContext'
import { PublishPanel } from './PublishPanel'

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

interface VideoResultProps {
  job: AIJob
  productTitle?: string | null
  /** Nút thêm cạnh nút tải (vd "Tạo video mới") */
  actions?: React.ReactNode
}

/** Video đã tạo trong khung điện thoại: tải về (tên file theo sản phẩm), sao chép caption, đăng mạng xã hội. */
export const VideoResult: React.FC<VideoResultProps> = ({ job, productTitle, actions }) => {
  const script = job.script
  const caption = `${script?.post_caption ?? ''}\n${(script?.hashtags ?? []).join(' ')}`.trim()
  if (!job.output_video_url) return null

  return (
    <div className="grid md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-6 md:gap-10 items-start">
      <div className="w-full max-w-[300px] md:max-w-none mx-auto md:sticky md:top-6">
        <div className="phone-frame">
          <video
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
        {(script?.warning || script?.tts_warning) && (
          <div className="text-sm px-4 py-3 rounded-2xl border border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn-text)] space-y-1">
            {script?.warning && <p>{script.warning}</p>}
            {script?.tts_warning && <p>{script.tts_warning}</p>}
          </div>
        )}

        <div className="flex gap-2.5 flex-wrap">
          <a href={job.output_video_url} download={videoFileName(productTitle)} className="btn btn-primary btn-lg">
            <Download className="w-4 h-4" /> Tải video
          </a>
          {actions}
        </div>

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
              <p className="text-[var(--text-sub)] leading-relaxed">{script.full_script}</p>
            </section>
          </>
        )}

        <PublishPanel jobId={job.job_id} defaultCaption={caption} />

        <p className="text-sm text-[var(--text-muted)] flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          Video có hình ảnh do AI tạo. Khi đăng TikTok/Facebook, hãy bật nhãn "Nội dung do AI tạo" theo quy định của nền tảng.
        </p>
      </div>
    </div>
  )
}
