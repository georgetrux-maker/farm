import React, { useEffect, useRef, useState } from 'react'
import { Check, Clapperboard, Footprints, MapPin, Play, RotateCw, Square, Volume2, ZoomIn } from 'lucide-react'
import type { BrandAvatar } from '../../types'
import { AvatarImage } from '../ui/AvatarImage'


const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  catwalk: Footprints,
  spin_360: RotateCw,
  street: MapPin,
  fabric_closeup: ZoomIn,
}

/** Chọn người mẫu: thẻ ảnh chân dung, viền đậm + dấu tích khi được chọn */
export const ModelPicker: React.FC<{ avatars: BrandAvatar[]; value: string; onChange: (id: string) => void }> = ({
  avatars,
  value,
  onChange,
}) => {
  if (avatars.length === 0) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton rounded-2xl aspect-[3/4]" />
        ))}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {avatars.map((a) => {
        const selected = value === a.id
        return (
          <button key={a.id} onClick={() => onChange(a.id)} aria-pressed={selected} className="group text-left">
            <div
              className={`relative overflow-hidden rounded-2xl ring-2 ring-offset-2 ring-offset-[var(--bg-card)] transition ${
                selected ? 'ring-[var(--ink)]' : 'ring-transparent group-hover:ring-[var(--border-strong)]'
              }`}
            >
              <AvatarImage
                src={a.avatar_url}
                name={a.name}
                className="w-full aspect-[3/4] transition-transform duration-500 group-hover:scale-[1.04]"
              />
              {selected && (
                <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[var(--ink)] text-[var(--on-ink)] flex items-center justify-center animate-scale-in">
                  <Check className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
            <div className="mt-2 text-sm font-semibold truncate">{a.name}</div>
            <div className="text-xs text-[var(--text-muted)] truncate">{[a.height, a.style].filter(Boolean).join(' · ')}</div>
          </button>
        )
      })}
    </div>
  )
}

/** Chọn kiểu chuyển động video: thẻ có biểu tượng và mô tả ngắn */
export const TemplatePicker: React.FC<{
  templates: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}> = ({ templates, value, onChange }) => (
  <div className="grid grid-cols-2 gap-3">
    {templates.map((t) => {
      const [title, rawDesc] = t.label.split(':').map((s) => s.trim())
      const desc = rawDesc && rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1)
      const Icon = TEMPLATE_ICONS[t.id] ?? Clapperboard
      const selected = value === t.id
      return (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          aria-pressed={selected}
          className={`text-left p-3.5 sm:p-4 rounded-2xl border transition-colors ${
            selected
              ? 'border-[var(--ink)] bg-[var(--accent-soft)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]'
          }`}
        >
          <span
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              selected ? 'bg-[var(--ink)] text-[var(--on-ink)]' : 'bg-[var(--bg-surface)] text-[var(--text-sub)]'
            }`}
          >
            <Icon className="w-4 h-4" />
          </span>
          <div className="font-semibold mt-3 text-sm sm:text-base">{title}</div>
          {desc && <div className="text-sm text-[var(--text-muted)] mt-0.5 leading-snug">{desc}</div>}
        </button>
      )
    })}
  </div>
)

/** Nhóm lựa chọn dạng viên (chỉ chọn một) */
export const ChipGroup: React.FC<{
  options: { id: string | number; label: string }[]
  value: string | number
  onChange: (id: any) => void
  label: string
}> = ({ options, value, onChange, label }) => (
  <div role="group" aria-label={label} className="flex flex-wrap gap-2">
    {options.map((o) => (
      <button key={o.id} onClick={() => onChange(o.id)} aria-pressed={value === o.id} className="chip">
        {value === o.id && <Check className="w-3.5 h-3.5" />}
        {o.label}
      </button>
    ))}
  </div>
)

/** Công tắc bật/tắt kèm nhãn và mô tả */
export const Toggle: React.FC<{
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: React.ReactNode
}> = ({ checked, onChange, label, description }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="w-full flex items-start justify-between gap-4 text-left"
  >
    <span>
      <span className="block text-sm font-medium text-[var(--text-main)]">{label}</span>
      {description && <span className="block text-sm text-[var(--text-muted)] mt-0.5">{description}</span>}
    </span>
    <span
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
        checked ? 'bg-[var(--accent-color)]' : 'bg-[var(--border-strong)]'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </span>
  </button>
)

/** Bộ chọn giọng đọc tiếng Việt kèm nút nghe thử 3s */
export const VoicePicker: React.FC<{
  voices: Array<{ id: string; label: string; desc?: string; preview_url?: string }>
  value: string
  onChange: (id: string) => void
}> = ({ voices, value, onChange }) => {
  const [playingVoice, setPlayingVoice] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const handlePlayPreview = (e: React.MouseEvent, voiceId: string, previewUrl?: string) => {
    e.stopPropagation()
    const url = previewUrl || (voiceId.toLowerCase().includes('namminh') ? '/samples/preview_namminh.mp3' : '/samples/preview_hoaimy.mp3')

    if (playingVoice === voiceId) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayingVoice(null)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
    }

    try {
      const audio = new Audio(url)
      audioRef.current = audio
      setPlayingVoice(voiceId)
      audio.play().catch(() => setPlayingVoice(null))
      audio.onended = () => {
        setPlayingVoice(null)
        audioRef.current = null
      }
    } catch {
      setPlayingVoice(null)
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {voices.map((v) => {
        const isSelected = value === v.id
        const isPlaying = playingVoice === v.id
        return (
          <div
            key={v.id}
            onClick={() => onChange(v.id)}
            className={`group relative p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
              isSelected
                ? 'border-[var(--ink)] bg-[var(--bg-card)] shadow-sm ring-1 ring-[var(--ink)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? 'bg-[var(--ink)] text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                }`}
              >
                {isSelected ? <Check className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-main)] truncate">{v.label}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {v.desc || (v.id.includes('HoaiMy') ? 'Nữ miền Bắc truyền cảm' : 'Nam miền Bắc ấm áp')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => handlePlayPreview(e, v.id, v.preview_url)}
              title={isPlaying ? 'Dừng nghe thử' : 'Nghe thử giọng đọc'}
              className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                isPlaying
                  ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse'
                  : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover,rgba(0,0,0,0.05))]'
              }`}
            >
              {isPlaying ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  <span>Dừng</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>Nghe thử</span>
                </>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}

