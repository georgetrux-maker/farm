export interface JobScript {
  engine: string
  warning?: string | null
  post_caption?: string
  full_script: string
  hashtags: string[]
  tts_warning?: string | null
  motion_engine?: string
  video_resolution?: string
  subtitles_burned?: boolean
  /** 5 khung hình trong video kèm câu phụ đề lúc đó (video tạo từ bản này trở đi) */
  scenes?: VideoScene[]
}

export interface VideoScene {
  time: number
  image_url: string
  caption: string
}

export interface AIJob {
  job_id: string
  user_id?: string
  product_id?: string
  status: 'queued' | 'pending' | 'processing' | 'awaiting_approval' | 'completed' | 'failed' | 'rejected'
  progress: number
  current_step: string
  output_video_url?: string | null
  output_image_url?: string | null
  error_message?: string | null
  refunded?: boolean
  cost_credits?: number
  params?: {
    avatar_id?: string
    template?: string
    voice?: string
    script_style?: string
    custom_script?: string | null
    duration_sec?: number
    require_approval?: boolean
  }
  script?: JobScript | null
  created_at?: string
  completed_at?: string | null
}

/** Một dòng trong trang "Video của tôi" */
export interface MyVideo extends AIJob {
  product_title: string | null
  product_image_url: string | null
  product_price?: number | null
  product_original_price?: number | null
  product_category?: string | null
  product_fabric?: string | null
  published_count: number
  /** Các nền tảng đã đăng thành công, ví dụ ["facebook", "tiktok"] */
  published_platforms?: string[]
}

export type VideoFilter = 'all' | 'completed' | 'busy' | 'awaiting_approval' | 'other'
export type VideoSort = 'newest' | 'oldest' | 'title'

/** Một trang kết quả của GET /api/jobs */
export interface MyVideosPage {
  items: MyVideo[]
  total: number
  page: number
  page_size: number
  has_more: boolean
  /** Số video theo từng nhóm trạng thái (đã áp dụng từ khóa tìm kiếm) */
  counts: Record<VideoFilter, number>
}

/** Người mẫu AI trong kho (bảng brand_avatars) */
export interface BrandAvatar {
  id: string
  name: string
  style: string
  height: string
  weight: string
  measurements: string
  avatar_url: string
  badge?: string | null
  gender?: 'female' | 'male'
  renders_count?: number
  is_default: number
}

export interface DashboardStats {
  total_renders: number
  completed_renders: number
  products_count?: number
  published_videos: number
  wallet_credits: number
  avg_render_time: string | null
  weekly_chart: { day: string; date: string; count: number; height: string }[]
}

/** Một dòng trong lịch sử credit */
export interface CreditTransaction {
  id: string
  amount_credits: number
  amount_vnd: number | null
  transaction_type: 'deposit' | 'usage' | 'refund' | 'adjust'
  description: string | null
  status: 'pending' | 'success' | 'cancelled'
  created_at: string
}

export interface SystemAuditTask {
  task: number
  name: string
  status: string
  module: string
  note?: string
}

export interface SystemAuditReport {
  status: string
  passed_tasks: number
  total_tasks: number
  accuracy_rate: string
  report: SystemAuditTask[]
}
