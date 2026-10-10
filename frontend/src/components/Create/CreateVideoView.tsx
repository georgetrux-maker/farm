import React, { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Film, Info, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Sparkles, X,
} from 'lucide-react'
import {
  ApiError, analyzeProduct, createAnalyzedProduct, fetchAvatars, fetchJobStatus, fetchProfile, fetchStudioOptions,
  previewScript, triggerPipelineRun, uploadImage, type ProductAnalysis, type ProductPrefill, type ShowcaseTemplate,
  type StudioOptions,
} from '../../services/api'
import type { AIJob, BrandAvatar } from '../../types'
import type { CreateRequest } from '../../lib/createRequest'
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
  request?: CreateRequest | null
}

/** upload/product = bước 1, configure = bước 2, còn lại = bước 3 */
type Phase = 'upload' | 'product' | 'configure' | 'running' | 'review' | 'done' | 'failed'

const DURATIONS = [
  { id: 5, label: '5 giây' },
  { id: 10, label: '10 giây' },
]
const SCRIPT_MAX = 600

const digits = (v: string) => Number(v.replace(/\D/g, '')) || 0

/** Khóa nhận biết sản phẩm: đổi bất kỳ thông tin nào thì tạo sản phẩm mới, viết lại kịch bản tự động */
const productKey = (image: string | null, title: string, price: string, original: string, category: string, fabric: string) =>
  JSON.stringify([image, title.trim(), digits(price), digits(original), category.trim(), fabric.trim()])

/** Một khối lựa chọn có số thứ tự kiểu tạp chí */
const Section: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  aside,
  children,
}) => (
  <section className="card p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <h2 className="title text-lg">{title}</h2>
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
        <div className="w-full h-full rounded-full bg-[var(--bg-card)] flex items-center justify-center text-lg font-semibold">
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

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

export const CreateVideoView: React.FC<CreateVideoViewProps> = ({
  credits,
  isAdmin,
  onCreditsChange,
  onOpenDeposit,
  onOpenVideos,
  initialTemplate,
  onClearInitialTemplate,
  request,
}) => {
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>('upload')
  const [uploading, setUploading] = useState<'upload' | 'analyze' | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [productError, setProductError] = useState<string | null>(null)

  // Bước 1: ảnh + thông tin sản phẩm
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null)
  const [title, setTitle] = useState('')
  const [titleFromFile, setTitleFromFile] = useState(false)
  const [price, setPrice] = useState('')
  const [originalPrice, setOriginalPrice] = useState('')
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

  // Kịch bản xem trước: AI viết sẵn khi vào bước 2 (theo sản phẩm + phong cách), người bán sửa thoải mái
  const [script, setScript] = useState('')
  const [scriptEdited, setScriptEdited] = useState(false)
  const [scriptLoading, setScriptLoading] = useState(false)
  const [scriptWarning, setScriptWarning] = useState<string | null>(null)
  const [scriptFor, setScriptFor] = useState<string | null>(null)
  const scriptRequest = useRef(0)

  // Bước 3: job
  const [job, setJob] = useState<AIJob | null>(null)
  // Dùng lại sản phẩm đã tạo nếu tạo lại với cùng thông tin
  const [savedProduct, setSavedProduct] = useState<{ key: string; id: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentJobRef = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Tên/giá lấy được từ link nhưng trang không cho lấy ảnh: chờ người dùng tải ảnh lên
  const [pendingPrefill, setPendingPrefill] = useState<ProductPrefill | null>(null)

  // Chọn "Dùng mẫu này" ở Thư viện mẫu: điền sẵn góc quay, giọng đọc, lời văn và người mẫu của mẫu đó
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null)
  if (initialTemplate && initialTemplate.id !== appliedTemplateId) {
    setAppliedTemplateId(initialTemplate.id)
    setTemplate(initialTemplate.motion_template)
    setVoice(initialTemplate.voice_id)
    setStyle(initialTemplate.script_style)
    if (initialTemplate.avatar_id) setAvatarId(initialTemplate.avatar_id)
  }

  // Dữ liệu nạp sẵn từ trang khác (Tạo lại / Tạo video từ sản phẩm / Dùng mẫu này)
  const [appliedRequest, setAppliedRequest] = useState<number | null>(null)
  if (request && request.at !== appliedRequest) {
    setAppliedRequest(request.at)
    if (request.avatarId) setAvatarId(request.avatarId)
    if (request.product) {
      const v = request.product
      const p = request.params ?? {}
      const image = v.image_url
      const t = v.title
      const pr = v.price ? String(v.price) : ''
      const op = v.original_price ? String(v.original_price) : ''
      const cat = v.category ?? ''
      const fab = v.fabric ?? ''
      const oldScript = (request.script || '').slice(0, SCRIPT_MAX)
      setImageUrl(image)
      setAnalysis(null)
      setTitle(t)
      setTitleFromFile(false)
      setPrice(pr)
      setOriginalPrice(op)
      setCategory(cat)
      setFabric(fab)
      setSavedProduct(v.id && image ? { key: productKey(image, t, pr, op, cat, fab), id: v.id } : null)
      if (p.avatar_id) setAvatarId(p.avatar_id)
      if (p.template) setTemplate(p.template)
      if (p.voice) setVoice(p.voice)
      if (p.script_style) setStyle(p.script_style)
      if (p.duration_sec) setDuration(p.duration_sec)
      if (request.params) setRequireApproval(!!p.require_approval)
      setScript(oldScript)
      setScriptEdited(!!oldScript)
      setScriptWarning(null)
      setJob(null)
      setSubmitError(null)
      setUploadError(null)
      setPendingPrefill(null)
      setPhase(image ? 'configure' : 'upload')
    }
  }

  const voicePreview = useVoicePreview((msg) => toast(msg, 'info'))

  // Sang bước mới thì đưa về đầu trang
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [phase])

  // Job đang theo dõi (để bỏ qua kết quả của job cũ khi đã chuyển sang tạo video khác)
  useEffect(() => {
    currentJobRef.current = job?.job_id ?? null
  }, [job?.job_id])

  // Vừa tạo người mẫu riêng hoặc chọn mẫu ở trang khác: tải lại danh sách người mẫu
  const requestAt = request?.at
  useEffect(() => {
    if (!requestAt) return
    let alive = true
    fetchAvatars()
      .then((list) => alive && setAvatars(list))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [requestAt])

  useEffect(() => {
    Promise.all([fetchStudioOptions(), fetchAvatars()])
      .then(([opts, list]) => {
        setOptions(opts)
        setAvatars(list)
        const def = list.find((a) => a.is_default) ?? list[0]
        // Giữ người mẫu do mẫu video / video cũ chọn sẵn nếu còn, không thì dùng người mẫu mặc định
        setAvatarId((current) => (current && list.some((a) => a.id === current) ? current : (def?.id ?? '')))
      })
      .catch((e) => toast(e.message, 'error'))
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [toast])

  const key = productKey(imageUrl, title, price, originalPrice, category, fabric)
  const ai = analysis?.ai
  const features = ai ? [...ai.key_features, ...ai.colors].map((f) => f.slice(0, 80)).slice(0, 12) : []

  const generateScript = async (forStyle = style) => {
    const priceNum = digits(price)
    if (title.trim().length < 2 || !priceNum) return
    const id = ++scriptRequest.current
    setScriptFor(JSON.stringify([key, forStyle]))
    setScriptLoading(true)
    try {
      const res = await previewScript({
        title: title.trim(),
        price: priceNum,
        fabric: fabric.trim() || undefined,
        category: category.trim() || undefined,
        style: forStyle,
        features,
      })
      if (id !== scriptRequest.current) return // đã có yêu cầu mới hơn
      setScript([res.hook_3s, res.body_text, res.cta_text].filter(Boolean).join('\n').slice(0, SCRIPT_MAX))
      setScriptEdited(false)
      setScriptWarning(res.warning)
    } catch (e) {
      if (id === scriptRequest.current) setScriptWarning(errorText(e, 'Không viết được kịch bản xem trước'))
    } finally {
      if (id === scriptRequest.current) setScriptLoading(false)
    }
  }

  // Vào bước 2 hoặc đổi phong cách lời review: AI viết lại kịch bản (trừ khi người bán đã tự sửa)
  // generateScript luôn là bản của lần vẽ mới nhất; effect chỉ chạy lại khi khóa kịch bản đổi
  const generateRef = useRef(generateScript)
  useEffect(() => {
    generateRef.current = generateScript
  })
  const wantScript = phase === 'configure' && !scriptEdited ? JSON.stringify([key, style]) : null
  useEffect(() => {
    if (!wantScript || wantScript === scriptFor) return
    const id = setTimeout(() => generateRef.current(), 0)
    return () => clearTimeout(id)
  }, [wantScript, scriptFor])

  const pickFile = () => fileRef.current?.click()

  const handleFile = async (file: File) => {
    setUploadError(null)
    setAnalysis(null)
    setUploading('upload')
    try {
      const up = await uploadImage(file)
      setImageUrl(up.media_url)
      setPhase('product')
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
        const found = res.ai
        setTitle((t) => (!t || titleFromFile || t === suggestion ? found.title_suggestion : t))
        setTitleFromFile(false)
        setCategory((c) => c || found.category)
        setFabric((f) => f || found.material_guess)
      }
    } catch (e) {
      setUploadError(errorText(e, 'Không tải được ảnh'))
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
    setOriginalPrice('')
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
    setPhase('product')
    setUploading('analyze')
    try {
      setAnalysis(await analyzeProduct(data.image_url, data.title || undefined))
    } catch {
      // Chấm điểm ảnh chỉ để tham khảo, không chặn việc tạo video
    } finally {
      setUploading(null)
    }
  }

  const goConfigure = () => {
    setProductError(null)
    const priceNum = digits(price)
    if (title.trim().length < 2) return setProductError('Vui lòng nhập tên sản phẩm')
    if (!priceNum) return setProductError('Vui lòng nhập giá bán, ví dụ 189000')
    const original = digits(originalPrice)
    if (original && original <= priceNum) return setProductError('Giá gốc phải cao hơn giá bán (hoặc để trống)')
    setPhase('configure')
  }

  const startPolling = (jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    const timer = setInterval(async () => {
      if (currentJobRef.current !== jobId) {
        clearInterval(timer)
        return
      }
      try {
        const j = await fetchJobStatus(jobId)
        if (currentJobRef.current !== jobId) return
        setJob(j)
        if (['completed', 'failed', 'awaiting_approval', 'rejected'].includes(j.status)) {
          clearInterval(timer)
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
    pollRef.current = timer
  }

  const cost = options?.pipeline_cost_credits ?? 0
  const previewCost = options?.tryon_preview_cost_credits ?? 0
  const missingCredits = Math.max(0, cost - credits)

  const handleCreate = async () => {
    setSubmitError(null)
    const priceNum = digits(price)
    if (!imageUrl) return setSubmitError('Vui lòng tải ảnh sản phẩm trước')
    if (title.trim().length < 2 || !priceNum) {
      setPhase('product')
      return setProductError('Vui lòng nhập tên và giá sản phẩm')
    }
    if (script.length > SCRIPT_MAX) return setSubmitError(`Kịch bản tối đa ${SCRIPT_MAX} ký tự`)
    if (missingCredits > 0) return setSubmitError(`Bạn cần thêm ${formatNumber(missingCredits)} credit để tạo video này.`)

    setSubmitting(true)
    try {
      let productId = savedProduct?.key === key ? savedProduct.id : null
      if (!productId) {
        const product = await createAnalyzedProduct({
          title: title.trim(),
          price: priceNum,
          original_price: digits(originalPrice) || undefined,
          image_url: imageUrl,
          category: category.trim() || undefined,
          fabric_type: fabric.trim() || undefined,
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
        // Video đọc đúng kịch bản người bán đang thấy ở bước 2
        custom_script: script.trim() || undefined,
        duration_sec: duration,
        require_approval: requireApproval,
      })
      onCreditsChange(run.remaining_credits)
      currentJobRef.current = run.job_id
      setJob({ job_id: run.job_id, status: 'queued', progress: 0, current_step: 'Đang chờ xử lý' })
      setPhase('running')
      startPolling(run.job_id)
    } catch (e) {
      const message = errorText(e, 'Không tạo được video')
      setSubmitError(e instanceof ApiError && e.status === 402 ? `${message}. Hãy nạp thêm credit.` : message)
    } finally {
      setSubmitting(false)
    }
  }

  /** Về bước 2 với đúng sản phẩm và cài đặt vừa dùng */
  const remakeWithSettings = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setJob(null)
    setSubmitError(null)
    setPhase('configure')
  }

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setPhase('upload')
    setImageUrl(null)
    setAnalysis(null)
    setTitle('')
    setTitleFromFile(false)
    setPrice('')
    setOriginalPrice('')
    setCategory('')
    setFabric('')
    setJob(null)
    setUploadError(null)
    setSubmitError(null)
    setProductError(null)
    setSavedProduct(null)
    setScript('')
    setScriptEdited(false)
    setScriptWarning(null)
    setScriptFor(null)
  }

  const placeholderEngines = options && [options.engines.tryon, options.engines.video].some((e) => e.startsWith('placeholder'))
  const step = phase === 'upload' || phase === 'product' ? 0 : phase === 'configure' ? 1 : 2
  const priceNum = digits(price)
  const originalNum = digits(originalPrice)

  return (
    <div ref={scrollRef} className="flex-1 h-full overflow-y-auto text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="display text-3xl sm:text-4xl">Tạo video AI</h1>
            <p className="text-[var(--text-muted)] mt-2 max-w-xl">
              {step === 0
                ? 'Bước 1: thêm sản phẩm bằng link, ảnh tải lên hoặc ảnh mẫu.'
                : step === 1
                  ? 'Bước 2: chọn người mẫu, phong cách, giọng đọc và xem trước lời review.'
                  : 'Bước 3: xem video, tải về hoặc đăng bán.'}
            </p>
          </div>
          <Stepper step={step} />
        </div>

        {placeholderEngines && step < 2 && (
          <div className="flex gap-2.5 items-start text-sm px-4 py-3 rounded-2xl border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-card)_70%,transparent)] text-[var(--text-sub)]">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent-text)]" />
            <span>
              {isAdmin
                ? 'Máy chủ chưa bật AI thử đồ hoặc AI tạo video, nên video sẽ là ảnh sản phẩm kèm chuyển động máy quay (bản xem thử). Vào Quản trị hệ thống → Cài đặt API để bật.'
                : 'Hệ thống đang ở chế độ xem thử: video là ảnh sản phẩm kèm chuyển động máy quay, chưa có người mẫu AI mặc đồ.'}
            </span>
          </div>
        )}

        {initialTemplate && step < 2 && (
          <div className="p-3.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-between gap-3 text-sm animate-fade-up">
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
              <span className="min-w-0">
                Đang dùng mẫu <strong>{initialTemplate.title}</strong>: góc quay, giọng đọc và lời văn đã được chọn sẵn.
              </span>
            </div>
            {onClearInitialTemplate && (
              <button type="button" onClick={onClearInitialTemplate} className="icon-btn w-8 h-8" aria-label="Bỏ mẫu đang dùng">
                <X className="w-4 h-4" />
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

        {/* ------------------------------------------------ Bước 1: thẻ sản phẩm */}
        {phase === 'product' && imageUrl && (
          <div className="space-y-5 animate-fade-up">
            <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 lg:gap-8 items-start">
              <div className="card p-3 sm:p-4 lg:sticky lg:top-0">
                <div
                  className={`relative rounded-2xl overflow-hidden bg-[var(--bg-surface)] aspect-[4/5] max-h-[60vh] w-full ${
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
                    className="absolute bottom-3 right-3 glass rounded-full px-3.5 py-2 text-sm font-semibold flex items-center gap-1.5 shadow-sm"
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

              <Section
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
                      <span className="text-sm text-[var(--text-muted)] block mt-1.5">Gợi ý từ tên file ảnh, bạn sửa lại cho đúng nhé.</span>
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
                    <span className="field-label">Giá gốc (nếu đang giảm giá)</span>
                    <input
                      className="field"
                      inputMode="numeric"
                      value={originalPrice}
                      placeholder="Ví dụ: 259000"
                      onChange={(e) => setOriginalPrice(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Loại sản phẩm</span>
                    <input className="field" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Áo, đầm, quần..." />
                  </label>
                  <label className="block">
                    <span className="field-label">Chất liệu</span>
                    <input className="field" value={fabric} onChange={(e) => setFabric(e.target.value)} placeholder="Cotton, lụa, dạ..." />
                  </label>
                </div>
                {features.length > 0 && (
                  <div className="mt-5">
                    <span className="field-label">Điểm nổi bật AI nhận ra (dùng để viết lời review)</span>
                    <div className="flex flex-wrap gap-2">
                      {features.map((f) => (
                        <span key={f} className="text-sm px-3 py-1 rounded-full bg-[var(--bg-surface)] text-[var(--text-sub)]">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {priceNum > 0 && (
                  <div className="mt-5 flex items-baseline gap-2 flex-wrap text-sm">
                    <span className="text-[var(--text-muted)]">Giá hiện trên video:</span>
                    <strong className="text-[var(--accent-text)]">{formatVnd(priceNum)}</strong>
                    {originalNum > priceNum && <span className="line-through text-[var(--text-muted)]">{formatVnd(originalNum)}</span>}
                  </div>
                )}
              </Section>
            </div>

            {productError && (
              <div className="flex gap-2 items-start text-sm p-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{productError}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <button onClick={reset} className="btn btn-ghost">
                <ArrowLeft className="w-4 h-4" /> Chọn sản phẩm khác
              </button>
              <button onClick={goConfigure} disabled={uploading === 'upload'} className="btn btn-primary btn-lg">
                Tiếp tục <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------ Bước 2: tùy chỉnh */}
        {phase === 'configure' && imageUrl && (
          <>
            <div className="card p-3 flex items-center gap-3.5 animate-fade-up">
              <img src={imageUrl} alt="" className="w-14 h-16 rounded-xl object-cover bg-[var(--bg-surface)] shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{title}</p>
                <p className="text-sm flex items-baseline gap-2">
                  <span className="text-[var(--accent-text)] font-semibold">{formatVnd(priceNum)}</span>
                  {originalNum > priceNum && <span className="line-through text-[var(--text-muted)]">{formatVnd(originalNum)}</span>}
                  {category && <span className="text-[var(--text-muted)] truncate">· {category}</span>}
                </p>
              </div>
              <button onClick={() => setPhase('product')} className="btn btn-secondary btn-sm shrink-0">
                <Pencil className="w-3.5 h-3.5" /> Sửa
              </button>
            </div>

            <div className="grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-5 lg:gap-6 items-start animate-fade-up">
              <div className="space-y-5">
                <Section title="Người mẫu">
                  <ModelPicker avatars={avatars} value={avatarId} onChange={setAvatarId} />
                </Section>

                <Section title="Phong cách video">
                  <TemplatePicker templates={options?.templates ?? []} value={template} onChange={setTemplate} image={imageUrl} />
                  {options?.engines.video.startsWith('replicate') && (
                    <div className="mt-5">
                      <span className="field-label">Độ dài đoạn AI chuyển động</span>
                      <ChipGroup label="Độ dài" options={DURATIONS} value={duration} onChange={setDuration} />
                    </div>
                  )}
                </Section>
              </div>

              <div className="space-y-5">
                <Section title="Giọng đọc">
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
                </Section>

                <Section
                  title="Kịch bản xem trước"
                  aside={
                    <button
                      type="button"
                      onClick={() => generateScript()}
                      disabled={scriptLoading}
                      className="btn btn-ghost btn-sm"
                    >
                      {scriptLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Viết lại
                    </button>
                  }
                >
                  {scriptLoading && !script ? (
                    <div className="space-y-2" aria-label="AI đang viết kịch bản">
                      <div className="skeleton rounded-lg h-4 w-full" />
                      <div className="skeleton rounded-lg h-4 w-11/12" />
                      <div className="skeleton rounded-lg h-4 w-3/4" />
                    </div>
                  ) : (
                    <textarea
                      rows={6}
                      maxLength={SCRIPT_MAX}
                      aria-label="Kịch bản lời review"
                      value={script}
                      onChange={(e) => {
                        setScript(e.target.value)
                        setScriptEdited(true)
                      }}
                      placeholder="AI sẽ viết sẵn 3 câu: mở đầu gây chú ý, giới thiệu sản phẩm, kêu gọi mua."
                      className={`field resize-y leading-relaxed ${scriptLoading ? 'opacity-60' : ''}`}
                    />
                  )}
                  <div className="flex items-center justify-between gap-3 mt-2 text-xs text-[var(--text-muted)]">
                    <span>
                      {scriptEdited ? 'Bạn đã sửa: AI đọc đúng nguyên văn.' : 'AI viết theo sản phẩm và phong cách, sửa thoải mái.'}
                    </span>
                    <span className="tabular-nums shrink-0">
                      {script.length}/{SCRIPT_MAX}
                    </span>
                  </div>
                  {scriptWarning && <p className="text-xs text-[var(--warn-text)] mt-1.5">{scriptWarning}</p>}
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

            {/* Quay lại, chi phí, số dư và nút tạo: luôn nằm ở đáy màn hình */}
            <div className="sticky bottom-3 sm:bottom-5 z-10">
              <div className="card shadow-[var(--shadow-pop)] p-3 sm:p-4 space-y-3">
                {submitError && (
                  <div className="flex gap-2 items-start text-sm p-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)] animate-fade-up">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="flex-1">{submitError}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <button onClick={() => setPhase('product')} className="btn btn-ghost px-3 sm:px-4" aria-label="Quay lại bước 1">
                    <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Quay lại</span>
                  </button>
                  <div className="text-sm leading-snug min-w-0 flex-1 text-right sm:text-left">
                    <div>
                      <span className="text-[var(--text-muted)]">Chi phí: </span>
                      <strong>{options ? `${formatNumber(cost)} credit` : '...'}</strong>
                      {options && <span className="hidden sm:inline text-[var(--text-muted)]"> (≈ {formatVnd(cost * 100)})</span>}
                    </div>
                    <div className="text-[var(--text-muted)]">
                      Số dư:{' '}
                      <strong className={missingCredits > 0 ? 'text-[var(--danger-text)]' : 'text-[var(--text-main)]'}>
                        {formatNumber(credits)}
                      </strong>
                    </div>
                  </div>
                  {missingCredits > 0 ? (
                    <button onClick={onOpenDeposit} className="btn btn-accent btn-lg">
                      <Plus className="w-4 h-4" /> Nạp<span className="hidden sm:inline"> thêm</span> {formatNumber(missingCredits)}
                    </button>
                  ) : (
                    <button onClick={handleCreate} disabled={submitting || !!uploading || !options} className="btn btn-primary btn-lg">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Tạo video<span className="hidden sm:inline"> · {formatNumber(cost)} credit</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ------------------------------------------------ Bước 3: kết quả */}
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
          <div className="space-y-5 animate-fade-up">
            <h2 className="display text-2xl sm:text-3xl">Video của bạn đã sẵn sàng</h2>
            <VideoResult
              job={job}
              productTitle={title}
              price={priceNum}
              originalPrice={originalNum || null}
              onRemake={remakeWithSettings}
              actions={
                <>
                  <button onClick={reset} className="btn btn-ghost btn-lg">
                    <Plus className="w-4 h-4" /> Video mới
                  </button>
                  <button onClick={onOpenVideos} className="btn btn-ghost btn-lg">
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
            <button onClick={remakeWithSettings} className="btn btn-primary">
              <RotateCcw className="w-4 h-4" /> Thử lại
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
