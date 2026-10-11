import React, { useEffect, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Copy, Film, Loader2, Package, Plus, RefreshCw, RotateCcw, Sparkles, X,
} from 'lucide-react'
import {
  ApiError, fetchAvatars, fetchJobStatus, fetchProfile, fetchStudioOptions, previewScript, triggerPipelineRun,
  type StudioOptions,
} from '../../services/api'
import type { AIJob, BrandAvatar, LibraryProduct, SceneSpec, VideoEffects } from '../../types'
import type { CreateRequest, ProductSeed } from '../../lib/createRequest'
import { formatNumber, formatVnd } from '../../lib/format'
import { sceneBackground, SCENE_LABELS, STYLE_LABELS, TEMPLATE_SHORT_LABELS, TRANSITION_LABELS } from '../../lib/labels'
import { useVoicePreview } from '../../lib/useVoicePreview'
import { CostSummary } from '../Create/CostSummary'
import { JobProgress } from '../Create/JobProgress'
import { ChipGroup, ModelPicker, ScenePicker, TemplatePicker, Toggle, VoicePicker } from '../Create/Pickers'
import { VideoResult } from '../Create/VideoResult'
import { ProductEditor } from '../Products/ProductEditor'
import { useToast } from '../ui/toastContext'
import { ProductPickerModal } from './ProductPickerModal'

type Tab = 'model' | 'scene' | 'motion' | 'voice' | 'effects'
type Phase = 'edit' | 'running' | 'done' | 'failed'
type Scene = SceneSpec & { key: number }

const TABS: { id: Tab; label: string }[] = [
  { id: 'model', label: 'Người mẫu' },
  { id: 'scene', label: 'Bối cảnh' },
  { id: 'motion', label: 'Chuyển động' },
  { id: 'voice', label: 'Giọng đọc' },
  { id: 'effects', label: 'Hiệu ứng' },
]
const SCENE_DURATIONS = [3, 5, 8, 10].map((n) => ({ id: n, label: `${n} giây` }))
const SCRIPT_MAX = 600
const TRANSITION_SEC = 0.5 // khớp backend/ai/render.py
const DEFAULT_EFFECTS: VideoEffects = { transition: 'fade', subtitles: true, title_card: true }
// Gợi ý cho cảnh thêm vào: đổi kiểu chuyển động và bối cảnh để video có nhịp
const TEMPLATE_CYCLE = ['catwalk', 'street', 'spin_360', 'fabric_closeup']
const SCENE_CYCLE = ['studio', 'street', 'cafe', 'beach', 'indoor']

let sceneKey = 0
const makeScene = (spec: Partial<SceneSpec> = {}): Scene => ({
  template: spec.template ?? 'catwalk',
  scene: spec.scene ?? 'studio',
  duration_sec: Math.min(10, Math.max(3, Math.round(spec.duration_sec ?? 5))),
  key: ++sceneKey,
})

const seedOf = (p: LibraryProduct): ProductSeed => ({
  id: p.id, image_url: p.image_url, title: p.title, price: p.price, original_price: p.original_price,
  category: p.category, fabric: p.fabric_type,
})

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

interface ProStudioViewProps {
  credits: number
  onCreditsChange: (credits: number) => void
  onOpenDeposit: () => void
  onOpenVideos: () => void
  /** Mở lại một video nhiều cảnh (Tạo lại ở Video của tôi) */
  request?: CreateRequest | null
}

/** Khung điện thoại xem trước cảnh đang chọn: phông bối cảnh, chuyển động, thẻ tên + giá, phụ đề. */
const ScenePreview: React.FC<{
  product: ProductSeed | null
  scene: Scene
  effects: VideoEffects
  caption: string
  label: string
}> = ({ product, scene, effects, caption, label }) => (
  <figure className="w-44 sm:w-56 lg:w-full lg:max-w-[16rem] mx-auto">
    <div className="phone-frame">
      <div className="relative aspect-[9/16] overflow-hidden" style={{ background: sceneBackground(scene.scene) }}>
        {product?.image_url ? (
          <div key={`${scene.key}-${scene.template}`} className={`absolute inset-0 motion-preview motion-${scene.template} is-playing`}>
            <div className="absolute inset-x-[16%] top-[20%] bottom-[22%] flex items-center justify-center">
              <img src={product.image_url} alt="" className="max-w-full max-h-full rounded-xl object-contain shadow-[0_18px_30px_-12px_rgba(20,16,14,0.45)]" />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-[#1E1916]/70">
            Chọn sản phẩm để xem trước
          </div>
        )}
        {effects.title_card && product && (
          <div className="absolute top-[7%] left-[6%] max-w-[64%] flex flex-col items-start gap-1 animate-fade-in">
            <span className="video-title-tag">{product.title}</span>
            {product.price ? <span className="video-price-tag">{formatVnd(product.price)}</span> : null}
          </div>
        )}
        {effects.subtitles && caption && (
          <div className="absolute inset-x-3 bottom-[20%] flex justify-center">
            <span className="motion-caption">{caption}</span>
          </div>
        )}
      </div>
    </div>
    <figcaption className="text-center text-sm text-[var(--text-muted)] mt-3">{label}</figcaption>
  </figure>
)

export const ProStudioView: React.FC<ProStudioViewProps> = ({ credits, onCreditsChange, onOpenDeposit, onOpenVideos, request }) => {
  const toast = useToast()
  const [options, setOptions] = useState<StudioOptions | null>(null)
  const [avatars, setAvatars] = useState<BrandAvatar[]>([])
  const [product, setProduct] = useState<ProductSeed | null>(null)
  const [picking, setPicking] = useState(false)
  const [adding, setAdding] = useState(false)

  const [tab, setTab] = useState<Tab>('scene')
  const [avatarId, setAvatarId] = useState('')
  const [voice, setVoice] = useState('vi-VN-HoaiMyNeural')
  const [style, setStyle] = useState('genz')
  const [script, setScript] = useState('')
  const [scriptLoading, setScriptLoading] = useState(false)
  const [scriptNote, setScriptNote] = useState<string | null>(null)
  const [scenes, setScenes] = useState<Scene[]>(() => [
    makeScene({ template: 'catwalk', scene: 'studio' }),
    makeScene({ template: 'street', scene: 'street' }),
  ])
  const [active, setActive] = useState(0)
  const [effects, setEffects] = useState<VideoEffects>(DEFAULT_EFFECTS)

  const [phase, setPhase] = useState<Phase>('edit')
  const [job, setJob] = useState<AIJob | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const voicePreview = useVoicePreview((msg) => toast(msg, 'info'))

  // Mở lại video cũ: nạp sản phẩm, các cảnh, hiệu ứng, giọng đọc và lời review
  const [appliedAt, setAppliedAt] = useState<number | null>(null)
  if (request && request.at !== appliedAt) {
    setAppliedAt(request.at)
    const p = request.params ?? {}
    if (request.product?.id) setProduct(request.product)
    if (p.avatar_id || request.avatarId) setAvatarId((p.avatar_id || request.avatarId) as string)
    if (p.voice) setVoice(p.voice)
    if (p.script_style) setStyle(p.script_style)
    setScenes(p.scenes?.length ? p.scenes.map(makeScene) : [makeScene({ template: p.template, scene: p.scene, duration_sec: p.duration_sec })])
    setEffects({ ...DEFAULT_EFFECTS, ...p.effects })
    setScript((request.script || '').slice(0, SCRIPT_MAX))
    setScriptNote(null)
    setActive(0)
    setJob(null)
    setError(null)
    setPhase('edit')
  }

  useEffect(() => {
    let alive = true
    Promise.all([fetchStudioOptions(), fetchAvatars()])
      .then(([opts, list]) => {
        if (!alive) return
        setOptions(opts)
        setAvatars(list)
        const def = list.find((a) => a.is_default) ?? list[0]
        setAvatarId((current) => (current && list.some((a) => a.id === current) ? current : (def?.id ?? '')))
      })
      .catch((e) => toast(errorText(e, 'Không tải được tùy chọn'), 'error'))
    return () => {
      alive = false
    }
  }, [toast])

  // Theo dõi tiến độ job đang chạy
  const jobId = job?.job_id
  const running = phase === 'running'
  useEffect(() => {
    if (!running || !jobId) return
    let alive = true
    const timer = setInterval(async () => {
      try {
        const j = await fetchJobStatus(jobId)
        if (!alive) return
        setJob(j)
        if (['completed', 'failed', 'rejected', 'awaiting_approval'].includes(j.status)) {
          clearInterval(timer)
          setPhase(j.status === 'completed' ? 'done' : 'failed')
          if (j.status === 'failed') {
            fetchProfile()
              .then((p) => onCreditsChange(p.credits))
              .catch(() => {})
          }
        }
      } catch {
        // mạng chập chờn: lần sau hỏi lại
      }
    }, 1500)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [running, jobId, onCreditsChange])

  const current = scenes[Math.min(active, scenes.length - 1)]
  const maxScenes = options?.max_scenes ?? 5
  const extraCost = options?.extra_scene_cost_credits ?? 0
  const cost = (options?.pipeline_cost_credits ?? 0) + Math.max(0, scenes.length - 1) * extraCost
  const missingCredits = Math.max(0, cost - credits)
  const overlap = effects.transition === 'cut' ? 0 : TRANSITION_SEC
  const totalSec = scenes.reduce((sum, s) => sum + s.duration_sec, 0) - overlap * (scenes.length - 1)
  const captionLines = script.split('\n').map((l) => l.trim()).filter(Boolean)
  const caption = captionLines[Math.min(active, captionLines.length - 1)] ?? 'Phụ đề lời review hiện ở đây'

  const updateScene = (patch: Partial<SceneSpec>) =>
    setScenes((list) => list.map((s, i) => (i === Math.min(active, list.length - 1) ? { ...s, ...patch } : s)))

  const addScene = () => {
    if (scenes.length >= maxScenes) return
    const usedScenes = new Set(scenes.map((s) => s.scene))
    const nextScene = SCENE_CYCLE.find((id) => !usedScenes.has(id)) ?? SCENE_CYCLE[scenes.length % SCENE_CYCLE.length]
    const last = scenes[scenes.length - 1]
    const nextTemplate = TEMPLATE_CYCLE[(TEMPLATE_CYCLE.indexOf(last.template) + 1) % TEMPLATE_CYCLE.length]
    setScenes([...scenes, makeScene({ template: nextTemplate, scene: nextScene, duration_sec: last.duration_sec })])
    setActive(scenes.length)
  }

  const duplicateScene = (index: number) => {
    if (scenes.length >= maxScenes) return
    const copy = makeScene(scenes[index])
    setScenes([...scenes.slice(0, index + 1), copy, ...scenes.slice(index + 1)])
    setActive(index + 1)
  }

  const removeScene = (index: number) => {
    if (scenes.length <= 1) return
    setScenes(scenes.filter((_, i) => i !== index))
    setActive((a) => Math.max(0, a > index ? a - 1 : Math.min(a, scenes.length - 2)))
  }

  const moveScene = (index: number, dir: -1 | 1) => {
    const to = index + dir
    if (to < 0 || to >= scenes.length) return
    const list = [...scenes]
    ;[list[index], list[to]] = [list[to], list[index]]
    setScenes(list)
    setActive(to)
  }

  const writeScript = async () => {
    if (!product?.price) return setScriptNote('Chọn sản phẩm trước để AI viết lời review')
    setScriptLoading(true)
    setScriptNote(null)
    try {
      const res = await previewScript({
        title: product.title,
        price: product.price,
        fabric: product.fabric || undefined,
        category: product.category || undefined,
        style,
      })
      setScript([res.hook_3s, res.body_text, res.cta_text].filter(Boolean).join('\n').slice(0, SCRIPT_MAX))
      setScriptNote(res.warning)
    } catch (e) {
      setScriptNote(errorText(e, 'Không viết được lời review'))
    } finally {
      setScriptLoading(false)
    }
  }

  const exportVideo = async () => {
    setError(null)
    if (!product?.id) return setError('Chọn sản phẩm cho video trước')
    if (missingCredits > 0) return setError(`Bạn cần thêm ${formatNumber(missingCredits)} credit để xuất video này.`)
    setSubmitting(true)
    try {
      const run = await triggerPipelineRun({
        product_id: product.id,
        avatar_id: avatarId || undefined,
        voice,
        script_style: style,
        custom_script: script.trim() || undefined,
        scenes: scenes.map(({ template, scene, duration_sec }) => ({ template, scene, duration_sec })),
        effects,
        require_approval: false,
      })
      onCreditsChange(run.remaining_credits)
      setJob({ job_id: run.job_id, status: 'queued', progress: 0, current_step: 'Đang chờ xử lý' })
      setPhase('running')
    } catch (e) {
      const message = errorText(e, 'Không xuất được video')
      setError(e instanceof ApiError && e.status === 402 ? `${message}. Hãy nạp thêm credit.` : message)
    } finally {
      setSubmitting(false)
    }
  }

  const backToEdit = () => {
    setJob(null)
    setPhase('edit')
  }

  const pickProduct = (p: LibraryProduct) => {
    setProduct(seedOf(p))
    setPicking(false)
    setAdding(false)
  }

  return (
    <div className="flex-1 h-full overflow-y-auto text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6">
        <div>
          <h1 className="display text-3xl sm:text-4xl">Pro Studio</h1>
          <p className="text-[var(--text-muted)] mt-2 max-w-2xl">
            Dựng video nhiều cảnh: mỗi cảnh một bối cảnh, kiểu chuyển động và thời lượng riêng, nối bằng hiệu ứng chuyển cảnh.
          </p>
        </div>

        {phase === 'running' && job && <JobProgress job={job} fallbackImage={product?.image_url ?? null} onOpenVideos={onOpenVideos} />}

        {phase === 'done' && job && (
          <div className="space-y-5 animate-fade-up">
            <h2 className="display text-2xl sm:text-3xl">Video của bạn đã sẵn sàng</h2>
            <VideoResult
              job={job}
              productTitle={product?.title}
              price={product?.price}
              originalPrice={product?.original_price}
              onRemake={backToEdit}
              actions={
                <button onClick={onOpenVideos} className="btn btn-ghost btn-lg">
                  <Film className="w-4 h-4" /> Video của tôi
                </button>
              }
            />
          </div>
        )}

        {phase === 'failed' && job && (
          <div className="card max-w-xl mx-auto text-center space-y-4 p-8 sm:p-10 animate-fade-up">
            <span className="w-14 h-14 rounded-full bg-[var(--danger-bg)] text-[var(--danger-text)] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </span>
            <h2 className="display text-2xl">Chưa xuất được video</h2>
            <p className="text-sm text-[var(--text-muted)]">{job.error_message}</p>
            {job.refunded && <p className="text-sm font-medium text-[var(--ok-text)]">Credit đã được hoàn lại vào ví.</p>}
            <button onClick={backToEdit} className="btn btn-primary">
              <RotateCcw className="w-4 h-4" /> Quay lại chỉnh sửa
            </button>
          </div>
        )}

        {phase === 'edit' && (
          <>
            {/* Sản phẩm của video */}
            <div className="card p-3 flex items-center gap-3.5 animate-fade-up">
              {product ? (
                <>
                  <img src={product.image_url ?? ''} alt="" className="w-14 h-16 rounded-xl object-cover bg-[var(--bg-surface)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{product.title}</p>
                    <p className="text-sm flex items-baseline gap-2">
                      {product.price ? <span className="text-[var(--accent-text)] font-semibold">{formatVnd(product.price)}</span> : null}
                      {product.original_price && product.price && product.original_price > product.price ? (
                        <span className="line-through text-[var(--text-muted)]">{formatVnd(product.original_price)}</span>
                      ) : null}
                      {product.category && <span className="text-[var(--text-muted)] truncate">· {product.category}</span>}
                    </p>
                  </div>
                  <button onClick={() => setPicking(true)} className="btn btn-secondary btn-sm shrink-0">
                    <RefreshCw className="w-3.5 h-3.5" /> Đổi
                  </button>
                </>
              ) : (
                <>
                  <span className="w-14 h-16 rounded-xl bg-[var(--bg-surface)] text-[var(--text-muted)] flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Chưa chọn sản phẩm</p>
                    <p className="text-sm text-[var(--text-muted)]">Chọn từ Sản phẩm của tôi hoặc thêm sản phẩm mới.</p>
                  </div>
                  <button onClick={() => setPicking(true)} className="btn btn-primary btn-sm shrink-0">
                    Chọn sản phẩm
                  </button>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] gap-5 lg:gap-6 items-start">
              {/* Xem trước: trên cùng ở điện thoại, cột phải ở máy tính */}
              <div className="lg:order-2 lg:sticky lg:top-0">
                <ScenePreview
                  product={product}
                  scene={current}
                  effects={effects}
                  caption={caption}
                  label={`Cảnh ${Math.min(active, scenes.length - 1) + 1}/${scenes.length} · ${SCENE_LABELS[current.scene] ?? current.scene} · ${current.duration_sec} giây`}
                />
              </div>

              <section className="card lg:order-1 min-w-0">
                <div role="tablist" aria-label="Chỉnh sửa" className="flex gap-1 overflow-x-auto no-scrollbar border-b border-[var(--border-subtle)] px-3 sm:px-4">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      role="tab"
                      id={`studio-tab-${t.id}`}
                      aria-selected={tab === t.id}
                      aria-controls="studio-panel"
                      onClick={() => setTab(t.id)}
                      className={`shrink-0 px-3 sm:px-4 py-3.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                        tab === t.id
                          ? 'border-[var(--accent-color)] text-[var(--text-main)]'
                          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div id="studio-panel" role="tabpanel" aria-labelledby={`studio-tab-${tab}`} className="p-5 sm:p-6">
                  {(tab === 'scene' || tab === 'motion') && (
                    <p className="text-sm text-[var(--text-muted)] mb-4">
                      Đang chỉnh <strong className="text-[var(--text-main)]">Cảnh {Math.min(active, scenes.length - 1) + 1}</strong>. Chọn cảnh khác ở danh sách bên dưới.
                    </p>
                  )}

                  {tab === 'model' && <ModelPicker avatars={avatars} value={avatarId} onChange={setAvatarId} />}

                  {tab === 'scene' && (
                    <>
                      <ScenePicker scenes={options?.scenes ?? []} value={current.scene} onChange={(id) => updateScene({ scene: id })} />
                      {scenes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setScenes((list) => list.map((s) => ({ ...s, scene: current.scene })))}
                          className="btn btn-ghost btn-sm mt-4"
                        >
                          <Copy className="w-3.5 h-3.5" /> Dùng bối cảnh này cho mọi cảnh
                        </button>
                      )}
                    </>
                  )}

                  {tab === 'motion' && (
                    <>
                      <TemplatePicker
                        templates={options?.templates ?? []}
                        value={current.template}
                        onChange={(id) => updateScene({ template: id })}
                        image={product?.image_url}
                      />
                      <span className="field-label mt-5">Thời lượng cảnh</span>
                      <ChipGroup
                        label="Thời lượng cảnh"
                        options={SCENE_DURATIONS}
                        value={current.duration_sec}
                        onChange={(n: number) => updateScene({ duration_sec: n })}
                      />
                    </>
                  )}

                  {tab === 'voice' && (
                    <div className="space-y-5">
                      <VoicePicker
                        voices={options?.voices ?? []}
                        value={voice}
                        onChange={setVoice}
                        playing={voicePreview.playing}
                        onPreview={voicePreview.toggle}
                      />
                      <div>
                        <span className="field-label">Phong cách lời review</span>
                        <ChipGroup
                          label="Phong cách lời review"
                          options={(options?.script_styles ?? []).map((s) => ({ id: s, label: STYLE_LABELS[s] ?? s }))}
                          value={style}
                          onChange={setStyle}
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <span className="field-label mb-0">Lời review</span>
                          <button type="button" onClick={writeScript} disabled={scriptLoading} className="btn btn-ghost btn-sm">
                            {scriptLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            AI viết
                          </button>
                        </div>
                        <textarea
                          rows={5}
                          maxLength={SCRIPT_MAX}
                          aria-label="Lời review"
                          value={script}
                          onChange={(e) => setScript(e.target.value)}
                          placeholder="Để trống thì AI tự viết lời review theo sản phẩm khi xuất video. Mỗi dòng là một câu."
                          className={`field resize-y leading-relaxed ${scriptLoading ? 'opacity-60' : ''}`}
                        />
                        <div className="flex items-center justify-between gap-3 mt-1.5 text-xs text-[var(--text-muted)]">
                          <span>{scriptNote ?? 'AI đọc đúng nguyên văn lời bạn viết.'}</span>
                          <span className="tabular-nums shrink-0">
                            {script.length}/{SCRIPT_MAX}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {tab === 'effects' && (
                    <div className="space-y-5">
                      <div>
                        <span className="field-label">Chuyển cảnh</span>
                        <ChipGroup
                          label="Chuyển cảnh"
                          options={(options?.transitions ?? ['fade', 'slide', 'zoom', 'cut']).map((t) => ({ id: t, label: TRANSITION_LABELS[t] ?? t }))}
                          value={effects.transition}
                          onChange={(t: VideoEffects['transition']) => setEffects((e) => ({ ...e, transition: t }))}
                        />
                      </div>
                      <div className="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                        <div className="py-4">
                          <Toggle
                            checked={effects.subtitles}
                            onChange={(v) => setEffects((e) => ({ ...e, subtitles: v }))}
                            label="Phụ đề lời review"
                            description="Chữ chạy theo giọng đọc, nằm trên vùng nút bấm của TikTok."
                          />
                        </div>
                        <div className="py-4">
                          <Toggle
                            checked={effects.title_card}
                            onChange={(v) => setEffects((e) => ({ ...e, title_card: v }))}
                            label="Thẻ tên và giá sản phẩm"
                            description="Hiện ở góc trên trong 4 giây đầu video."
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Danh sách cảnh */}
            <section className="card p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
                <h2 className="title text-lg">Các cảnh</h2>
                <span className="text-sm text-[var(--text-muted)]">
                  {scenes.length} cảnh · khoảng {Math.round(totalSec)} giây
                  {extraCost > 0 && <span className="hidden sm:inline"> · mỗi cảnh thêm {formatNumber(extraCost)} credit</span>}
                </span>
              </div>
              <ol className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {scenes.map((s, i) => {
                  const selected = i === Math.min(active, scenes.length - 1)
                  return (
                    <li key={s.key} className="shrink-0 w-36 sm:w-40">
                      <div
                        className={`rounded-2xl border p-2 transition-colors ${
                          selected ? 'border-[var(--ink)] bg-[var(--accent-soft)]' : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <button type="button" onClick={() => setActive(i)} aria-pressed={selected} className="w-full text-left">
                          <span className="relative block aspect-[4/3] rounded-xl overflow-hidden mb-2" style={{ background: sceneBackground(s.scene) }}>
                            {product?.image_url && (
                              <img src={product.image_url} alt="" className="absolute inset-0 m-auto h-[78%] w-auto max-w-[70%] object-contain rounded-md" />
                            )}
                          </span>
                          <span className="block text-sm font-semibold">
                            Cảnh {i + 1} · {s.duration_sec} giây
                          </span>
                          <span className="block text-xs text-[var(--text-muted)] truncate">
                            {TEMPLATE_SHORT_LABELS[s.template] ?? s.template}, {SCENE_LABELS[s.scene] ?? s.scene}
                          </span>
                        </button>
                        <div className="flex items-center justify-between mt-1.5 -mx-1">
                          <div className="flex">
                            <button type="button" onClick={() => moveScene(i, -1)} disabled={i === 0} className="icon-btn w-7 h-7" aria-label={`Đưa cảnh ${i + 1} lên trước`}>
                              <ArrowLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveScene(i, 1)}
                              disabled={i === scenes.length - 1}
                              className="icon-btn w-7 h-7"
                              aria-label={`Đưa cảnh ${i + 1} ra sau`}
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="flex">
                            <button
                              type="button"
                              onClick={() => duplicateScene(i)}
                              disabled={scenes.length >= maxScenes}
                              className="icon-btn w-7 h-7"
                              aria-label={`Nhân đôi cảnh ${i + 1}`}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeScene(i)}
                              disabled={scenes.length <= 1}
                              className="icon-btn w-7 h-7"
                              aria-label={`Xóa cảnh ${i + 1}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
                {scenes.length < maxScenes && (
                  <li className="shrink-0 w-36 sm:w-40">
                    <button
                      type="button"
                      onClick={addScene}
                      className="w-full h-full min-h-[11rem] rounded-2xl border-2 border-dashed border-[var(--border-strong)] text-[var(--text-sub)] hover:border-[var(--accent-color)] hover:text-[var(--text-main)] transition-colors flex flex-col items-center justify-center gap-1 text-sm font-semibold"
                    >
                      <Plus className="w-5 h-5" /> Thêm cảnh
                      {extraCost > 0 && <span className="text-xs font-normal text-[var(--text-muted)]">+{formatNumber(extraCost)} credit</span>}
                    </button>
                  </li>
                )}
              </ol>
            </section>

            {/* Chi phí và nút xuất: luôn nằm ở đáy màn hình */}
            <div className="sticky bottom-3 sm:bottom-5 z-10">
              <div className="card shadow-[var(--shadow-pop)] p-3 sm:p-4 space-y-3">
                {error && (
                  <div className="flex gap-2 items-start text-sm p-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)] animate-fade-up">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="flex-1">{error}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <CostSummary cost={cost} credits={credits} ready={!!options} />
                  {missingCredits > 0 ? (
                    <button onClick={onOpenDeposit} className="btn btn-accent btn-lg">
                      <Plus className="w-4 h-4" /> Nạp<span className="hidden sm:inline"> thêm</span> {formatNumber(missingCredits)}
                    </button>
                  ) : (
                    <button onClick={exportVideo} disabled={submitting || !options || !product} className="btn btn-primary btn-lg">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                      Xuất video<span className="hidden sm:inline"> · {formatNumber(cost)} credit</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <ProductPickerModal
        open={picking}
        onClose={() => setPicking(false)}
        onPick={pickProduct}
        onAdd={() => {
          setPicking(false)
          setAdding(true)
        }}
      />
      <ProductEditor open={adding} product={null} onClose={() => setAdding(false)} onSaved={(p) => pickProduct(p)} />
    </div>
  )
}
