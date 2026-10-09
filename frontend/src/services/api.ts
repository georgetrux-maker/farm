import type { AIJob, SystemAuditReport } from '../types'

export async function fetchSystemAudit(): Promise<SystemAuditReport> {
  const res = await fetch('/api/system/audit-25-tasks')
  if (!res.ok) throw new Error('Không thể tải dữ liệu kiểm thử hệ thống')
  return res.json()
}

export async function triggerPipelineRun(params: {
  product_name: string
  category: string
  avatar_id: string
  voice_id: string
  scene_type: string
}): Promise<{ status: string; job_id: string; credits_deducted: number; remaining_credits: number }> {
  const res = await fetch('/api/pipeline/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error('Lỗi khi kích hoạt luồng AI')
  return res.json()
}

export async function fetchJobStatus(jobId: string): Promise<AIJob> {
  const res = await fetch(`/api/jobs/${jobId}`)
  if (!res.ok) throw new Error(`Không thể tìm thấy job ${jobId}`)
  return res.json()
}

export async function recommendSize(params: {
  height: number
  weight: number
  bust: number
  waist: number
  hips: number
  body_shape: string
}) {
  const res = await fetch('/api/size/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error('Lỗi khi phân tích số đo size')
  return res.json()
}

export async function createDeposit(amount: number) {
  const res = await fetch('/api/wallet/deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  })
  if (!res.ok) throw new Error('Không thể tạo mã VietQR')
  return res.json()
}

export async function fetchAvatars() {
  const res = await fetch('/api/avatars')
  if (!res.ok) throw new Error('Không thể tải danh sách người mẫu')
  return res.json()
}

export async function fetchFeedVideos() {
  const res = await fetch('/api/feed/videos')
  if (!res.ok) throw new Error('Không thể tải feed video')
  return res.json()
}

export async function exportVideo(jobId: string, watermark: boolean = false) {
  const res = await fetch('/api/publisher/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, remove_watermark: !watermark }),
  })
  if (!res.ok) throw new Error('Lỗi khi xuất bản video')
  return res.json()
}

export async function fetchDashboardStats() {
  const res = await fetch('/api/dashboard/stats')
  if (!res.ok) throw new Error('Không thể tải dữ liệu thống kê từ máy chủ')
  return res.json()
}

export async function fetchSettings() {
  const res = await fetch('/api/settings')
  if (!res.ok) throw new Error('Không thể tải cấu hình từ máy chủ')
  return res.json()
}

export async function saveSettings(settings: Record<string, any>) {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error('Không thể lưu cấu hình vào cơ sở dữ liệu')
  return res.json()
}

export async function addNewAvatar(data: {
  name: string
  style: string
  height: string
  weight: string
  measurements: string
  avatar_url: string
  badge?: string
}) {
  const res = await fetch('/api/avatars', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Không thể thêm người mẫu vào cơ sở dữ liệu')
  return res.json()
}

export async function setDefaultAvatar(avatarId: string) {
  const res = await fetch('/api/avatars/set-default', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatar_id: avatarId }),
  })
  if (!res.ok) throw new Error('Không thể cập nhật người mẫu mặc định')
  return res.json()
}

