import React, { useEffect, useRef, useState } from 'react'
import {
  Upload, Sparkles, Loader2, AlertTriangle, CheckCircle2, Copy, Check, Download, RotateCcw, ThumbsUp, ThumbsDown,
  Info,
} from 'lucide-react'
import {
  analyzeProduct, approveJob, createAnalyzedProduct, fetchAvatars, fetchJobStatus, fetchProfile, fetchStudioOptions,
  rejectJob,
  triggerPipelineRun, uploadImage, type ProductAnalysis, type StudioOptions,
} from '../../services/api'
import type { AIJob } from '../../types'

interface Avatar {
  id: string
  name: string
  style: string
  height: string
  avatar_url: string
  is_default: number
}

interface CreateVideoViewProps {
  onCreditsChange: (credits: number) => void
}

type Phase = 'upload' | 'configure' | 'running' | 'review' | 'done' | 'failed'

const STYLE_LABELS: Record<string, string> = {
  genz: 'GenZ trẻ trung',
  office: 'Công sở thanh lịch',
  honest: 'Review thật lòng',
}

const card = 'rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5'
const label = 'text-xs font-medium text-[var(--text-muted)] block mb-1.5'
const input =
  'w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-color)]'

function scoreColor(score: number) {
  if (score >= 75) return 'text-[var(--accent-color)]'
  if (score >= 50) return 'text-amber-400'
  return 'text-red-400'
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="p-1.5 rounded-lg hover:bg-[var(--bg-surface)] text-[var(--text-muted)] shrink-0"
      title="Sao chép"
    >
      {copied ? <Check className="w-4 h-4 text-[var(--accent-color)]" /> : <Copy className="w-4 h-4" />}
    </button>
  )
}

export const CreateVideoView: React.FC<CreateVideoViewProps> = ({ onCreditsChange }) => {
  const [phase, setPhase] = useState<Phase>('upload')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Bước 1: ảnh + thông tin sản phẩm
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null)
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('')
  const [fabric, setFabric] = useState('')

  // Bước 2: lựa chọn
  const [options, setOptions] = useState<StudioOptions | null>(null)
  const [avatars, setAvatars] = useState<Avatar[]>([])
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

  useEffect(() => {
    Promise.all([fetchStudioOptions(), fetchAvatars()])
      .then(([opts, list]) => {
        setOptions(opts)
        setAvatars(list)
        const def = list.find((a: Avatar) => a.is_default) ?? list[0]
        if (def) setAvatarId(def.id)
      })
      .catch((e) => setError(e.message))
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handleFile = async (file: File) => {
    setError(null)
    setBusy(true)
    setAnalysis(null)
    try {
      const up = await uploadImage(file)
      setImageUrl(up.media_url)
      setPhase('configure')
      const res = await analyzeProduct(up.media_url, title || undefined)
      setAnalysis(res)
      if (res.ai) {
        setTitle((t) => t || res.ai!.title_suggestion)
        setCategory((c) => c || res.ai!.category)
        setFabric((f) => f || res.ai!.material_guess)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
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

  const handleCreate = async () => {
    setError(null)
    const priceNum = Number(price.replace(/\D/g, ''))
    if (!imageUrl || title.trim().length < 2 || !priceNum) {
      setError('Vui lòng tải ảnh, nhập tên và giá sản phẩm')
      return
    }
    setBusy(true)
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
      setJob({ job_id: run.job_id, status: 'queued', progress: 0, current_step: 'Đang chờ xử lý' } as AIJob)
      setPhase('running')
      startPolling(run.job_id)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleApprove = async () => {
    if (!job) return
    setBusy(true)
    try {
      await approveJob(job.job_id)
      setPhase('running')
      startPolling(job.job_id)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleReject = async () => {
    if (!job) return
    setBusy(true)
    try {
      const res = await rejectJob(job.job_id)
      onCreditsChange(res.remaining_credits)
      setJob({ ...job, status: 'rejected' })
      setPhase('configure')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setPhase('upload')
    setImageUrl(null)
    setAnalysis(null)
    setTitle('')
    setPrice('')
    setCategory('')
    setFabric('')
    setJob(null)
    setError(null)
    setSavedProduct(null)
  }

  const cost = options?.pipeline_cost_credits ?? 0
  const placeholderEngines =
    options &&
    [options.engines.tryon, options.engines.video].some((e) => e.startsWith('placeholder'))
  const quality = analysis?.quality
  const ai = analysis?.ai

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[var(--bg-app)] text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-2xl font-bold">Tạo Video Review</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Tải ảnh sản phẩm, chọn người mẫu và kiểu video, AI làm phần còn lại.
            </p>
          </div>
          <ol className="flex items-center gap-2 text-xs font-mono">
            {['1. Sản phẩm', '2. Người mẫu & video', '3. Duyệt & đăng'].map((s, i) => {
              const step = phase === 'upload' ? 0 : phase === 'configure' ? 1 : 2
              return (
                <li
                  key={s}
                  className={`px-3 py-1.5 rounded-lg border ${
                    i === step
                      ? 'border-[var(--accent-color)] text-[var(--accent-color)] bg-[var(--accent-color)]/10'
                      : i < step
                        ? 'border-[var(--border-subtle)] text-[var(--text-main)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                  }`}
                >
                  {s}
                </li>
              )
            })}
          </ol>
        </div>

        {placeholderEngines && (
          <div className="flex gap-2 items-start text-xs p-3 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Máy chủ chưa cấu hình AI thử đồ hoặc AI tạo video, nên video sẽ là ảnh sản phẩm trên phông nền kèm chuyển
              động máy quay (bản xem thử). Xem trang Kiểm Tra Hệ Thống để biết cách bật.
            </span>
          </div>
        )}
        {error && (
          <div className="flex gap-2 items-start text-sm p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
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
                className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] flex flex-col items-center justify-center gap-2 overflow-hidden hover:border-[var(--accent-color)] transition-colors"
              >
                {imageUrl ? (
                  <img src={imageUrl} alt="Ảnh sản phẩm" className="w-full h-full object-contain" />
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-[var(--text-muted)]" />
                    <span className="text-sm text-[var(--text-muted)] px-6 text-center">
                      Bấm hoặc kéo thả ảnh vào đây (JPG, PNG, WEBP, tối đa 10MB)
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
              <p className="text-[11px] text-[var(--text-muted)] mt-2">
                Mẹo: ảnh chụp thẳng, đủ sáng, thấy trọn sản phẩm (trải phẳng hoặc trên ma-nơ-canh) cho kết quả thử đồ tốt
                nhất.
              </p>

              {busy && !analysis && imageUrl === null && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Đang tải ảnh lên...
                </div>
              )}
              {busy && imageUrl && !analysis && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> AI đang phân tích ảnh...
                </div>
              )}

              {quality && (
                <div className="mt-4 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-muted)]">Chất lượng ảnh</span>
                    <span className={`font-mono font-bold ${scoreColor(quality.score)}`}>{quality.score}/100</span>
                  </div>
                  {quality.issues.length > 0 ? (
                    <ul className="text-xs text-amber-300 space-y-1 list-disc pl-4">
                      {quality.issues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--accent-color)] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ảnh đạt yêu cầu
                    </p>
                  )}
                  {analysis?.warning && <p className="text-[11px] text-[var(--text-muted)]">{analysis.warning}</p>}
                </div>
              )}
            </div>

            <div className="space-y-5">
              {/* Thông tin sản phẩm */}
              <div className={card}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-sm">Thông tin sản phẩm</h2>
                  {ai && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AI đã điền sẵn, bạn sửa lại nếu cần
                    </span>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <span className={label}>Tên sản phẩm *</span>
                    <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
                  </div>
                  <div>
                    <span className={label}>Giá bán (đồng) *</span>
                    <input
                      className={input}
                      inputMode="numeric"
                      value={price}
                      placeholder="189000"
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <span className={label}>Loại sản phẩm</span>
                    <input className={input} value={category} onChange={(e) => setCategory(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <span className={label}>Chất liệu</span>
                    <input className={input} value={fabric} onChange={(e) => setFabric(e.target.value)} />
                  </div>
                </div>
                {ai && ai.key_features.length > 0 && (
                  <div className="mt-3">
                    <span className={label}>Điểm nổi bật AI nhận ra (dùng để viết kịch bản)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[...ai.key_features, ...ai.colors].map((f) => (
                        <span
                          key={f}
                          className="text-[11px] px-2 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Người mẫu & kiểu video */}
              <div className={card}>
                <h2 className="font-semibold text-sm mb-3">Người mẫu & kiểu video</h2>
                <span className={label}>Người mẫu</span>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                  {avatars.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        setAvatarId(a.id)
                        if (phase === 'upload') setPhase('configure')
                      }}
                      className={`rounded-xl overflow-hidden border-2 text-left transition-colors ${
                        avatarId === a.id ? 'border-[var(--accent-color)]' : 'border-transparent'
                      }`}
                    >
                      <img src={a.avatar_url} alt={a.name} className="w-full aspect-[3/4] object-cover bg-[var(--bg-surface)]" />
                      <div className="px-2 py-1.5 bg-[var(--bg-surface)]">
                        <div className="text-xs font-semibold truncate">{a.name}</div>
                        <div className="text-[10px] text-[var(--text-muted)] truncate">{a.height}</div>
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
                          className={`text-left text-xs px-3 py-2.5 rounded-lg border ${
                            template === t.id
                              ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10 text-[var(--text-main)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className={label}>Giọng đọc</span>
                    <select className={input} value={voice} onChange={(e) => setVoice(e.target.value)}>
                      {options?.voices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className={label}>Giọng văn kịch bản</span>
                    <select className={input} value={style} onChange={(e) => setStyle(e.target.value)}>
                      {options?.script_styles.map((s) => (
                        <option key={s} value={s}>
                          {STYLE_LABELS[s] ?? s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className={label}>Thời lượng chuyển động</span>
                    <select className={input} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                      <option value={5}>5 giây</option>
                      <option value={10}>10 giây</option>
                    </select>
                  </div>
                  <label className="flex items-start gap-2 text-xs text-[var(--text-main)] self-end pb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireApproval}
                      onChange={(e) => setRequireApproval(e.target.checked)}
                      className="mt-0.5 accent-[var(--accent-color)]"
                    />
                    <span>Cho tôi duyệt ảnh thử đồ trước khi tạo video</span>
                  </label>
                </div>

                <button
                  onClick={handleCreate}
                  disabled={busy || !imageUrl}
                  className="mt-4 w-full py-3 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Tạo video ({cost} credit)
                </button>
                {requireApproval && options && (
                  <p className="text-[11px] text-[var(--text-muted)] mt-2 text-center">
                    Nếu không ưng ảnh thử đồ, bạn được hoàn {cost - options.tryon_preview_cost_credits} credit.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {phase === 'running' && job && (
          <div className={`${card} max-w-xl mx-auto text-center space-y-4 py-10`}>
            <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-color)] mx-auto" />
            <div>
              <div className="font-semibold">{job.current_step}</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                Tạo video bằng AI có thể mất vài phút. Bạn có thể rời trang, video sẽ có trong Dashboard.
              </div>
            </div>
            <div className="h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
              <div className="h-full bg-[var(--accent-color)] transition-all" style={{ width: `${job.progress}%` }} />
            </div>
            <div className="font-mono text-xs text-[var(--text-muted)]">{job.progress}%</div>
          </div>
        )}

        {phase === 'review' && job?.output_image_url && (
          <div className={`${card} max-w-3xl mx-auto grid sm:grid-cols-2 gap-6 items-center`}>
            <img
              src={job.output_image_url}
              alt="Ảnh thử đồ"
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
            />
            <div className="space-y-4">
              <h2 className="font-semibold text-lg">Ảnh thử đồ đã xong</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Kiểm tra màu sắc, họa tiết và phom dáng có đúng với sản phẩm thật không. Video sẽ được tạo từ ảnh này.
              </p>
              <button
                onClick={handleApprove}
                disabled={busy}
                className="w-full py-3 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <ThumbsUp className="w-4 h-4" /> Ưng ý, tạo video
              </button>
              <button
                onClick={handleReject}
                disabled={busy}
                className="w-full py-3 rounded-xl border border-[var(--border-strong)] text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <ThumbsDown className="w-4 h-4" /> Không ưng, hủy và chọn lại
                {options && ` (hoàn ${cost - options.tryon_preview_cost_credits} credit)`}
              </button>
            </div>
          </div>
        )}

        {phase === 'done' && job?.output_video_url && (
          <div className="grid md:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] gap-5">
            <div className={card}>
              <video
                src={job.output_video_url}
                controls
                autoPlay
                loop
                playsInline
                className="w-full aspect-[9/16] rounded-xl bg-black object-contain"
              />
            </div>
            <div className={`${card} space-y-4`}>
              <div className="flex items-center gap-2 text-[var(--accent-color)]">
                <CheckCircle2 className="w-5 h-5" />
                <h2 className="font-semibold text-lg text-[var(--text-main)]">Video đã sẵn sàng</h2>
              </div>
              {job.script?.warning && <p className="text-xs text-amber-300">{job.script.warning}</p>}
              {job.script?.tts_warning && <p className="text-xs text-amber-300">{job.script.tts_warning}</p>}

              <div>
                <span className={label}>Caption đăng kèm</span>
                <div className="flex gap-2 items-start p-3 rounded-lg bg-[var(--bg-surface)] text-sm">
                  <p className="flex-1">{job.script?.post_caption}</p>
                  <CopyButton text={`${job.script?.post_caption ?? ''}\n${(job.script?.hashtags ?? []).join(' ')}`} />
                </div>
              </div>
              <div>
                <span className={label}>Hashtag</span>
                <div className="flex flex-wrap gap-1.5">
                  {job.script?.hashtags.map((h) => (
                    <span key={h} className="text-xs px-2 py-1 rounded-lg bg-[var(--accent-color)]/10 text-[var(--accent-color)]">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className={label}>Lời thoại trong video</span>
                <div className="flex gap-2 items-start p-3 rounded-lg bg-[var(--bg-surface)] text-xs text-[var(--text-sub)]">
                  <p className="flex-1">{job.script?.full_script}</p>
                  <CopyButton text={job.script?.full_script ?? ''} />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] flex gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0" />
                Video có hình ảnh do AI tạo. Khi đăng TikTok/Facebook, hãy bật nhãn "Nội dung do AI tạo" theo quy định của
                nền tảng.
              </p>
              <div className="flex gap-2 flex-wrap">
                <a
                  href={job.output_video_url}
                  download
                  className="px-4 py-2.5 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-sm flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Tải video
                </a>
                <button
                  onClick={reset}
                  className="px-4 py-2.5 rounded-xl border border-[var(--border-strong)] text-sm flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> Tạo video mới
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === 'failed' && job && (
          <div className={`${card} max-w-xl mx-auto text-center space-y-3 py-8`}>
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
            <h2 className="font-semibold">Tạo video không thành công</h2>
            <p className="text-sm text-[var(--text-muted)]">{job.error_message}</p>
            {job.refunded && <p className="text-sm text-[var(--accent-color)]">Credit đã được hoàn lại.</p>}
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
