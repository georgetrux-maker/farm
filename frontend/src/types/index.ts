export interface PipelineNode {
  id: string
  title: string
  tag: string
  type: string
  x: number
  y: number
  status: 'idle' | 'running' | 'completed' | 'error'
  metrics: { [key: string]: string | number }
  description: string
  config: { [key: string]: any }
}

export interface CableConnection {
  from: string
  to: string
}

export interface BodyProfile {
  id: string
  label: string
  description: string
  height: number
  weight: number
  bust: number
  waist: number
  hips: number
  bodyShape: string
  modelImg: string
  tryonImg: string
}

export interface ProductHotspot {
  id: string
  x: number
  y: number
  label: string
  detail: string
  price: string
}

export interface AIJob {
  job_id: string
  user_id: string
  product_id: string
  status: 'queued' | 'pending' | 'processing' | 'awaiting_approval' | 'completed' | 'failed' | 'rejected'
  progress: number
  current_step: string
  output_video_url?: string
  output_image_url?: string
  error_message?: string | null
  refunded?: boolean
  script?: {
    engine: string
    warning?: string | null
    post_caption?: string
    full_script: string
    hashtags: string[]
    tts_warning?: string | null
    motion_engine?: string
  } | null
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
