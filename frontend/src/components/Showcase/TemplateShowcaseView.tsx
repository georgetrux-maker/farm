import React, { useEffect, useState } from 'react'
import { ArrowRight, Loader2, Music, Play, Sparkles, Volume2, Wand2 } from 'lucide-react'
import { fetchTemplateShowcase, type ShowcaseTemplate } from '../../services/api'

interface TemplateShowcaseViewProps {
  onUseTemplate: (template: ShowcaseTemplate) => void
}

export const TemplateShowcaseView: React.FC<TemplateShowcaseViewProps> = ({ onUseTemplate }) => {
  const [templates, setTemplates] = useState<ShowcaseTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [playingId, setPlayingId] = useState<string | null>(null)

  useEffect(() => {
    fetchTemplateShowcase()
      .then((res) => {
        setTemplates(res.templates)
        if (res.templates.length > 0) {
          setPlayingId(res.templates[0].id)
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[360px]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
      </div>
    )
  }

  return (
    <div className="flex-1 h-full overflow-y-auto text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8 animate-fade-in">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--gold-soft)] text-[var(--gold)] text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" /> Thư viện cảm hứng
            </div>
            <h1 className="display text-3xl sm:text-4xl">Mẫu video xu hướng</h1>
            <p className="text-[var(--text-muted)] mt-2 max-w-2xl">
              Chọn mẫu bạn ưng ý nhất, bấm <strong>Dùng mẫu này</strong> và thả ảnh sản phẩm của shop vào. AI sẽ tự động tạo video với góc quay, giọng đọc và phong cách kịch bản y hệt!
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {templates.map((tpl) => {
            const isPlaying = playingId === tpl.id
            return (
              <div
                key={tpl.id}
                className="card flex flex-col overflow-hidden group hover:border-[var(--accent-color)] transition-all duration-300"
              >
                {/* Khung video dọc 9:16 */}
                <div className="relative aspect-[9/16] bg-[var(--ink)] overflow-hidden">
                  {isPlaying ? (
                    <video
                      src={tpl.video_url}
                      autoPlay
                      loop
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={tpl.thumbnail_url}
                      alt={tpl.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  )}

                  {/* Badge */}
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold bg-black/60 backdrop-blur-md text-white">
                    {tpl.badge}
                  </span>

                  {/* Nút Play/Pause preview */}
                  <button
                    onClick={() => setPlayingId(isPlaying ? null : tpl.id)}
                    aria-label={isPlaying ? 'Dừng xem trước' : 'Xem trước video'}
                    className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-white/80 hover:bg-white text-[var(--ink)] flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                  >
                    {isPlaying ? (
                      <span className="w-3.5 h-3.5 bg-[var(--ink)] rounded-sm" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5 fill-current" />
                    )}
                  </button>

                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-white/90 drop-shadow">
                    <span className="flex items-center gap-1 font-medium truncate">
                      <Music className="w-3.5 h-3.5 shrink-0" /> {tpl.music_name}
                    </span>
                    <span className="flex items-center gap-1 shrink-0 font-medium">
                      <Volume2 className="w-3.5 h-3.5" /> {tpl.voice_name.split(' ')[0]}
                    </span>
                  </div>
                </div>

                {/* Nội dung mô tả & nút chọn */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-[var(--accent-text)] uppercase tracking-wider">
                      {tpl.category}
                    </div>
                    <h2 className="display text-lg font-bold mt-1 text-[var(--text-main)]">{tpl.title}</h2>
                    <p className="text-xs text-[var(--text-muted)] mt-1.5 line-clamp-2 leading-relaxed">
                      {tpl.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {tpl.tags.map((t) => (
                        <span key={t} className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--bg-surface)] text-[var(--text-sub)]">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => onUseTemplate(tpl)}
                    className="btn btn-primary w-full text-xs sm:text-sm py-2.5 flex items-center justify-center gap-2 font-semibold shadow-sm"
                  >
                    <Wand2 className="w-4 h-4" /> Dùng mẫu này <ArrowRight className="w-4 h-4 ml-auto" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
