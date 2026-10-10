import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Film, Info, Loader2, Plus, RefreshCw, RotateCcw, Sparkles } from 'lucide-react'
import {
  ApiError, analyzeProduct, createAnalyzedProduct, fetchAvatars, fetchJobStatus, fetchProfile, fetchStudioOptions,
  previewScript, triggerPipelineRun, uploadImage, type ProductAnalysis, type ProductPrefill, type ShowcaseTemplate,
  type StudioOptions,
} from '../../services/api'
import type { AIJob, BrandAvatar } from '../../types'
import { formatNumber, formatVnd, suggestTitleFromFileName } from '../../lib/format'
import { STYLE_LABELS } from '../../lib/labels'
import { useVoicePreview } from '../../lib/useVoicePreview'
import { useToast } from '../ui/toastContext'
import { ChipGroup, ModelPicker, TemplatePicker, Toggle, VoicePicker } from './Pickers'
import { JobProgress } from './JobProgress'
import { Stepper } from './Stepper'
import { TryOnReview } from './TryOnReview'
import { UploadHero } from './UploadHero'
import { VideoResult } from './VideoResult'

interface CreateVideoViewProps {
  credits: number
  isAdmin: boolean
  onCreditsChange: (credits: number) => void
  onOpenDeposit: () => void
  onOpenVideos: () => void
  initialTemplate?: ShowcaseTemplate | null
  onClearInitialTemplate?: () => void
}

type Phase = 'upload' | 'configure' | 'running' | 'review' | 'done' | 'failed'

const DURATIONS = [
  { id: 5, label: '5 giây' },
  { id: 10, label: '10 giây' },
]

/** Một khối lựa chọn có số thứ tự kiểu tạp chí */
const Section: React.FC<{ n: string; title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({
  n,
  title,
  aside,
  children,
}) => (
  <section className="card p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
      <h2 className="flex items-baseline gap-3">
        <span className="font-display italic text-lg text-[var(--accent-text)]">{n}</span>
        <span className="display text-xl">{title}</span>
      </h2>
      {aside}
    </div>
    {children}
  </section>
)

/** Điểm chất lượng ảnh dạng vòng tròn */
const QualityNote: React.FC<{ quality: ProductAnalysis['quality']; warning: string | null }> = ({ quality, warning }) => {
  const tone =
    quality.score >= 75
      ? { label: 'Ảnh đẹp', color: 'var(--ok-text)' }
      : quality.score >= 50
        ? { label: 'Tạm được', color: 'var(--warn-text)' }
        : { label: 'Nên chụp lại', color: 'var(--danger-text)' }
  return (
    <div className="mt-4 flex items-start gap-3.5 animate-fade-up">
      <div
        className="w-14 h-14 shrink-0 rounded-full p-[3px]"
        style={{ background: `conic-gradient(${tone.color} ${quality.score * 3.6}deg, var(--bg-surface) 0)` }}
        aria-hidden="true"
      >
        <div className="w-full h-full rounded-full bg-[var(--bg-card)] flex items-center justify-center font-display text-lg font-semibold">
          {quality.score}
        </div>
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="text-sm">
          <span className="font-semibold" style={{ color: tone.color }}>
            {tone.label}
          </span>
          <span className="text-[var(--text-muted)]"> · chất lượng ảnh {quality.score}/100</span>
        </div>
        {quality.issues.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-sm text-[var(--text-sub)]">
            {quality.issues.map((i) => (
              <li key={i}>• {i}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Đủ nét và đủ sáng để làm video.</p>
        )}
        {warning && <p className="text-xs text-[var(--text-muted)] mt-1">{warning}</p>}
      </div>
    </div>
  )
}

export const CreateVideoView: React.FC<CreateVideoViewProps> = ({
  credits,
  isAdmin,
  onCreditsChange,
  onOpenDeposit,
  onOpenVideos,
  initialTemplate,
  onClearInitialTemplate,
}) => {
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>('upload')
  const [uploading, setUploading] = useState<'upload' | 'analyze' | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Bước 1: ảnh + thông tin sản phẩm
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null)
  const [title, setTitle] = useState('')
  const [titleFromFile, setTitleFromFile] = useState(false)
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('')
  const [fabric, setFabric] = useState('')

  // Bước 2: lựa chọn
  const [options, setOptions] = useState<StudioOptions | null>(null)
  const [avatars, setAvatars] = useState<BrandAvatar[]>([])
  const [avatarId, setAvatarId] = useState('')
  const [template, setTemplate] = useState('catwalk')
  const [voice, setVoice] = useState('vi-VN-HoaiMyNeural')
  const [style, setStyle] = useState('genz')
  const [duration, setDuration] = useState(5)
  const [requireApproval, setRequireApproval] = useState(true)

  // Kịch bản review KOC tùy chỉnh & xem trước
  const [customScript, setCustomScript] = useState('')
  const [isGeneratingScript, setIsGeneratingScript] = useState(false)
  const [isScriptEditing, setIsScriptEditing] = useState(false)

  // Bước 3: job
  const [job, setJob] = useState<AIJob | null>(null)
  // Dùng lại sản phẩm đã tạo nếu người dùng thử lại với cùng thông tin
  const [savedProduct, setSavedProduct] = useState<{ key: string; id: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Chọn "Dùng mẫu này" ở Thư viện mẫu: điền sẵn góc quay, giọng đọc, lời văn và người mẫu của mẫu đó
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null)
  if (initialTemplate && initialTemplate.id !== appliedTemplateId) {
    setAppliedTemplateId(initialTemplate.id)
    setTemplate(initialTemplate.motion_template)
    setVoice(initialTemplate.voice_id)
    setStyle(initialTemplate.script_style)
    if (initialTemplate.avatar_id) setAvatarId(initialTemplate.avatar_id)
  }

  // Tên/giá lấy được từ link nhưng trang không cho lấy ảnh: chờ người dùng tải ảnh lên
  const [pendingPrefill, setPendingPrefill] = useState<ProductPrefill | null>(null)
  const voicePreview = useVoicePreview((msg) => toast(msg, 'info'))

  // Sang bước mới thì đưa về đầu trang (nút bấm nằm ở cuối trang nên đang cuộn xuống dưới)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [phase])

  useEffect(() => {
    Promise.all([fetchStudioOptions(), fetchAvatars()])
      .then(([opts, list]) => {
        setOptions(opts)
        setAvatars(list)
        const def = list.find((a) => a.is_default) ?? list[0]
        // Giữ người mẫu do mẫu video chọn sẵn nếu có, không thì dùng người mẫu mặc định
        setAvatarId((current) => (current && list.some((a) => a.id === current) ? current : (def?.id ?? '')))
      })
      .catch((e) => toast(e.message, 'error'))
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [toast])

  const pickFile = () => fileRef.current?.click()

  const handleFile = async (file: File) => {
    setUploadError(null)
    setAnalysis(null)
    setUploading('upload')
    try {
      const up = await uploadImage(file)
      setImageUrl(up.media_url)
      setPhase('configure')
      setSavedProduct(null)
      setPendingPrefill(null)
      // Chưa có tên: gợi ý tạm từ tên file, AI (nếu có) sẽ điền lại chính xác hơn
      const suggestion = suggestTitleFromFileName(file.name)
      if (suggestion && (!title || titleFromFile)) {
        setTitle(suggestion)
        setTitleFromFile(true)
      }
      setUploading('analyze')
      const res = await analyzeProduct(up.media_url, title || suggestion || undefined)
      setAnalysis(res)
      if (res.ai) {
        const ai = res.ai
        setTitle((t) => (!t || titleFromFile || t === suggestion ? ai.title_suggestion : t))
        setTitleFromFile(false)
        setCategory((c) => c || ai.category)
        setFabric((f) => f || ai.material_guess)
      }
    } catch (e: any) {
      setUploadError(e.message)
    } finally {
      setUploading(null)
    }
  }

  /** Thông tin từ link sản phẩm hoặc ảnh mẫu. Không tự bịa giá/chất liệu: thiếu thì để trống cho người bán điền. */
  const handleProductLoaded = async (data: ProductPrefill, note: string | null) => {
    setUploadError(null)
    if (data.title) {
      setTitle(data.title)
      setTitleFromFile(false)
    }
    setPrice(data.price ? String(data.price) : '')
    setFabric(data.fabric ?? '')
    setCategory(data.category ?? '')
    setSavedProduct(null)
    if (note) toast(note, 'info')
    if (!data.image_url) {
      setPendingPrefill(data)
      return
    }
    setPendingPrefill(null)
    setImageUrl(data.image_url)
    setAnalysis(null)
    setPhase('configure')
    setUploading('analyze')
    try {
      setAnalysis(await analyzeProduct(data.image_url, data.title || undefined))
    } catch {
      // Chấm điểm ảnh chỉ để tham khảo, không chặn việc tạo video
    } finally {
      setUploading(null)
    }
  }

  const handleGenerateScriptPreview = async () => {
    if (!title.trim()) {
      toast('Vui lòng nhập tên sản phẩm trước khi tạo kịch bản', 'error')
      return
    }
    const priceNum = Number(price.replace(/\D/g, '')) || 0
    if (!priceNum) {
      toast('Vui lòng nhập giá bán trước để kịch bản nhắc đúng giá', 'error')
      return
    }
    setIsGeneratingScript(true)
    try {
      const res = await previewScript({
        title: title.trim(),
        price: priceNum,
        fabric: fabric || undefined,
        category: category || undefined,
        style,
      })
      setCustomScript(res.full_script)
      setIsScriptEditing(true)
      toast('Đã viết kịch bản, bạn có thể sửa trực tiếp', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setIsGeneratingScript(false)
    }
  }

  const startPolling = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const j = await fetchJobStatus(jobId)
        setJob(j)
        if (['completed', 'failed', 'awaiting_approval', 'rejected'].includes(j.status)) {
          if (pollRef.current) clearInterval(pollRef.current)
          setPhase(j.status === 'completed' ? 'done' : j.status === 'awaiting_approval' ? 'review' : 'failed')
          if (j.status === 'failed') {
            fetchProfile()
              .then((p) => onCreditsChange(p.credits))
              .catch(() => {})
          }
        }
      } catch (e) {
        console.error(e)
      }
    }, 1500)
  }

  const cost = options?.pipeline_cost_credits ?? 0
  const previewCost = options?.tryon_preview_cost_credits ?? 0
  const missingCredits = Math.max(0, cost - credits)

  const handleCreate = async () => {
    setSubmitError(null)
    const priceNum = Number(price.replace(/\D/g, ''))
    if (!imageUrl) return setSubmitError('Vui lòng tải ảnh sản phẩm trước')
    if (title.trim().length < 2) return setSubmitError('Vui lòng nhập tên sản phẩm')
    if (!priceNum) return setSubmitError('Vui lòng nhập giá bán, ví dụ 189000')
    if (missingCredits > 0) return setSubmitError(`Bạn cần thêm ${formatNumber(missingCredits)} credit để tạo video này.`)

    setSubmitting(true)
    try {
      const key = JSON.stringify([imageUrl, title.trim(), priceNum, category, fabric])
      let productId = savedProduct?.key === key ? savedProduct.id : null
      if (!productId) {
        const product = await createAnalyzedProduct({
          title: title.trim(),
          price: priceNum,
          image_url: imageUrl,
          category: category || undefined,
          fabric_type: fabric || undefined,
          analysis: analysis?.ai ?? null,
        })
        productId = product.id
        setSavedProduct({ key, id: productId })
      }
      const run = await triggerPipelineRun({
        product_id: productId,
        avatar_id: avatarId,
        template,
        voice,
        script_style: style,
        custom_script: isScriptEditing && customScript.trim() ? customScript.trim() : undefined,
        duration_sec: duration,
        require_approval: requireApproval,
      })
      onCreditsChange(run.remaining_credits)
      setJob({ job_id: run.job_id, status: 'queued', progress: 0, current_step: 'Đang chờ xử lý' })
      setPhase('running')
      startPolling(run.job_id)
    } catch (e: any) {
      setSubmitError(e instanceof ApiError && e.status === 402 ? `${e.message}. Hãy nạp thêm credit.` : e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setPhase('upload')
    setImageUrl(null)
    setAnalysis(null)
    setTitle('')
    setTitleFromFile(false)
    setPrice('')
    setCategory('')
    setFabric('')
    setJob(null)
    setUploadError(null)
    setSubmitError(null)
    setSavedProduct(null)
  }

  const placeholderEngines = options && [options.engines.tryon, options.engines.video].some((e) => e.startsWith('placeholder'))
  const ai = analysis?.ai
  const step = phase === 'upload' ? 0 : phase === 'configure' ? 1 : 2

  return (
    <div ref={scrollRef} className="flex-1 h-full overflow-y-auto text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Studio</p>
            <h1 className="display text-3xl sm:text-4xl mt-1.5">Tạo video review</h1>
            <p className="text-[var(--text-muted)] mt-2 max-w-xl">
              Từ một tấm ảnh sản phẩm thành video có người mẫu, lời review và phụ đề.
            </p>
          </div>
          <Stepper step={step} />
        </div>

        {placeholderEngines && (
          <div className="flex gap-2.5 items-start text-sm px-4 py-3 rounded-2xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-card)_70%,transparent)] text-[var(--text-sub)]">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent-text)]" />
            <span>
              {isAdmin
                ? 'Máy chủ chưa bật AI thử đồ hoặc AI tạo video, nên video sẽ là ảnh sản phẩm kèm chuyển động máy quay (bản xem thử). Mở "Kiểm tra hệ thống" trong menu tài khoản để xem cách bật.'
                : 'Hệ thống đang ở chế độ xem thử: video là ảnh sản phẩm kèm chuyển động máy quay, chưa có người mẫu AI mặc đồ.'}
            </span>
          </div>
        )}

        {initialTemplate && (
          <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-purple-500/10 border border-amber-500/20 flex items-center justify-between gap-3 text-sm animate-fade-up">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                Đang áp dụng mẫu: <strong className="text-[var(--text-main)]">{initialTemplate.title}</strong> ({initialTemplate.badge})
              </span>
            </div>
            {onClearInitialTemplate && (
              <button
                type="button"
                onClick={onClearInitialTemplate}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] underline shrink-0"
              >
                Hủy mẫu
              </button>
            )}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />

        {phase === 'upload' && (
          <UploadHero
            onPick={pickFile}
            onFile={handleFile}
            uploading={uploading === 'upload'}
            error={uploadError}
            onProductLoaded={handleProductLoaded}
            pendingPrefill={pendingPrefill}
          />
        )}

        {phase === 'configure' && imageUrl && (
          <>
            <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 lg:gap-8 items-start animate-fade-up">
              {/* Ảnh sản phẩm + chất lượng ảnh */}
              <div className="card p-3 sm:p-4 lg:sticky lg:top-6">
                <div
                  className={`relative rounded-2xl overflow-hidden bg-[var(--bg-surface)] aspect-[4/5] max-h-[62vh] w-full ${
                    uploading ? 'shimmer' : ''
                  }`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const f = e.dataTransfer.files[0]
                    if (f) handleFile(f)
                  }}
                >
                  <img src={imageUrl} alt="Ảnh sản phẩm" className="w-full h-full object-contain" />
                  {uploading && (
                    <span className="absolute top-3 left-3 glass rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {uploading === 'upload' ? 'Đang tải ảnh...' : 'Đang kiểm tra ảnh...'}
                    </span>
                  )}
                  <button
                    onClick={pickFile}
                    className="absolute bottom-3 right-3 glass rounded-full px-3.5 py-2 text-sm font-semibold flex items-center gap-1.5 shadow-sm hover:bg-white"
                  >
                    <RefreshCw className="w-4 h-4" /> Đổi ảnh
                  </button>
                </div>
                {uploadError && (
                  <div className="flex gap-2 items-start text-sm mt-3 p-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{uploadError}</span>
                  </div>
                )}
                {analysis && <QualityNote quality={analysis.quality} warning={analysis.warning} />}
              </div>

              <div className="space-y-5">
                <Section
                  n="01"
                  title="Thông tin sản phẩm"
                  aside={
                    ai && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] px-3 py-1 text-xs font-semibold">
                        <Sparkles className="w-3.5 h-3.5" /> AI đã điền sẵn
                      </span>
                    )
                  }
                >
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block">
                        <span className="field-label">Tên sản phẩm *</span>
                        <input
                          className="field"
                          value={title}
                          onChange={(e) => {
                            setTitle(e.target.value)
                            setTitleFromFile(false)
                          }}
                          maxLength={200}
                          placeholder="Ví dụ: Áo sơ mi kẻ sọc xanh"
                        />
                      </label>
                      {titleFromFile && (
                        <span className="text-sm text-[var(--text-muted)] block mt-1.5">
                          Gợi ý từ tên file ảnh, bạn sửa lại cho đúng nhé.
                        </span>
                      )}
                    </div>
                    <label className="block">
                      <span className="field-label">Giá bán (đồng) *</span>
                      <input
                        className="field"
                        inputMode="numeric"
                        value={price}
                        placeholder="Ví dụ: 189000"
                        onChange={(e) => setPrice(e.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="field-label">Loại sản phẩm</span>
                      <input className="field" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Áo, đầm, quần..." />
                    </label>
                    <label className="sm:col-span-2 block">
                      <span className="field-label">Chất liệu</span>
                      <input className="field" value={fabric} onChange={(e) => setFabric(e.target.value)} placeholder="Cotton, lụa, dạ..." />
                    </label>
                  </div>
                  {ai && ai.key_features.length > 0 && (
                    <div className="mt-5">
                      <span className="field-label">Điểm nổi bật AI nhận ra (dùng để viết lời review)</span>
                      <div className="flex flex-wrap gap-2">
                        {[...ai.key_features, ...ai.colors].map((f) => (
                          <span key={f} className="text-sm px-3 py-1 rounded-full bg-[var(--bg-surface)] text-[var(--text-sub)]">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>

                <Section n="02" title="Chọn người mẫu">
                  <ModelPicker avatars={avatars} value={avatarId} onChange={setAvatarId} />
                </Section>

                <Section n="03" title="Kiểu video">
                  <TemplatePicker templates={options?.templates ?? []} value={template} onChange={setTemplate} image={imageUrl} />
                  {options?.engines.video.startsWith('replicate') && (
                    <div className="mt-5">
                      <span className="field-label">Độ dài đoạn AI chuyển động</span>
                      <ChipGroup label="Độ dài" options={DURATIONS} value={duration} onChange={setDuration} />
                    </div>
                  )}
                </Section>

                <Section n="04" title="Giọng đọc & lời review">
                  <span className="field-label">Giọng đọc</span>
                  <VoicePicker
                    voices={options?.voices ?? []}
                    value={voice}
                    onChange={setVoice}
                    playing={voicePreview.playing}
                    onPreview={voicePreview.toggle}
                  />

                  <span className="field-label mt-5">Phong cách lời review</span>
                  <ChipGroup
                    label="Phong cách lời review"
                    options={(options?.script_styles ?? []).map((s) => ({ id: s, label: STYLE_LABELS[s] ?? s }))}
                    value={style}
                    onChange={setStyle}
                  />

                  {/* Kịch bản review xem trước & chỉnh sửa */}
                  <div className="mt-5 p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)] space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          Kịch bản review KOC (3 câu)
                        </h4>
                        <p className="text-xs text-[var(--text-muted)]">
                          {isScriptEditing
                            ? 'Bạn có thể chỉnh sửa trực tiếp câu từ bên dưới để AI đọc đúng ý'
                            : 'AI sẽ tự động viết kịch bản tối ưu chuyển đổi theo phong cách đã chọn'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleGenerateScriptPreview}
                        disabled={isGeneratingScript || !title}
                        className="btn btn-secondary btn-sm text-xs"
                      >
                        {isGeneratingScript ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        {customScript ? 'Viết lại kịch bản' : 'Xem & chỉnh sửa câu từ'}
                      </button>
                    </div>

                    {isScriptEditing && (
                      <div className="space-y-2 animate-fade-up">
                        <textarea
                          rows={4}
                          maxLength={600}
                          aria-label="Kịch bản lời review"
                          value={customScript}
                          onChange={(e) => setCustomScript(e.target.value)}
                          placeholder="Ví dụ: Dạ em đầm hoa nhí này vừa cập bến xinh xắn lắm các nàng ơi..."
                          className="w-full text-sm p-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] focus:outline-none focus:ring-2 focus:ring-[var(--ink)] leading-relaxed resize-y"
                        />
                        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                          <span>
                            AI đọc đúng nguyên văn, có thể thêm tên shop, hotline · {customScript.length}/600
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomScript('')
                              setIsScriptEditing(false)
                            }}
                            className="text-[var(--text-muted)] hover:text-[var(--danger-text)] underline shrink-0"
                          >
                            Dùng lại kịch bản tự động
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </Section>

                <section className="card p-5 sm:p-6">
                  <Toggle
                    checked={requireApproval}
                    onChange={setRequireApproval}
                    label="Cho tôi duyệt ảnh thử đồ trước khi tạo video"
                    description={
                      options && requireApproval ? `Không ưng thì hủy được, hoàn lại ${cost - previewCost} credit.` : undefined
                    }
                  />
                </section>
              </div>
            </div>

            {/* Chi phí, số dư và nút tạo: luôn nằm ở đáy màn hình, lỗi hiện ngay tại đây */}
            <div className="sticky bottom-3 sm:bottom-5 z-10">
              <div className="card shadow-[var(--shadow-pop)] p-3 sm:p-4 sm:pl-6 space-y-3">
                {submitError && (
                  <div className="flex gap-2 items-start text-sm p-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)] animate-fade-up">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="flex-1">{submitError}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm leading-snug min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-muted)]">Chi phí:</span>
                      <strong>{options ? `${formatNumber(cost)} credit` : '...'}</strong>
                      {options && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--ok-bg)] text-[var(--ok-text)] font-medium">
                          ≈ {formatVnd(cost * 100)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5">
                      <span className="text-[var(--text-muted)]">Số dư: </span>
                      <strong className={missingCredits > 0 ? 'text-[var(--danger-text)]' : ''}>{formatNumber(credits)} credit</strong>
                      {cost > 0 && credits >= cost && (
                        <span className="text-xs text-[var(--text-muted)] ml-1">(đủ tạo {formatNumber(Math.floor(credits / cost))} video)</span>
                      )}
                    </div>
                  </div>
                  {missingCredits > 0 ? (
                    <button onClick={onOpenDeposit} className="btn btn-accent btn-lg">
                      <Plus className="w-4 h-4" /> Nạp<span className="hidden sm:inline"> thêm</span> {formatNumber(missingCredits)} credit
                    </button>
                  ) : (
                    <button onClick={handleCreate} disabled={submitting || !!uploading} className="btn btn-primary btn-lg">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Tạo video
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {phase === 'running' && job && <JobProgress job={job} fallbackImage={imageUrl} onOpenVideos={onOpenVideos} />}

        {phase === 'review' && job?.output_image_url && (
          <div className="card max-w-4xl mx-auto p-5 sm:p-8 animate-fade-up">
            <TryOnReview
              jobId={job.job_id}
              imageUrl={job.output_image_url}
              refundCredits={cost - previewCost}
              previewCost={previewCost}
              onApproved={() => {
                // Hiện ngay trạng thái mới, không đợi lần hỏi tiến độ kế tiếp
                setJob({ ...job, status: 'queued', progress: 45, current_step: 'Đã duyệt, đang chờ tạo video' })
                setPhase('running')
                startPolling(job.job_id)
              }}
              onRejected={(remaining) => {
                onCreditsChange(remaining)
                setJob(null)
                setPhase('configure')
              }}
            />
          </div>
        )}

        {phase === 'done' && job && (
          <div className="space-y-6 animate-fade-up">
            <div>
              <p className="eyebrow flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Hoàn tất
              </p>
              <h2 className="display text-2xl sm:text-3xl mt-1.5">Video của bạn đã sẵn sàng</h2>
            </div>
            <VideoResult
              job={job}
              productTitle={title}
              actions={
                <>
                  <button onClick={reset} className="btn btn-secondary">
                    <RotateCcw className="w-4 h-4" /> Tạo video mới
                  </button>
                  <button onClick={onOpenVideos} className="btn btn-ghost">
                    <Film className="w-4 h-4" /> Video của tôi
                  </button>
                </>
              }
            />
          </div>
        )}

        {phase === 'failed' && job && (
          <div className="card max-w-xl mx-auto text-center space-y-4 p-8 sm:p-10 animate-fade-up">
            <span className="w-14 h-14 rounded-full bg-[var(--danger-bg)] text-[var(--danger-text)] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </span>
            <h2 className="display text-2xl">Chưa tạo được video</h2>
            <p className="text-sm text-[var(--text-muted)]">{job.error_message}</p>
            {job.refunded && <p className="text-sm font-medium text-[var(--ok-text)]">Credit đã được hoàn lại vào ví.</p>}
            <button onClick={() => setPhase('configure')} className="btn btn-primary">
              <RotateCcw className="w-4 h-4" /> Thử lại
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
