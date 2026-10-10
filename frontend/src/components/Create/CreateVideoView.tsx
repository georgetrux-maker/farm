import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Film, Info, Loader2, QrCode, RotateCcw, Sparkles, Upload } from 'lucide-react'
import {
  ApiError, analyzeProduct, createAnalyzedProduct, fetchAvatars, fetchJobStatus, fetchProfile, fetchStudioOptions,
  triggerPipelineRun, uploadImage, type ProductAnalysis, type StudioOptions,
} from '../../services/api'
import type { AIJob, BrandAvatar } from '../../types'
import { formatNumber, suggestTitleFromFileName } from '../../lib/format'
import { AvatarImage } from '../ui/AvatarImage'
import { useToast } from '../ui/toastContext'
import { TryOnReview } from './TryOnReview'
import { VideoResult } from './VideoResult'

interface CreateVideoViewProps {
  credits: number
  isAdmin: boolean
  onCreditsChange: (credits: number) => void
  onOpenDeposit: () => void
  onOpenVideos: () => void
}

type Phase = 'upload' | 'configure' | 'running' | 'review' | 'done' | 'failed'

const STEPS = ['Sản phẩm', 'Người mẫu & video', 'Duyệt & đăng']

const STYLE_LABELS: Record<string, string> = {
  genz: 'GenZ trẻ trung',
  office: 'Công sở thanh lịch',
  honest: 'Review thật lòng',
}

const card = 'rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 sm:p-5'
const label = 'text-sm font-medium text-[var(--text-muted)] block mb-1.5'
const input =
  'w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-color)]'

function scoreColor(score: number) {
  if (score >= 75) return 'text-[var(--accent-text)]'
  if (score >= 50) return 'text-[var(--warn-text)]'
  return 'text-[var(--danger-text)]'
}

export const CreateVideoView: React.FC<CreateVideoViewProps> = ({
  credits,
  isAdmin,
  onCreditsChange,
  onOpenDeposit,
  onOpenVideos,
}) => {
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>('upload')
  const [uploading, setUploading] = useState<'upload' | 'analyze' | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<{ text: string; needCredits: boolean } | null>(null)

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

  // Bước 3: job
  const [job, setJob] = useState<AIJob | null>(null)
  // Dùng lại sản phẩm đã tạo nếu người dùng thử lại với cùng thông tin
  const [savedProduct, setSavedProduct] = useState<{ key: string; id: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([fetchStudioOptions(), fetchAvatars()])
      .then(([opts, list]) => {
        setOptions(opts)
        setAvatars(list)
        const def = list.find((a) => a.is_default) ?? list[0]
        if (def) setAvatarId(def.id)
      })
      .catch((e) => toast(e.message, 'error'))
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [toast])

  const handleFile = async (file: File) => {
    setUploadError(null)
    setAnalysis(null)
    setUploading('upload')
    try {
      const up = await uploadImage(file)
      setImageUrl(up.media_url)
      setPhase('configure')
      setSavedProduct(null)
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

  const showSubmitError = (text: string, needCredits = false) => {
    setSubmitError({ text, needCredits })
    // Lỗi hiện ngay cạnh nút; cuộn tới để người dùng chắc chắn thấy
    setTimeout(() => submitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  const handleCreate = async () => {
    setSubmitError(null)
    const priceNum = Number(price.replace(/\D/g, ''))
    if (!imageUrl) return showSubmitError('Vui lòng tải ảnh sản phẩm trước')
    if (title.trim().length < 2) return showSubmitError('Vui lòng nhập tên sản phẩm')
    if (!priceNum) return showSubmitError('Vui lòng nhập giá bán, ví dụ 189000')
    if (missingCredits > 0) return showSubmitError(`Bạn cần thêm ${formatNumber(missingCredits)} credit để tạo video này.`, true)

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
        duration_sec: duration,
        require_approval: requireApproval,
      })
      onCreditsChange(run.remaining_credits)
      setJob({ job_id: run.job_id, status: 'queued', progress: 0, current_step: 'Đang chờ xử lý' })
      setPhase('running')
      startPolling(run.job_id)
    } catch (e: any) {
      showSubmitError(e.message, e instanceof ApiError && e.status === 402)
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
  const quality = analysis?.quality
  const ai = analysis?.ai
  const step = phase === 'upload' ? 0 : phase === 'configure' ? 1 : 2

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[var(--bg-app)] text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-5 sm:py-6 space-y-5">
        <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold">Tạo video review</h1>
            <p className="text-sm text-[var(--text-muted)]">Tải ảnh sản phẩm, chọn người mẫu và kiểu video, AI làm phần còn lại.</p>
          </div>
          {/* Điện thoại: một dòng "Bước x/3"; màn lớn: đủ 3 bước */}
          <p className="sm:hidden text-sm font-semibold text-[var(--accent-text)]">
            Bước {step + 1}/3: {STEPS[step]}
          </p>
          <ol className="hidden sm:flex items-center gap-2 text-sm">
            {STEPS.map((s, i) => (
              <li
                key={s}
                aria-current={i === step ? 'step' : undefined}
                className={`px-3 py-1.5 rounded-lg border ${
                  i === step
                    ? 'border-[var(--accent-border)] text-[var(--accent-text)] bg-[var(--accent-soft)] font-semibold'
                    : i < step
                      ? 'border-[var(--border-subtle)] text-[var(--text-main)]'
                      : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                }`}
              >
                {i + 1}. {s}
              </li>
            ))}
          </ol>
        </div>

        {placeholderEngines && (
          <div className="flex gap-2 items-start text-sm p-3 rounded-xl border border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn-text)]">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {isAdmin
                ? 'Máy chủ chưa bật AI thử đồ hoặc AI tạo video, nên video sẽ là ảnh sản phẩm kèm chuyển động máy quay (bản xem thử). Mở "Kiểm tra hệ thống" để xem cách bật.'
                : 'Hệ thống đang ở chế độ xem thử: video là ảnh sản phẩm kèm chuyển động máy quay, chưa có người mẫu AI mặc đồ.'}
            </span>
          </div>
        )}

        {(phase === 'upload' || phase === 'configure') && (
          <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5">
            {/* Ảnh sản phẩm */}
            <div className={card}>
              <span className={label}>Ảnh sản phẩm</span>
              <button
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) handleFile(f)
                }}
                className="w-full aspect-[4/3] md:aspect-[3/4] rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] flex flex-col items-center justify-center gap-2 overflow-hidden hover:border-[var(--accent-color)] transition-colors"
              >
                {imageUrl ? (
                  <img src={imageUrl} alt="Ảnh sản phẩm" className="w-full h-full object-contain" />
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-[var(--text-muted)]" />
                    <span className="text-sm text-[var(--text-muted)] px-6 text-center">
                      Bấm để chọn ảnh hoặc kéo thả vào đây (JPG, PNG, WEBP, tối đa 10MB)
                    </span>
                  </>
                )}
              </button>
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
              {imageUrl && (
                <button onClick={() => fileRef.current?.click()} className="mt-2 text-sm text-[var(--accent-text)] font-medium">
                  Đổi ảnh khác
                </button>
              )}
              <p className="text-sm text-[var(--text-muted)] mt-2">
                Mẹo: chụp thẳng, đủ sáng, thấy trọn sản phẩm (trải phẳng hoặc trên ma-nơ-canh) để thử đồ đẹp nhất.
              </p>

              {uploading && (
                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mt-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {uploading === 'upload' ? 'Đang tải ảnh lên...' : 'Đang kiểm tra ảnh...'}
                </div>
              )}
              {uploadError && (
                <div className="flex gap-2 items-start text-sm mt-3 p-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}

              {quality && (
                <div className="mt-4 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--text-muted)]">Chất lượng ảnh</span>
                    <span className={`font-bold tabular-nums ${scoreColor(quality.score)}`}>{quality.score}/100</span>
                  </div>
                  {quality.issues.length > 0 ? (
                    <ul className="text-sm text-[var(--warn-text)] space-y-1 list-disc pl-4">
                      {quality.issues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[var(--accent-text)] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Ảnh đạt yêu cầu
                    </p>
                  )}
                  {analysis?.warning && <p className="text-xs text-[var(--text-muted)]">{analysis.warning}</p>}
                </div>
              )}
            </div>

            <div className="space-y-5">
              {/* Thông tin sản phẩm */}
              <div className={card}>
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <h2 className="font-semibold text-base">Thông tin sản phẩm</h2>
                  {ai && (
                    <span className="text-xs px-2 py-1 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> AI đã điền sẵn, bạn sửa lại nếu cần
                    </span>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block">
                      <span className={label}>Tên sản phẩm *</span>
                      <input
                        className={input}
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
                      <span className="text-sm text-[var(--text-muted)] block mt-1">
                        Gợi ý từ tên file ảnh, bạn sửa lại cho đúng nhé.
                      </span>
                    )}
                  </div>
                  <label className="block">
                    <span className={label}>Giá bán (đồng) *</span>
                    <input
                      className={input}
                      inputMode="numeric"
                      value={price}
                      placeholder="Ví dụ: 189000"
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className={label}>Loại sản phẩm</span>
                    <input className={input} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Áo, đầm, quần..." />
                  </label>
                  <label className="sm:col-span-2 block">
                    <span className={label}>Chất liệu</span>
                    <input className={input} value={fabric} onChange={(e) => setFabric(e.target.value)} placeholder="Cotton, lụa, dạ..." />
                  </label>
                </div>
                {ai && ai.key_features.length > 0 && (
                  <div className="mt-3">
                    <span className={label}>Điểm nổi bật AI nhận ra (dùng để viết kịch bản)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[...ai.key_features, ...ai.colors].map((f) => (
                        <span key={f} className="text-sm px-2 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Người mẫu & kiểu video */}
              <div className={card}>
                <h2 className="font-semibold text-base mb-3">Người mẫu & kiểu video</h2>
                <span className={label}>Người mẫu</span>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                  {avatars.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setAvatarId(a.id)}
                      aria-pressed={avatarId === a.id}
                      className={`rounded-xl overflow-hidden border-2 text-left transition-colors ${
                        avatarId === a.id ? 'border-[var(--accent-color)]' : 'border-transparent'
                      }`}
                    >
                      <AvatarImage src={a.avatar_url} name={a.name} className="w-full aspect-[3/4]" />
                      <div className="px-2 py-1.5 bg-[var(--bg-surface)]">
                        <div className="text-sm font-semibold truncate">{a.name}</div>
                        <div className="text-xs text-[var(--text-muted)] truncate">{a.height}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <span className={label}>Kiểu video</span>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {options?.templates.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setTemplate(t.id)}
                          aria-pressed={template === t.id}
                          className={`text-left text-sm px-3 py-2.5 rounded-lg border ${
                            template === t.id
                              ? 'border-[var(--accent-color)] bg-[var(--accent-soft)] text-[var(--text-main)] font-medium'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    <span className={label}>Giọng đọc</span>
                    <select className={input} value={voice} onChange={(e) => setVoice(e.target.value)}>
                      {options?.voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={label}>Giọng văn kịch bản</span>
                    <select className={input} value={style} onChange={(e) => setStyle(e.target.value)}>
                      {options?.script_styles.map((s) => (
                        <option key={s} value={s}>
                          {STYLE_LABELS[s] ?? s}
                        </option>
                      ))}
                    </select>
                  </label>
                  {options?.engines.video.startsWith('replicate') && (
                    <label className="block">
                      <span className={label}>Độ dài đoạn AI chuyển động</span>
                      <select className={input} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                        <option value={5}>5 giây</option>
                        <option value={10}>10 giây</option>
                      </select>
                    </label>
                  )}
                  <label className="sm:col-span-2 flex items-start gap-2 text-sm text-[var(--text-main)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireApproval}
                      onChange={(e) => setRequireApproval(e.target.checked)}
                      className="mt-1 w-4 h-4 accent-[var(--accent-color)]"
                    />
                    <span>
                      Cho tôi duyệt ảnh thử đồ trước khi tạo video
                      {options && requireApproval && (
                        <span className="block text-[var(--text-muted)]">Không ưng thì hủy được, hoàn {cost - previewCost} credit.</span>
                      )}
                    </span>
                  </label>
                </div>

                {/* Chi phí, số dư và lỗi nằm ngay cạnh nút */}
                <div ref={submitRef} className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm p-3 rounded-xl bg-[var(--bg-surface)]">
                    <span className="text-[var(--text-muted)]">
                      Chi phí: <strong className="text-[var(--text-main)]">{cost} credit</strong>
                    </span>
                    <span className="text-[var(--text-muted)]">
                      Số dư:{' '}
                      <strong className={missingCredits > 0 ? 'text-[var(--danger-text)]' : 'text-[var(--text-main)]'}>
                        {formatNumber(credits)} credit
                      </strong>
                    </span>
                  </div>

                  {submitError && (
                    <div className="flex gap-2 items-start text-sm p-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="flex-1">{submitError.text}</span>
                    </div>
                  )}

                  {missingCredits > 0 ? (
                    <button
                      onClick={onOpenDeposit}
                      className="w-full py-3 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-sm flex items-center justify-center gap-2"
                    >
                      <QrCode className="w-4 h-4" /> Nạp tiền để tạo video (thiếu {formatNumber(missingCredits)} credit)
                    </button>
                  ) : (
                    <button
                      onClick={handleCreate}
                      disabled={submitting || !!uploading}
                      className="w-full py-3 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Tạo video ({cost} credit)
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {phase === 'running' && job && (
          <div className={`${card} max-w-xl mx-auto text-center space-y-4 py-10`}>
            <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-text)] mx-auto" />
            <div>
              <div className="font-semibold">{job.current_step}</div>
              <div className="text-sm text-[var(--text-muted)] mt-1">
                Tạo video bằng AI có thể mất vài phút. Bạn có thể rời trang, video sẽ có trong mục "Video của tôi".
              </div>
            </div>
            <div className="h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
              <div className="h-full bg-[var(--accent-color)] transition-all" style={{ width: `${job.progress}%` }} />
            </div>
            <div className="text-sm text-[var(--text-muted)] tabular-nums">{job.progress}%</div>
          </div>
        )}

        {phase === 'review' && job?.output_image_url && (
          <div className={`${card} max-w-3xl mx-auto`}>
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
          <>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-[var(--accent-text)]" />
              <h2 className="font-semibold text-lg">Video đã sẵn sàng</h2>
            </div>
            <VideoResult
              job={job}
              productTitle={title}
              actions={
                <>
                  <button
                    onClick={reset}
                    className="px-4 py-2.5 rounded-xl border border-[var(--border-strong)] text-sm flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Tạo video mới
                  </button>
                  <button
                    onClick={onOpenVideos}
                    className="px-4 py-2.5 rounded-xl border border-[var(--border-strong)] text-sm flex items-center gap-2"
                  >
                    <Film className="w-4 h-4" /> Video của tôi
                  </button>
                </>
              }
            />
          </>
        )}

        {phase === 'failed' && job && (
          <div className={`${card} max-w-xl mx-auto text-center space-y-3 py-8`}>
            <AlertTriangle className="w-10 h-10 text-[var(--danger-text)] mx-auto" />
            <h2 className="font-semibold">Tạo video không thành công</h2>
            <p className="text-sm text-[var(--text-muted)]">{job.error_message}</p>
            {job.refunded && <p className="text-sm text-[var(--accent-text)]">Credit đã được hoàn lại vào ví.</p>}
            <button
              onClick={() => setPhase('configure')}
              className="px-4 py-2.5 rounded-xl border border-[var(--border-strong)] text-sm inline-flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Thử lại
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
