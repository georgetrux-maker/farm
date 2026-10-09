import type { AIJob, SystemAuditReport } from '../types'

const TOKEN_KEY = 'aura_api_token'

/** Token lấy từ localStorage (sau này là màn đăng nhập) hoặc biến môi trường VITE_API_TOKEN khi phát triển. */
export function getApiToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || import.meta.env.VITE_API_TOKEN || ''
  } catch {
    return import.meta.env.VITE_API_TOKEN || ''
  }
}

export function setApiToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearApiToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // bỏ qua
  }
}

/** Lỗi 401: phiên đăng nhập hết hạn hoặc chưa đăng nhập */
export class UnauthorizedError extends Error {}

async function request<T>(path: string, options: RequestInit = {}, fallbackError = 'Lỗi kết nối máy chủ'): Promise<T> {
  const headers = new Headers(options.headers)
  const token = getApiToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  const res = await fetch(path, { ...options, headers })
  if (!res.ok) {
    let message = fallbackError
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') message = body.detail
      else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = body.detail[0].msg
    } catch {
      // giữ thông báo mặc định
    }
    if (res.status === 401) throw new UnauthorizedError(message)
    throw new Error(message)
  }
  return res.json()
}

const post = <T>(path: string, body: unknown, fallbackError?: string) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) }, fallbackError)

export function fetchSystemAudit(): Promise<SystemAuditReport> {
  return request('/api/system/audit-25-tasks', {}, 'Không thể tải dữ liệu kiểm tra hệ thống')
}

export interface UserProfile {
  id: string
  name: string
  email: string
  role: string
  credits: number
}

export function fetchProfile(): Promise<UserProfile> {
  return request('/api/user/profile', {}, 'Không thể tải thông tin tài khoản')
}

export interface PipelineParams {
  product_id: string
  avatar_id?: string
  template?: string
  voice?: string
  script_style?: string
  duration_sec?: number
  require_approval?: boolean
}

export function triggerPipelineRun(
  params: PipelineParams,
): Promise<{ status: string; job_id: string; credits_deducted: number; remaining_credits: number }> {
  return post('/api/pipeline/run', params, 'Lỗi khi kích hoạt luồng AI')
}

export function fetchJobStatus(jobId: string): Promise<AIJob> {
  return request(`/api/jobs/${encodeURIComponent(jobId)}`, {}, `Không thể tìm thấy job ${jobId}`)
}

export function recommendSize(params: {
  height: number
  weight: number
  bust: number
  waist: number
  hips: number
  body_shape: string
  product_id?: string
}) {
  return post('/api/size/recommend', params, 'Lỗi khi phân tích số đo size')
}

export interface DepositInfo {
  status: string
  transaction_id: string
  amount_vnd: number
  credits_awarded: number
  qr_code_url: string
  bank_id: string
  account_number: string
  account_holder: string
  transfer_content: string
}

export function createDeposit(amountVnd: number): Promise<DepositInfo> {
  return post('/api/wallet/deposit', { amount_vnd: amountVnd }, 'Không thể tạo mã VietQR')
}

export function fetchDepositStatus(
  transactionId: string,
): Promise<{ transaction_id: string; status: 'pending' | 'success'; credits: number; balance: number }> {
  return request(`/api/wallet/transactions/${encodeURIComponent(transactionId)}`, {}, 'Không thể kiểm tra giao dịch')
}

export function fetchAvatars() {
  return request<any[]>('/api/avatars', {}, 'Không thể tải danh sách người mẫu')
}

export function fetchFeedVideos() {
  return request('/api/feed/videos', {}, 'Không thể tải feed video')
}

export function exportVideo(jobId: string): Promise<{
  download_url: string
  subtitles_vtt: string | null
  seo_caption: string
  hashtags: string[]
  ai_generated_label: string
}> {
  return post('/api/publisher/export', { job_id: jobId }, 'Lỗi khi xuất bản video')
}

export function fetchDashboardStats() {
  return request<any>('/api/dashboard/stats', {}, 'Không thể tải dữ liệu thống kê từ máy chủ')
}

export function fetchSettings() {
  return request<Record<string, string>>('/api/settings', {}, 'Không thể tải cấu hình từ máy chủ')
}

export function saveSettings(settings: Record<string, any>) {
  return post<Record<string, string>>('/api/settings', settings, 'Không thể lưu cấu hình vào cơ sở dữ liệu')
}

export function addNewAvatar(data: {
  name: string
  style: string
  height: string
  weight: string
  measurements: string
  avatar_url: string
  badge?: string
}) {
  return post('/api/avatars', data, 'Không thể thêm người mẫu vào cơ sở dữ liệu')
}

export function setDefaultAvatar(avatarId: string) {
  return post('/api/avatars/set-default', { avatar_id: avatarId }, 'Không thể cập nhật người mẫu mặc định')
}

export function uploadImage(file: File): Promise<{ media_url: string; width: number; height: number }> {
  const form = new FormData()
  form.append('file', file)
  return request('/api/uploads/image', { method: 'POST', body: form }, 'Không thể tải ảnh lên')
}

export function createProduct(data: {
  title: string
  price: number
  image_url: string
  category?: string
  fabric_type?: string
}) {
  return post<{ id: string; title: string }>('/api/products', data, 'Không thể tạo sản phẩm')
}

export interface ProductAnalysisAI {
  is_fashion_item: boolean
  title_suggestion: string
  category: string
  garment_type: string
  photo_type: string
  colors: string[]
  material_guess: string
  style_tags: string[]
  key_features: string[]
  suitable_occasions: string[]
  image_quality_score: number
  image_issues: string[]
}

export interface ProductAnalysis {
  quality: { score: number; issues: string[]; width: number; height: number }
  ai: ProductAnalysisAI | null
  engine: 'claude' | 'local'
  warning: string | null
}

export function analyzeProduct(imageUrl: string, title?: string): Promise<ProductAnalysis> {
  return post('/api/products/analyze', { image_url: imageUrl, title }, 'Không thể phân tích ảnh sản phẩm')
}

export function createAnalyzedProduct(data: {
  title: string
  price: number
  image_url: string
  category?: string
  fabric_type?: string
  analysis?: ProductAnalysisAI | null
}) {
  return post<{ id: string; title: string }>('/api/products', data, 'Không thể tạo sản phẩm')
}

export interface StudioOptions {
  templates: { id: string; label: string }[]
  voices: { id: string; label: string }[]
  script_styles: string[]
  pipeline_cost_credits: number
  tryon_preview_cost_credits: number
  engines: { analysis: string; tryon: string; video: string }
}

export function fetchStudioOptions(): Promise<StudioOptions> {
  return request('/api/ai/templates', {}, 'Không thể tải danh sách mẫu video')
}

export function approveJob(jobId: string) {
  return post<{ status: string }>(`/api/jobs/${encodeURIComponent(jobId)}/approve`, {}, 'Không thể duyệt ảnh thử đồ')
}

export function rejectJob(jobId: string) {
  return post<{ status: string; credits_refunded: number; remaining_credits: number }>(
    `/api/jobs/${encodeURIComponent(jobId)}/reject`,
    {},
    'Không thể hủy job',
  )
}

// ------------------------------------------------------------------ Đăng nhập
export interface AuthResult {
  token: string
  user: UserProfile
}

export function register(name: string, email: string, password: string): Promise<AuthResult> {
  return post('/api/auth/register', { name, email, password }, 'Không thể đăng ký')
}

export function login(email: string, password: string): Promise<AuthResult> {
  return post('/api/auth/login', { email, password }, 'Không thể đăng nhập')
}

export async function logout() {
  try {
    await post('/api/auth/logout', {})
  } finally {
    clearApiToken()
  }
}

// ------------------------------------------------------------------ Mạng xã hội
export interface SocialAccount {
  id: string
  platform: 'tiktok' | 'facebook'
  external_id: string
  display_name: string
}

export interface SocialStatus {
  platforms: { tiktok: boolean; facebook: boolean }
  accounts: SocialAccount[]
}

export function fetchSocialStatus(): Promise<SocialStatus> {
  return request('/api/social/status', {}, 'Không thể tải tài khoản mạng xã hội')
}

export function getSocialConnectUrl(platform: 'tiktok' | 'facebook'): Promise<{ auth_url: string }> {
  return request(`/api/social/${platform}/connect`, {}, 'Không thể kết nối')
}

/** Chuyển trình duyệt sang trang cấp quyền của TikTok/Facebook */
export async function startSocialConnect(platform: 'tiktok' | 'facebook') {
  const { auth_url } = await getSocialConnectUrl(platform)
  window.location.href = auth_url
}

export function disconnectSocial(accountId: string) {
  return request(`/api/social/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' }, 'Không thể ngắt kết nối')
}

export interface TikTokCreatorInfo {
  creator_nickname?: string
  privacy_level_options?: string[]
  comment_disabled?: boolean
  duet_disabled?: boolean
  stitch_disabled?: boolean
  max_video_post_duration_sec?: number
}

export function fetchCreatorInfo(accountId: string): Promise<TikTokCreatorInfo> {
  return request(`/api/social/accounts/${encodeURIComponent(accountId)}/creator-info`, {}, 'Không đọc được thông tin TikTok')
}

export interface Publication {
  id: string
  job_id: string
  platform: string
  status: 'pending' | 'processing' | 'published' | 'failed'
  external_id: string | null
  error_message: string | null
  account_name: string | null
  created_at: string
}

export function publishVideo(data: {
  job_id: string
  account_id: string
  caption: string
  privacy_level?: string
  allow_comment?: boolean
  allow_duet?: boolean
  allow_stitch?: boolean
}) {
  return post<{ publication_id: string }>('/api/social/publish', data, 'Không thể đăng video')
}

export function fetchPublications(jobId?: string): Promise<Publication[]> {
  const q = jobId ? `?job_id=${encodeURIComponent(jobId)}` : ''
  return request(`/api/social/publications${q}`, {}, 'Không thể tải lịch sử đăng')
}
