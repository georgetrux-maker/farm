import type {
  AIJob, BrandAvatar, CreditTransaction, DashboardStats, MyVideosPage, SystemAuditReport, VideoFilter, VideoSort,
} from '../types'

const TOKEN_KEY = 'aura_api_token'

/** Token đăng nhập lưu trong localStorage, hoặc biến môi trường VITE_API_TOKEN khi phát triển. */
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

/** Lỗi từ máy chủ, kèm mã HTTP (vd 402 = không đủ credit) */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Lỗi 401: phiên đăng nhập hết hạn hoặc chưa đăng nhập */
export class UnauthorizedError extends ApiError {}

/** Phát ra khi máy chủ trả 401, App nghe sự kiện này để quay về màn đăng nhập */
export const UNAUTHORIZED_EVENT = 'aura:unauthorized'

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
    if (res.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
      throw new UnauthorizedError(message, 401)
    }
    throw new ApiError(message, res.status)
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
  custom_script?: string
  duration_sec?: number
  require_approval?: boolean
}

export interface ScriptPreviewResult {
  hook_3s: string
  body_text: string
  cta_text: string
  full_script: string
  engine: string
  warning: string | null
}

export function previewScript(data: {
  title: string
  price: number
  fabric?: string
  category?: string
  style?: string
  /** Điểm nổi bật AI nhận ra từ ảnh để lời review cụ thể hơn */
  features?: string[]
}): Promise<ScriptPreviewResult> {
  return post('/api/ai/script/preview', data, 'Không thể tạo kịch bản xem trước')
}


export function triggerPipelineRun(
  params: PipelineParams,
): Promise<{ status: string; job_id: string; credits_deducted: number; remaining_credits: number }> {
  return post('/api/pipeline/run', params, 'Lỗi khi kích hoạt luồng AI')
}

export function fetchMyVideos(params: {
  page?: number
  pageSize?: number
  q?: string
  status?: VideoFilter
  sort?: VideoSort
} = {}): Promise<MyVideosPage> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('page_size', String(params.pageSize))
  if (params.q) query.set('q', params.q)
  if (params.status && params.status !== 'all') query.set('status', params.status)
  if (params.sort) query.set('sort', params.sort)
  const qs = query.toString()
  return request(`/api/jobs${qs ? `?${qs}` : ''}`, {}, 'Không thể tải danh sách video')
}

export function fetchJobStatus(jobId: string): Promise<AIJob> {
  return request(`/api/jobs/${encodeURIComponent(jobId)}`, {}, `Không thể tìm thấy job ${jobId}`)
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
): Promise<{ transaction_id: string; status: 'pending' | 'success' | 'cancelled'; credits: number; balance: number }> {
  return request(`/api/wallet/transactions/${encodeURIComponent(transactionId)}`, {}, 'Không thể kiểm tra giao dịch')
}

export function fetchCreditHistory(): Promise<CreditTransaction[]> {
  return request('/api/wallet/transactions', {}, 'Không thể tải lịch sử credit')
}

export interface WalletSummary {
  balance: number
  deposited_vnd: number
  deposited_credits: number
  used_credits: number
  refunded_credits: number
  adjusted_credits: number
}

export function fetchWalletSummary(): Promise<WalletSummary> {
  return request('/api/wallet/summary', {}, 'Không tải được thông tin ví')
}

export function fetchAvatars(): Promise<BrandAvatar[]> {
  return request('/api/avatars', {}, 'Không thể tải danh sách người mẫu')
}

export function fetchDashboardStats(): Promise<DashboardStats> {
  return request('/api/dashboard/stats', {}, 'Không thể tải dữ liệu thống kê')
}

export function addNewAvatar(data: {
  name: string
  style: string
  height: string
  weight: string
  measurements: string
  avatar_url: string
  badge?: string
  gender?: 'female' | 'male'
}) {
  return post<BrandAvatar>('/api/avatars', data, 'Không thể thêm người mẫu')
}

export function setDefaultAvatar(avatarId: string) {
  return post('/api/avatars/set-default', { avatar_id: avatarId }, 'Không thể cập nhật người mẫu mặc định')
}

export function uploadImage(file: File): Promise<{ media_url: string; width: number; height: number }> {
  const form = new FormData()
  form.append('file', file)
  return request('/api/uploads/image', { method: 'POST', body: form }, 'Không thể tải ảnh lên')
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
  original_price?: number
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
  product_title: string | null
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

// ----------------------------------------------------------------- Lấy thông tin sản phẩm từ link
export interface ScrapedProduct {
  /** success: đủ ảnh, tên, giá; partial: thiếu một phần, xem message */
  status: 'success' | 'partial'
  platform: string
  product_url: string
  title: string | null
  price: number | null
  fabric: string | null
  category: string | null
  image_url: string | null
  images: string[]
  needs_manual_input: boolean
  message: string | null
}

export function scrapeProduct(url: string): Promise<ScrapedProduct> {
  return post<ScrapedProduct>('/api/scraper/product', { url }, 'Không thể đọc thông tin từ link sản phẩm')
}

// ----------------------------------------------------------------- Ảnh sản phẩm mẫu
export interface SampleProduct {
  id: string
  title: string
  price: number
  fabric: string
  category: string
  thumbnail_url: string
}

export interface ProductPrefill {
  title: string
  price: number | null
  fabric?: string | null
  category?: string | null
  image_url: string | null
}

export function fetchSampleProducts(): Promise<{ products: SampleProduct[] }> {
  return request('/api/samples/products', {}, 'Không tải được ảnh mẫu')
}

export function prepareSampleProduct(sampleId: string): Promise<ProductPrefill> {
  return post(`/api/samples/products/${encodeURIComponent(sampleId)}/use`, {}, 'Không chuẩn bị được ảnh mẫu')
}

// ----------------------------------------------------------------- Quản trị: cài đặt API & hệ thống
export type AdminSettingKind = 'secret' | 'text' | 'choice' | 'int' | 'bool'
export type AdminSettingSource = 'admin' | 'env' | 'default' | 'none'

export interface AdminSetting {
  key: string
  provider: string
  label: string
  kind: AdminSettingKind
  /** Key bí mật: bản đã che; số: number; công tắc: boolean; còn lại: chuỗi */
  value: string | number | boolean | null
  source: AdminSettingSource
  configured: boolean
  hint: string
  placeholder: string
  options?: string[]
  min?: number
  max?: number
}

export interface AdminSettings {
  secret_key_ready: boolean
  settings: AdminSetting[]
}

export type ProviderId = 'anthropic' | 'fashn' | 'replicate' | 'sepay' | 'tiktok' | 'facebook'

export interface ProviderCheck {
  ok: boolean
  status: 'ok' | 'invalid_key' | 'no_credit' | 'not_configured' | 'error' | 'info'
  message: string
}

export function fetchAdminSettings(): Promise<AdminSettings> {
  return request('/api/admin/api-keys', {}, 'Không tải được cấu hình')
}

/** Chỉ gửi các ô đã sửa; null hoặc chuỗi rỗng = xóa giá trị trong Admin, dùng lại backend/.env */
export function saveAdminSettings(
  changes: Record<string, string | number | boolean | null>,
): Promise<{ status: string; saved: string[]; message: string; settings: AdminSetting[] }> {
  return post('/api/admin/api-keys', changes, 'Không lưu được cấu hình')
}

/** values: các ô vừa gõ (chưa lưu) để thử trước khi lưu */
export function testProvider(provider: ProviderId, values: Record<string, string> = {}): Promise<ProviderCheck> {
  return post('/api/admin/api-keys/test', { provider, values }, 'Lỗi kiểm tra kết nối')
}

// ----------------------------------------------------------------- Quản trị: doanh thu, người dùng, nạp tiền
export interface PeriodCounts {
  total: number
  today: number
  week: number
  month: number
}

export interface AdminStatsOverview {
  summary: {
    revenue_vnd: PeriodCounts
    new_shops: PeriodCounts
    completed_videos: PeriodCounts
    total_jobs: number
    credits_in_wallets: number
    pending_deposits: number
  }
  /** Cùng kỳ trước để so sánh: hôm qua (đến cùng giờ), tháng trước (đến cùng ngày) */
  previous: {
    revenue_today: number
    revenue_month: number
    new_shops_month: number
    completed_videos_month: number
  }
  /** Theo từng ngày (giờ Việt Nam), ngày cũ nhất trước */
  series: { dates: string[]; revenue_vnd: number[]; completed_videos: number[] }
  /** Doanh thu trong cùng khoảng ngày của biểu đồ, theo nguồn: sepay = tự động, manual = admin duyệt tay */
  revenue_sources: Partial<Record<'sepay' | 'manual' | 'other', number>>
  recent_users: Array<{ id: string; name: string; email: string | null; role: string; credits: number; created_at: string }>
}

export function fetchAdminStatsOverview(days = 7): Promise<AdminStatsOverview> {
  return request(`/api/admin/stats-overview?days=${days}`, {}, 'Không tải được báo cáo quản trị')
}

export interface AdminDeposit {
  id: string
  user_id: string
  user_name: string | null
  user_email: string | null
  amount_vnd: number | null
  amount_credits: number
  /** Nội dung chuyển khoản khách phải ghi, ví dụ "NAPTIEN TX1A2B3C" */
  transfer_content: string | null
  status: 'pending' | 'success' | 'cancelled'
  created_at: string
  confirmed_at: string | null
  confirmed_by: string | null
}

export interface AdminDepositPage {
  items: AdminDeposit[]
  total: number
  page: number
  page_size: number
  has_more: boolean
  counts: Partial<Record<AdminDepositStatus | 'all', number>>
}

export type AdminDepositStatus = 'pending' | 'success' | 'cancelled'

export function fetchAdminDeposits(params: {
  status?: AdminDepositStatus | 'all'
  q?: string
  page?: number
  pageSize?: number
}): Promise<AdminDepositPage> {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.q?.trim()) qs.set('q', params.q.trim())
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('page_size', String(params.pageSize))
  return request(`/api/admin/deposits?${qs}`, {}, 'Không tải được lịch sử nạp tiền')
}

export function verifyDeposit(
  transactionId: string,
): Promise<{ status: 'success' | 'already_processed'; credits_added?: number; new_balance?: number; message?: string }> {
  return post(`/api/admin/deposits/${encodeURIComponent(transactionId)}/verify`, {}, 'Không thể xác nhận giao dịch')
}

export function cancelDeposit(transactionId: string): Promise<{ status: 'cancelled' }> {
  return post(`/api/admin/deposits/${encodeURIComponent(transactionId)}/cancel`, {}, 'Không thể hủy giao dịch')
}

export interface AdminUser {
  id: string
  name: string
  email: string | null
  role: string
  credits: number
  disabled: boolean
  created_at: string
  /** Số video đã tạo xong */
  videos: number
  deposited_vnd: number
}

export interface AdminUserPage {
  items: AdminUser[]
  total: number
  page: number
  page_size: number
  has_more: boolean
  counts: { all: number; active: number; locked: number }
}

export function fetchAdminUsers(params: {
  q?: string
  role?: 'all' | 'shop' | 'admin'
  status?: 'all' | 'active' | 'locked'
  page?: number
  pageSize?: number
}): Promise<AdminUserPage> {
  const qs = new URLSearchParams()
  if (params.q?.trim()) qs.set('q', params.q.trim())
  if (params.role) qs.set('role', params.role)
  if (params.status) qs.set('status', params.status)
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('page_size', String(params.pageSize))
  return request(`/api/admin/users?${qs}`, {}, 'Không tải được danh sách người dùng')
}

export function adjustUserCredits(userId: string, delta: number, reason: string): Promise<{ new_balance: number }> {
  return post(`/api/admin/users/${encodeURIComponent(userId)}/credits`, { delta, reason }, 'Không điều chỉnh được credit')
}

export function setUserLocked(userId: string, locked: boolean): Promise<{ status: 'locked' | 'active' }> {
  return post(`/api/admin/users/${encodeURIComponent(userId)}/lock`, { locked }, 'Không cập nhật được tài khoản')
}

export interface AuditLog {
  id: number
  actor_id: string | null
  actor_name: string
  action: string
  action_label: string
  target: string | null
  detail: string | null
  created_at: string
}

export function fetchAuditLogs(params: { q?: string; action?: string; page?: number; pageSize?: number }): Promise<{
  items: AuditLog[]
  total: number
  page: number
  page_size: number
  has_more: boolean
  actions: Record<string, string>
}> {
  const qs = new URLSearchParams()
  if (params.q?.trim()) qs.set('q', params.q.trim())
  if (params.action) qs.set('action', params.action)
  if (params.page) qs.set('page', String(params.page))
  if (params.pageSize) qs.set('page_size', String(params.pageSize))
  return request(`/api/admin/audit?${qs}`, {}, 'Không tải được nhật ký hệ thống')
}

export interface SupportInfo {
  hotline: string
  zalo: string
  email: string
}

export function fetchSupportInfo(): Promise<SupportInfo> {
  return request('/api/support/info', {}, 'Không tải được thông tin hỗ trợ')
}

export function updateAvatar(
  avatarId: string,
  data: Partial<Pick<BrandAvatar, 'name' | 'style' | 'height' | 'weight' | 'measurements' | 'avatar_url' | 'badge' | 'gender'>>,
): Promise<BrandAvatar> {
  return request(`/api/avatars/${encodeURIComponent(avatarId)}`, { method: 'PATCH', body: JSON.stringify(data) },
    'Không thể cập nhật người mẫu')
}

// ----------------------------------------------------------------- Thư viện mẫu video & nghe thử giọng
export interface ShowcaseTemplate {
  id: string
  title: string
  category: string
  badge: string
  description: string
  tags: string[]
  motion_template: string
  template_label: string
  voice_id: string
  voice_label: string
  script_style: string
  avatar_id: string | null
  sample_product_id: string
  image_url: string
  caption_lines: string[]
  /** Video mẫu thật nếu đã đặt trong backend/samples/showcase; null thì mô phỏng góc quay trên ảnh */
  video_url: string | null
}

export function fetchTemplateShowcase(): Promise<{ templates: ShowcaseTemplate[] }> {
  return request('/api/templates/showcase', {}, 'Không tải được thư viện mẫu')
}

/** Link nghe thử giọng (file do máy chủ tạo bằng đúng giọng đó) */
export const voicePreviewUrl = (voiceId: string) => `/api/ai/tts/preview/${encodeURIComponent(voiceId)}`
