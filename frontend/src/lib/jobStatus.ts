export type StatusTone = 'ok' | 'warn' | 'danger' | 'muted' | 'busy' | 'accent'
type StatusMap = Record<string, { label: string; tone: StatusTone }>

export const JOB_STATUS: StatusMap = {
  queued: { label: 'Đang chờ', tone: 'busy' },
  pending: { label: 'Đang chờ', tone: 'busy' },
  processing: { label: 'Đang tạo', tone: 'busy' },
  awaiting_approval: { label: 'Chờ bạn duyệt', tone: 'accent' },
  completed: { label: 'Hoàn tất', tone: 'ok' },
  failed: { label: 'Lỗi', tone: 'danger' },
  rejected: { label: 'Đã hủy', tone: 'muted' },
}

export const PUBLICATION_STATUS: StatusMap = {
  pending: { label: 'Đang chờ', tone: 'busy' },
  processing: { label: 'Đang đăng', tone: 'busy' },
  published: { label: 'Đã đăng', tone: 'ok' },
  failed: { label: 'Thất bại', tone: 'danger' },
}

/** Job còn đang chạy (cần hỏi lại tiến độ) */
export function isJobBusy(status: string): boolean {
  return status === 'queued' || status === 'pending' || status === 'processing'
}
