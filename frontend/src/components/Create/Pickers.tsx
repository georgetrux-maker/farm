import React from 'react'
import { Check, Clapperboard, Footprints, MapPin, Play, RotateCw, Square, ZoomIn } from 'lucide-react'
import type { BrandAvatar } from '../../types'
import { MotionPreview } from '../ui/MotionPreview'
import { AvatarImage } from '../ui/AvatarImage'

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  catwalk: Footprints,
  spin_360: RotateCw,
  street: MapPin,
  fabric_closeup: ZoomIn,
}

const GENDERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'female', label: 'Nữ' },
  { id: 'male', label: 'Nam' },
] as const

/** Chọn người mẫu: lọc Nữ/Nam, thẻ ảnh chân dung, viền đậm + dấu tích khi được chọn */
export const ModelPicker: React.FC<{ avatars: BrandAvatar[]; value: string; onChange: (id: string) => void }> = ({
  avatars,
  value,
  onChange,
}) => {
  const [gender, setGender] = React.useState<(typeof GENDERS)[number]['id']>('all')
  if (avatars.length === 0) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton rounded-2xl aspect-[3/4]" />
        ))}
      </div>
    )
  }
  const hasBoth = avatars.some((a) => a.gender === 'male') && avatars.some((a) => (a.gender ?? 'female') === 'female')
  const shown = gender === 'all' ? avatars : avatars.filter((a) => (a.gender ?? 'female') === gender)
  return (
    <div>
      {hasBoth && (
        <div role="tablist" aria-label="Lọc người mẫu" className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)] w-fit mb-4">
          {GENDERS.map((g) => (
            <button
              key={g.id}
              role="tab"
              aria-selected={gender === g.id}
              onClick={() => setGender(g.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                gender === g.id ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {shown.map((a) => {
          const selected = value === a.id
          return (
            <button key={a.id} onClick={() => onChange(a.id)} aria-pressed={selected} className="group text-left">
              <div
                className={`relative overflow-hidden rounded-2xl ring-2 ring-offset-2 ring-offset-[var(--bg-card)] transition ${
                  selected ? 'ring-[var(--accent-color)]' : 'ring-transparent group-hover:ring-[var(--border-strong)]'
                }`}
              >
                <AvatarImage
                  src={a.avatar_url}
                  name={a.name}
                  className="w-full aspect-[3/4] transition-transform duration-500 group-hover:scale-[1.04]"
                />
                {selected && (
                  <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[var(--accent-color)] text-[var(--on-accent)] flex items-center justify-center animate-scale-in">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
                {a.badge && (
                  <span className="absolute bottom-2 left-2 glass rounded-full px-2 py-0.5 text-[10px] font-semibold">{a.badge}</span>
                )}
              </div>
              <div className="mt-2 text-sm font-semibold truncate">{a.name}</div>
              <div className="text-xs text-[var(--text-muted)] truncate">{[a.height, a.style].filter(Boolean).join(' · ')}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Chọn kiểu chuyển động video: thẻ có biểu tượng và mô tả ngắn */
export const TemplatePicker: React.FC<{
  templates: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
  /** Ảnh sản phẩm: có thì mỗi ô mô phỏng góc quay ngay trên ảnh này */
  image?: string | null
}> = ({ templates, value, onChange, image }) => (
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
          className={`group text-left p-3 sm:p-3.5 rounded-2xl border transition-colors flex gap-3 ${
            selected
              ? 'border-[var(--ink)] bg-[var(--accent-soft)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-strong)]'
          }`}
        >
          {image ? (
            <MotionPreview image={image} template={t.id} playing={selected} className="w-12 sm:w-14 shrink-0 rounded-xl" />
          ) : (
            <span
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                selected ? 'bg-[var(--ink)] text-[var(--on-ink)]' : 'bg-[var(--bg-surface)] text-[var(--text-sub)]'
              }`}
            >
              <Icon className="w-4 h-4" />
            </span>
          )}
          <span className="min-w-0">
            <span className="font-semibold text-sm sm:text-base flex items-center gap-1.5">
              {image && <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />}
              {title}
            </span>
            {desc && <span className="block text-sm text-[var(--text-muted)] mt-0.5 leading-snug">{desc}</span>}
          </span>
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

/** Chọn giọng đọc, mỗi giọng có nút nghe thử đúng giọng đó (file do máy chủ tạo) */
export const VoicePicker: React.FC<{
  voices: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
  playing: string | null
  onPreview: (id: string) => void
}> = ({ voices, value, onChange, playing, onPreview }) => (
  <div role="radiogroup" aria-label="Giọng đọc" className="grid grid-cols-1 gap-2.5">
    {voices.map((v) => {
      const selected = value === v.id
      const isPlaying = playing === v.id
      return (
        <div
          key={v.id}
          className={`flex items-center gap-2 p-1.5 pl-2 rounded-2xl border transition-colors ${
            selected ? 'border-[var(--ink)] bg-[var(--accent-soft)]' : 'border-[var(--border-subtle)] bg-[var(--bg-card)]'
          }`}
        >
          <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(v.id)}
            className="flex-1 min-w-0 flex items-center gap-2.5 py-1.5 text-left"
          >
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
                selected ? 'bg-[var(--ink)] text-[var(--on-ink)] border-[var(--ink)]' : 'border-[var(--border-strong)]'
              }`}
            >
              {selected && <Check className="w-3.5 h-3.5" />}
            </span>
            <span className="font-semibold text-sm truncate">{v.label}</span>
          </button>
          <button
            type="button"
            onClick={() => onPreview(v.id)}
            aria-label={isPlaying ? `Dừng nghe ${v.label}` : `Nghe thử ${v.label}`}
            className={`shrink-0 h-9 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isPlaying ? 'bg-[var(--ink)] text-[var(--on-ink)]' : 'bg-[var(--bg-surface)] text-[var(--text-sub)] hover:text-[var(--text-main)]'
            }`}
          >
            {isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
            {isPlaying ? 'Dừng' : 'Nghe thử'}
          </button>
        </div>
      )
    })}
  </div>
)
