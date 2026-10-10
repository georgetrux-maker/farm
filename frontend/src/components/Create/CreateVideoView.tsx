import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Film, Info, Loader2, Plus, RefreshCw, RotateCcw, Sparkles } from 'lucide-react'
import {
  ApiError, analyzeProduct, createAnalyzedProduct, fetchAvatars, fetchJobStatus, fetchProfile, fetchStudioOptions,
  triggerPipelineRun, uploadImage, type ProductAnalysis, type StudioOptions,
} from '../../services/api'
import type { AIJob, BrandAvatar } from '../../types'
import { formatNumber, suggestTitleFromFileName } from '../../lib/format'
import { useToast } from '../ui/toastContext'
import { ChipGroup, ModelPicker, TemplatePicker, Toggle } from './Pickers'
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
}

type Phase = 'upload' | 'configure' | 'running' | 'review' | 'done' | 'failed'

const STYLE_LABELS: Record<string, string> = {
  genz: 'GenZ trẻ trung',
  office: 'Công sở thanh lịch',
  honest: 'Review thật lòng',
}

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

  // Bước 3: job
  const [job, setJob] = useState<AIJob | null>(null)
  // Dùng lại sản phẩm đã tạo nếu người dùng thử lại với cùng thông tin
  const [savedProduct, setSavedProduct] = useState<{ key: string; id: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

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
        if (def) setAvatarId(def.id)
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
          <UploadHero onPick={pickFile} onFile={handleFile} uploading={uploading === 'upload'} error={uploadError} />
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
                  <TemplatePicker templates={options?.templates ?? []} value={template} onChange={setTemplate} />
                  {options?.engines.video.startsWith('replicate') && (
                    <div className="mt-5">
                      <span className="field-label">Độ dài đoạn AI chuyển động</span>
                      <ChipGroup label="Độ dài" options={DURATIONS} value={duration} onChange={setDuration} />
                    </div>
                  )}
                </Section>

                <Section n="04" title="Giọng đọc & lời review">
                  <span className="field-label">Giọng đọc</span>
                  <ChipGroup
                    label="Giọng đọc"
                    options={(options?.voices ?? []).map((v) => ({ id: v.id, label: v.label }))}
                    value={voice}
                    onChange={setVoice}
                  />
                  <span className="field-label mt-5">Phong cách lời review</span>
                  <ChipGroup
                    label="Phong cách lời review"
                    options={(options?.script_styles ?? []).map((s) => ({ id: s, label: STYLE_LABELS[s] ?? s }))}
                    value={style}
                    onChange={setStyle}
                  />
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
                  <div className="text-sm leading-snug min-w-0 whitespace-nowrap">
                    <div>
                      <span className="text-[var(--text-muted)]">Chi phí </span>
                      <strong>{cost} credit</strong>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">Số dư </span>
                      <strong className={missingCredits > 0 ? 'text-[var(--danger-text)]' : ''}>{formatNumber(credits)}</strong>
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
