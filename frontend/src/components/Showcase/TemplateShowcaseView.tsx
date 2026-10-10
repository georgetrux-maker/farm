import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Pause, Play, Search, Square, Volume2, X } from 'lucide-react'
import { fetchTemplateShowcase, type ShowcaseTemplate } from '../../services/api'
import { STYLE_LABELS, TEMPLATE_SHORT_LABELS } from '../../lib/labels'
import { stripVietnamese } from '../../lib/format'
import { useVoicePreview } from '../../lib/useVoicePreview'
import { MotionPreview } from '../ui/MotionPreview'
import { useToast } from '../ui/toastContext'

interface TemplateShowcaseViewProps {
  onUseTemplate: (template: ShowcaseTemplate) => void
}

/** Thư viện mẫu video: xem trước góc quay + giọng đọc + phụ đề, bấm "Dùng mẫu này" để tạo với sản phẩm của mình. */
export const TemplateShowcaseView: React.FC<TemplateShowcaseViewProps> = ({ onUseTemplate }) => {
  const toast = useToast()
  const [templates, setTemplates] = useState<ShowcaseTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const voice = useVoicePreview((msg) => toast(msg, 'info'))
  const [tag, setTag] = useState('all')
  const [motion, setMotion] = useState('all')
  const [search, setSearch] = useState('')

  const tags = useMemo(() => [...new Set((templates ?? []).flatMap((t) => t.tags))], [templates])
  const motions = useMemo(() => [...new Set((templates ?? []).map((t) => t.motion_template))], [templates])
  const norm = (text: string) => stripVietnamese(text).toLowerCase()
  const shown = (templates ?? []).filter(
    (t) =>
      (tag === 'all' || t.tags.includes(tag)) &&
      (motion === 'all' || t.motion_template === motion) &&
      (!search.trim() || norm([t.title, t.category, t.description, ...t.tags].join(' ')).includes(norm(search.trim()))),
  )
  const filtering = tag !== 'all' || motion !== 'all' || search.trim() !== ''
  const clearFilters = () => {
    setTag('all')
    setMotion('all')
    setSearch('')
  }

  const load = useCallback(() => {
    setError(null)
    fetchTemplateShowcase()
      .then((res) => {
        setTemplates(res.templates)
        setPlayingId((id) => id ?? res.templates[0]?.id ?? null)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [load])

  return (
    <div className="flex-1 h-full overflow-y-auto text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6">
        <div>
          <p className="eyebrow">Thư viện mẫu</p>
          <h1 className="display text-3xl sm:text-4xl mt-1.5">Chọn phong cách, tạo trong một chạm</h1>
          <p className="text-[var(--text-muted)] mt-2 max-w-2xl">
            Mỗi mẫu đã chọn sẵn góc quay, người mẫu, giọng đọc và lời văn. Bạn chỉ cần tải ảnh sản phẩm của mình.
          </p>
        </div>

        {templates && templates.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm mẫu: công sở, dự tiệc..."
                  aria-label="Tìm mẫu video"
                  className="field rounded-full pl-11"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--text-muted)] sm:ml-auto">
                Góc quay
                <select value={motion} onChange={(e) => setMotion(e.target.value)} className="field rounded-full w-auto py-2.5">
                  <option value="all">Tất cả</option>
                  {motions.map((m) => (
                    <option key={m} value={m}>
                      {TEMPLATE_SHORT_LABELS[m] ?? m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0" role="group" aria-label="Lọc theo phong cách">
              {['all', ...tags].map((t) => (
                <button key={t} onClick={() => setTag(t)} aria-pressed={tag === t} className="chip shrink-0">
                  {t === 'all' ? 'Tất cả' : t}
                </button>
              ))}
            </div>
          </div>
        )}

        {error ? (
          <p className="text-sm text-[var(--danger-text)]">
            {error}{' '}
            <button onClick={load} className="underline font-semibold">
              Thử lại
            </button>
          </p>
        ) : !templates ? (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton rounded-3xl aspect-[9/16]" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="card text-center py-12 px-6">
            <Search className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
            <p className="font-semibold mt-3">Không có mẫu phù hợp</p>
            {filtering && (
              <button onClick={clearFilters} className="btn btn-secondary mt-4">
                <X className="w-4 h-4" /> Xóa bộ lọc
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-8">
            {shown.map((t) => {
              const isPlaying = playingId === t.id
              const voicePlaying = voice.playing === t.voice_id
              return (
                <article key={t.id} className="flex flex-col">
                  <div className="relative rounded-3xl overflow-hidden shadow-[var(--shadow-card)]">
                    {t.video_url && isPlaying ? (
                      <video src={t.video_url} autoPlay loop playsInline muted className="w-full aspect-[9/16] object-cover" />
                    ) : (
                      <MotionPreview
                        image={t.image_url}
                        template={t.motion_template}
                        playing={isPlaying}
                        captions={t.caption_lines}
                        alt={t.title}
                      />
                    )}
                    <span className="absolute top-3 left-3 glass rounded-full px-2.5 py-1 text-xs font-semibold">{t.badge}</span>
                    <button
                      onClick={() => setPlayingId(isPlaying ? null : t.id)}
                      aria-label={isPlaying ? `Dừng xem trước ${t.title}` : `Xem trước ${t.title}`}
                      className="absolute top-3 right-3 w-10 h-10 rounded-full glass flex items-center justify-center"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                    </button>
                  </div>

                  <div className="pt-4 flex-1 flex flex-col">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{t.category}</p>
                    <h2 className="display text-xl mt-1">{t.title}</h2>
                    <p className="text-sm text-[var(--text-muted)] mt-1.5 leading-relaxed">{t.description}</p>
                    <dl className="text-sm mt-3 space-y-1">
                      <div className="flex gap-2">
                        <dt className="text-[var(--text-muted)] w-20 shrink-0">Góc quay</dt>
                        <dd>{TEMPLATE_SHORT_LABELS[t.motion_template] ?? t.template_label}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-[var(--text-muted)] w-20 shrink-0">Lời văn</dt>
                        <dd>{STYLE_LABELS[t.script_style] ?? t.script_style}</dd>
                      </div>
                    </dl>
                    <button
                      onClick={() => voice.toggle(t.voice_id)}
                      className="mt-3 self-start inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-text)]"
                    >
                      {voicePlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Volume2 className="w-4 h-4" />}
                      {voicePlaying ? 'Dừng' : `Nghe giọng ${t.voice_label}`}
                    </button>
                    <button onClick={() => onUseTemplate(t)} className="btn btn-primary w-full mt-4">
                      Dùng mẫu này <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
        <p className="text-xs text-[var(--text-muted)]">
          Hình xem trước mô phỏng chuyển động máy quay trên ảnh mẫu; video thật do AI tạo từ ảnh sản phẩm và người mẫu của bạn.
        </p>
      </div>
    </div>
  )
}
