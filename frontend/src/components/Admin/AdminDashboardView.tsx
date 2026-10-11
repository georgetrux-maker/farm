import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchAdminStatsOverview, type AdminStatsOverview } from '../../services/api'
import { ADMIN_SECTIONS, type AdminSection } from '../../lib/navigation'
import { AuditLogTab } from './AuditLogTab'
import { AvatarManager } from './AvatarManager'
import { OverviewTab } from './OverviewTab'
import { PlansTab } from './PlansTab'
import { SettingsTab } from './SettingsTab'
import { TransactionsTab } from './TransactionsTab'
import { UsersTab } from './UsersTab'

interface AdminDashboardViewProps {
  section: AdminSection
  onSectionChange: (section: AdminSection) => void
  currentUserId: string
}

const SUBTITLES: Record<AdminSection, string> = {
  overview: 'Doanh thu, shop mới và video, so với kỳ trước. Mốc ngày/tháng theo giờ Việt Nam.',
  users: 'Tìm tài khoản, cộng/trừ credit, khóa tài khoản vi phạm.',
  transactions: 'Lệnh nạp credit và mua gói qua VietQR: duyệt tay khi khách chuyển sai nội dung, hủy lệnh không thanh toán.',
  plans: 'Giá, credit mỗi tháng và người mẫu riêng của 3 gói; giảm giá trả theo năm; các gói đã bán.',
  models: 'Kho người mẫu AI dùng chung cho mọi shop.',
  settings: 'API key, thanh toán, mạng xã hội, giá và thông tin hỗ trợ.',
  logs: 'Mọi thao tác quản trị và giao dịch tự động được ghi lại.',
}

/** Admin Panel: menu trái (máy tính) hoặc thanh tab cuộn ngang (điện thoại) chọn mục; App giữ mục trong #hash. */
export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ section, onSectionChange, currentUserId }) => {
  const [stats, setStats] = useState<AdminStatsOverview | null>(null)
  const [days, setDays] = useState(7)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStats = useCallback((range: number) => {
    setError(null)
    setRefreshing(true)
    fetchAdminStatsOverview(range)
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setRefreshing(false))
  }, [])

  useEffect(() => {
    const id = setTimeout(() => loadStats(days), 0)
    return () => clearTimeout(id)
  }, [loadStats, days])

  const pending = stats?.summary.pending_deposits ?? 0
  const current = ADMIN_SECTIONS.find((s) => s.id === section) ?? ADMIN_SECTIONS[0]

  return (
    <div className="flex-1 h-full overflow-y-auto text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6">
        {/* Điện thoại / máy tính bảng: chọn mục bằng thanh tab (máy tính đã có menu trái) */}
        <nav className="lg:hidden -mx-4 px-4 overflow-x-auto no-scrollbar" aria-label="Menu quản trị">
          <div className="flex gap-2 w-max">
            {ADMIN_SECTIONS.map((s) => {
              const Icon = s.icon
              return (
                <button
                  key={s.id}
                  onClick={() => onSectionChange(s.id)}
                  aria-current={section === s.id ? 'page' : undefined}
                  className="chip shrink-0"
                  aria-pressed={section === s.id}
                >
                  <Icon className="w-4 h-4" />
                  {s.label}
                  {s.id === 'transactions' && pending > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-[var(--accent-color)] text-[var(--on-accent)] text-[11px] leading-5 text-center">
                      {pending}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </nav>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="title text-2xl sm:text-3xl tracking-tight">{current.label}</h1>
            <p className="text-[var(--text-muted)] mt-2">{SUBTITLES[section]}</p>
          </div>
          {section === 'overview' && (
            <button onClick={() => loadStats(days)} disabled={refreshing} className="btn btn-ghost btn-sm" aria-label="Tải lại số liệu">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Làm mới
            </button>
          )}
        </div>

        {section === 'overview' &&
          (error && !stats ? (
            <p className="text-sm text-[var(--danger-text)]">
              {error}{' '}
              <button onClick={() => loadStats(days)} className="underline font-semibold">
                Thử lại
              </button>
            </p>
          ) : stats ? (
            <OverviewTab
              stats={stats}
              days={days}
              onDaysChange={setDays}
              refreshing={refreshing}
              onOpenTransactions={() => onSectionChange('transactions')}
              onOpenUsers={() => onSectionChange('users')}
            />
          ) : (
            <div className="skeleton h-96 rounded-3xl" />
          ))}
        {section === 'users' && <UsersTab currentUserId={currentUserId} />}
        {section === 'transactions' && <TransactionsTab onChanged={() => loadStats(days)} />}
        {section === 'plans' && <PlansTab />}
        {section === 'models' && <AvatarManager />}
        {section === 'settings' && <SettingsTab />}
        {section === 'logs' && <AuditLogTab />}
      </div>
    </div>
  )
}
