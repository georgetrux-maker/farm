import React, { useState } from 'react'
import { AlertTriangle, ImagePlus, Layers, Loader2, Maximize2, Sun } from 'lucide-react'

const TIPS = [
  { icon: Sun, title: 'Đủ sáng', text: 'Ánh sáng tự nhiên, không bóng gắt' },
  { icon: Maximize2, title: 'Thấy trọn sản phẩm', text: 'Trải phẳng hoặc mặc trên ma-nơ-canh' },
  { icon: Layers, title: 'Nền đơn giản', text: 'Nền trơn giúp AI tách đồ chính xác' },
]

interface UploadHeroProps {
  onPick: () => void
  onFile: (file: File) => void
  uploading: boolean
  error: string | null
}

/** Bước đầu: vùng kéo thả ảnh lớn kèm mẹo chụp ảnh. */
export const UploadHero: React.FC<UploadHeroProps> = ({ onPick, onFile, uploading, error }) => {
  const [dragging, setDragging] = useState(false)
  return (
    <div className="space-y-4 animate-fade-up">
      <button
        onClick={onPick}
        disabled={uploading}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) onFile(f)
        }}
        className={`w-full min-h-[320px] sm:min-h-[380px] rounded-[28px] border-2 border-dashed flex flex-col items-center justify-center gap-4 px-6 py-10 text-center transition-all duration-300 ${
          dragging
            ? 'border-[var(--accent-color)] bg-[var(--accent-soft)] scale-[1.01]'
            : 'border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--bg-card)_70%,transparent)] hover:border-[var(--accent-color)] hover:bg-[var(--bg-card)]'
        }`}
      >
        <span className="w-16 h-16 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center">
          {uploading ? <Loader2 className="w-7 h-7 animate-spin" /> : <ImagePlus className="w-7 h-7" />}
        </span>
        <span className="display text-2xl sm:text-3xl">
          {uploading ? 'Đang tải ảnh lên...' : dragging ? 'Thả ảnh vào đây' : 'Kéo thả ảnh sản phẩm vào đây'}
        </span>
        <span className="text-[var(--text-muted)]">
          hoặc <span className="font-semibold text-[var(--text-main)] underline underline-offset-4">chọn ảnh từ máy</span>
          <span className="block sm:inline text-sm mt-1 sm:mt-0"> · JPG, PNG, WEBP tối đa 10MB</span>
        </span>
      </button>

      {error && (
        <div className="flex gap-2 items-start text-sm p-3 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        {TIPS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-3 p-4 rounded-2xl bg-[color-mix(in_srgb,var(--bg-card)_60%,transparent)]">
            <Icon className="w-5 h-5 text-[var(--accent-text)] shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold">{title}</div>
              <div className="text-sm text-[var(--text-muted)]">{text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
