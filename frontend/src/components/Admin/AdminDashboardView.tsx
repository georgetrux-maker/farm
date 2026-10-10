import React, { useEffect, useState } from 'react'
import {
  DollarSign, Key, Loader2, RefreshCw, Save, Shield, Sparkles, Users, Wallet, Zap
} from 'lucide-react'
import {
  fetchAdminApiKeys, fetchAdminStatsOverview, saveAdminApiKeys, testAdminApiKey,
  verifyDepositManually, fetchAvatars, addAvatar, setDefaultAvatar,
  type AdminApiKeysConfig, type AdminStatsOverview, type BrandAvatar
} from '../../services/api'
import { formatNumber, formatVnd } from '../../lib/format'
import { useToast } from '../ui/toastContext'

export const AdminDashboardView: React.FC<{ onClose?: () => void }> = () => {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<'overview' | 'api' | 'avatars' | 'billing'>('overview')
  const [loading, setLoading] = useState(true)

  // Data states
  const [stats, setStats] = useState<AdminStatsOverview | null>(null)
  const [apiKeys, setApiKeys] = useState<AdminApiKeysConfig | null>(null)
  const [avatars, setAvatars] = useState<BrandAvatar[]>([])

  // Form states for API Keys
  const [formKeys, setFormKeys] = useState<Record<string, string>>({})
  const [savingKeys, setSavingKeys] = useState(false)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({})

  // Form state for Avatar
  const [newAvatarName, setNewAvatarName] = useState('')
  const [newAvatarUrl, setNewAvatarUrl] = useState('')
  const [addingAvatar, setAddingAvatar] = useState(false)

  const loadAll = async () => {
    setLoading(true)
    try {
      const [s, k, a] = await Promise.all([
        fetchAdminStatsOverview(),
        fetchAdminApiKeys(),
        fetchAvatars(),
      ])
      setStats(s)
      setApiKeys(k)
      setAvatars(a)

      // Initialize form values from config
      setFormKeys({
        anthropic_api_key: k.anthropic.is_configured ? k.anthropic.masked_key : '',
        anthropic_model: k.anthropic.model || 'claude-opus-5-5',
        fashn_api_key: k.fashn.is_configured ? k.fashn.masked_key : '',
        fashn_model_name: k.fashn.model_name || 'tryon-v1.6',
        fashn_mode: k.fashn.mode || 'balanced',
        replicate_api_token: k.replicate.is_configured ? k.replicate.masked_key : '',
        replicate_video_model: k.replicate.video_model || 'kwaivgi/kling-v3-video',
        vietqr_bank_id: k.vietqr.bank_id || 'MB',
        vietqr_account_no: k.vietqr.account_no || '',
        vietqr_account_name: k.vietqr.account_name || '',
        sepay_webhook_key: k.sepay.is_configured ? k.sepay.masked_key : '',
        tiktok_client_key: k.tiktok.client_key || '',
        facebook_app_id: k.facebook.app_id || '',
        pipeline_cost_credits: String(k.pricing.pipeline_cost_credits || 30),
        tryon_preview_cost_credits: String(k.pricing.tryon_preview_cost_credits || 5),
        signup_bonus_credits: String(k.pricing.signup_bonus_credits || 0),
      })
    } catch (e: any) {
      toast(e.message || 'Không tải được dữ liệu quản trị', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const handleSaveApiKeys = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingKeys(true)
    try {
      const res = await saveAdminApiKeys(formKeys)
      toast(res.message || 'Đã lưu cấu hình API thành công!', 'success')
      const updated = await fetchAdminApiKeys()
      setApiKeys(updated)
    } catch (err: any) {
      toast(err.message || 'Lỗi khi lưu cấu hình', 'error')
    } finally {
      setSavingKeys(false)
    }
  }

  const handleTestKey = async (provider: string) => {
    setTestingProvider(provider)
    try {
      const res = await testAdminApiKey(provider)
      setTestResults((prev) => ({ ...prev, [provider]: res }))
      toast(res.message, res.ok ? 'success' : 'error')
    } catch (err: any) {
      setTestResults((prev) => ({ ...prev, [provider]: { ok: false, message: err.message } }))
      toast(err.message, 'error')
    } finally {
      setTestingProvider(null)
    }
  }

  const handleManualVerify = async (txId: string) => {
    if (!confirm('Xác nhận đã nhận được tiền và cộng credit cho giao dịch này?')) return
    try {
      await verifyDepositManually(txId)
      toast('Đã xác nhận giao dịch thành công!', 'success')
      const s = await fetchAdminStatsOverview()
      setStats(s)
    } catch (err: any) {
      toast(err.message || 'Không thể xác nhận', 'error')
    }
  }

  const handleAddAvatar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAvatarName || !newAvatarUrl) return
    setAddingAvatar(true)
    try {
      await addAvatar({
        name: newAvatarName,
        style: 'Lookbook / Hiện đại',
        height: '168cm',
        weight: '49kg',
        measurements: '84-60-89',
        avatar_url: newAvatarUrl,
        badge: 'Tùy Chỉnh',
      })
      toast('Đã thêm người mẫu AI mới!', 'success')
      setNewAvatarName('')
      setNewAvatarUrl('')
      const a = await fetchAvatars()
      setAvatars(a)
    } catch (err: any) {
      toast(err.message || 'Lỗi thêm người mẫu', 'error')
    } finally {
      setAddingAvatar(false)
    }
  }

  const handleSetDefaultAvatar = async (id: string) => {
    try {
      await setDefaultAvatar(id)
      toast('Đã đổi người mẫu mặc định!', 'success')
      const a = await fetchAvatars()
      setAvatars(a)
    } catch (err: any) {
      toast(err.message || 'Lỗi đặt mặc định', 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
      </div>
    )
  }

  return (
    <div className="flex-1 h-full overflow-y-auto text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8 animate-fade-in">
        {/* Header Quản trị */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--ink)] text-[var(--on-ink)] text-xs font-semibold mb-2">
              <Shield className="w-3.5 h-3.5 text-[var(--gold)]" /> Trung tâm Quản trị Sàn
            </div>
            <h1 className="display text-3xl sm:text-4xl">Admin Control Panel</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Quản lý khóa API, hệ thống thanh toán VietQR, giám sát doanh thu và tài nguyên người mẫu.
            </p>
          </div>
          <button onClick={loadAll} className="btn btn-secondary self-start md:self-auto text-xs py-2 px-3">
            <RefreshCw className="w-3.5 h-3.5" /> Làm mới dữ liệu
          </button>
        </div>

        {/* Tab chuyển đổi */}
        <div className="flex border-b border-[var(--border-subtle)] gap-2 overflow-x-auto">
          {[
            { id: 'overview', label: 'Tổng quan & Doanh thu', icon: DollarSign },
            { id: 'api', label: 'Cài đặt API & Tích hợp', icon: Key },
            { id: 'avatars', label: 'Người mẫu AI', icon: Users },
            { id: 'billing', label: 'Lịch sử Nạp tiền', icon: Wallet },
          ].map((tab) => {
            const active = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-[var(--text-main)] text-[var(--text-main)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                <Icon className="w-4 h-4" /> {tab.label}
              </button>
            )
          })}
        </div>

        {/* TAB 1: TỔNG QUAN DOANH THU & NGƯỜI DÙNG */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-5">
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Doanh thu nạp tiền</span>
                <div className="display text-2xl sm:text-3xl font-bold mt-1 text-[var(--accent-text)]">
                  {formatVnd(stats.summary.total_revenue_vnd)}
                </div>
                <span className="text-xs text-[var(--text-muted)] mt-1 block">Từ SePay & Chuyển khoản</span>
              </div>
              <div className="card p-5">
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Tổng số shop / user</span>
                <div className="display text-2xl sm:text-3xl font-bold mt-1">{formatNumber(stats.summary.total_users)}</div>
                <span className="text-xs text-[var(--text-muted)] mt-1 block">Tài khoản đăng ký</span>
              </div>
              <div className="card p-5">
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Credit đang lưu hành</span>
                <div className="display text-2xl sm:text-3xl font-bold mt-1">{formatNumber(stats.summary.total_credits_in_circulation)}</div>
                <span className="text-xs text-[var(--text-muted)] mt-1 block">Số dư trong ví khách</span>
              </div>
              <div className="card p-5">
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase">Video đã hoàn thành</span>
                <div className="display text-2xl sm:text-3xl font-bold mt-1">{formatNumber(stats.summary.completed_jobs)}</div>
                <span className="text-xs text-[var(--text-muted)] mt-1 block">Tổng {stats.summary.total_jobs} lượt chạy</span>
              </div>
            </div>

            {/* Danh sách người dùng mới */}
            <div className="card p-5 sm:p-6">
              <h2 className="display text-lg font-bold mb-4">Danh sách thành viên gần nhất</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                      <th className="py-2.5 px-3">Tên</th>
                      <th className="py-2.5 px-3">Email</th>
                      <th className="py-2.5 px-3">Vai trò</th>
                      <th className="py-2.5 px-3">Số dư</th>
                      <th className="py-2.5 px-3">Ngày tạo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {stats.recent_users.map((u) => (
                      <tr key={u.id} className="hover:bg-[var(--bg-surface)]">
                        <td className="py-3 px-3 font-medium">{u.name}</td>
                        <td className="py-3 px-3 text-[var(--text-muted)]">{u.email}</td>
                        <td className="py-3 px-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            u.role === 'admin' ? 'bg-[var(--ink)] text-[var(--on-ink)]' : 'bg-[var(--bg-surface)]'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-semibold">{formatNumber(u.credits)} credit</td>
                        <td className="py-3 px-3 text-xs text-[var(--text-muted)]">{u.created_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CÀI ĐẶT API & TÍCH HỢP */}
        {activeTab === 'api' && apiKeys && (
          <form onSubmit={handleSaveApiKeys} className="space-y-6">
            <div className="card p-5 sm:p-6 space-y-6">
              <div className="border-b border-[var(--border-subtle)] pb-4">
                <h2 className="display text-xl font-bold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[var(--accent-text)]" /> Trí tuệ Nhân tạo (AI Providers)
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Khóa API được mã hóa an toàn bằng Fernet AES. Nhập khóa mới để ghi đè hoặc để trống nếu dùng từ file .env.
                </p>
              </div>

              {/* 1. Claude Anthropic */}
              <div className="space-y-3 bg-[var(--bg-surface)] p-4 rounded-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm">Anthropic Claude (Kịch bản & Phân tích ảnh)</span>
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      {apiKeys.anthropic.is_configured ? '🟢 Đã cấu hình' : '⚪ Chưa có key'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestKey('anthropic')}
                    disabled={testingProvider === 'anthropic'}
                    className="btn btn-secondary text-xs py-1.5 px-3"
                  >
                    {testingProvider === 'anthropic' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    Kiểm tra kết nối
                  </button>
                </div>
                {testResults['anthropic'] && (
                  <div className={`text-xs p-2 rounded-lg font-medium ${testResults['anthropic'].ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                    {testResults['anthropic'].message}
                  </div>
                )}
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="password"
                      className="field text-sm font-mono"
                      placeholder="sk-ant-api03-..."
                      value={formKeys.anthropic_api_key || ''}
                      onChange={(e) => setFormKeys({ ...formKeys, anthropic_api_key: e.target.value })}
                    />
                  </div>
                  <div>
                    <select
                      className="field text-sm"
                      value={formKeys.anthropic_model || 'claude-opus-5-5'}
                      onChange={(e) => setFormKeys({ ...formKeys, anthropic_model: e.target.value })}
                    >
                      <option value="claude-opus-5-5">claude-opus-5-5</option>
                      <option value="claude-sonnet-4-5">claude-sonnet-4-5</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. FASHN.ai */}
              <div className="space-y-3 bg-[var(--bg-surface)] p-4 rounded-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm">FASHN.ai (Thử đồ ảo Virtual Try-on)</span>
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      {apiKeys.fashn.is_configured ? '🟢 Đã cấu hình' : '⚪ Chưa có key'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestKey('fashn')}
                    disabled={testingProvider === 'fashn'}
                    className="btn btn-secondary text-xs py-1.5 px-3"
                  >
                    {testingProvider === 'fashn' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    Kiểm tra kết nối
                  </button>
                </div>
                {testResults['fashn'] && (
                  <div className={`text-xs p-2 rounded-lg font-medium ${testResults['fashn'].ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                    {testResults['fashn'].message}
                  </div>
                )}
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="password"
                      className="field text-sm font-mono"
                      placeholder="fa-..."
                      value={formKeys.fashn_api_key || ''}
                      onChange={(e) => setFormKeys({ ...formKeys, fashn_api_key: e.target.value })}
                    />
                  </div>
                  <div>
                    <select
                      className="field text-sm"
                      value={formKeys.fashn_mode || 'balanced'}
                      onChange={(e) => setFormKeys({ ...formKeys, fashn_mode: e.target.value })}
                    >
                      <option value="performance">performance (nhanh)</option>
                      <option value="balanced">balanced (cân bằng)</option>
                      <option value="quality">quality (nét cao)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 3. Replicate / Kling */}
              <div className="space-y-3 bg-[var(--bg-surface)] p-4 rounded-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm">Replicate / Kling (Tạo video chuyển động)</span>
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      {apiKeys.replicate.is_configured ? '🟢 Đã cấu hình' : '⚪ Chưa có token'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestKey('replicate')}
                    disabled={testingProvider === 'replicate'}
                    className="btn btn-secondary text-xs py-1.5 px-3"
                  >
                    {testingProvider === 'replicate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                    Kiểm tra kết nối
                  </button>
                </div>
                {testResults['replicate'] && (
                  <div className={`text-xs p-2 rounded-lg font-medium ${testResults['replicate'].ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                    {testResults['replicate'].message}
                  </div>
                )}
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="password"
                      className="field text-sm font-mono"
                      placeholder="r8_..."
                      value={formKeys.replicate_api_token || ''}
                      onChange={(e) => setFormKeys({ ...formKeys, replicate_api_token: e.target.value })}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      className="field text-sm font-mono"
                      placeholder="kwaivgi/kling-v3-video"
                      value={formKeys.replicate_video_model || 'kwaivgi/kling-v3-video'}
                      onChange={(e) => setFormKeys({ ...formKeys, replicate_video_model: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* CỔNG THANH TOÁN & VIETQR */}
            <div className="card p-5 sm:p-6 space-y-4">
              <h2 className="display text-xl font-bold flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[var(--accent-text)]" /> Ngân hàng VietQR & Webhook SePay
              </h2>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="field-label">Ngân hàng</label>
                  <select
                    className="field text-sm"
                    value={formKeys.vietqr_bank_id || 'MB'}
                    onChange={(e) => setFormKeys({ ...formKeys, vietqr_bank_id: e.target.value })}
                  >
                    <option value="MB">MB Bank</option>
                    <option value="VCB">Vietcombank</option>
                    <option value="TCB">Techcombank</option>
                    <option value="TPB">TPBank</option>
                    <option value="ACB">ACB</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Số tài khoản nhận tiền</label>
                  <input
                    type="text"
                    className="field text-sm"
                    placeholder="0987654321"
                    value={formKeys.vietqr_account_no || ''}
                    onChange={(e) => setFormKeys({ ...formKeys, vietqr_account_no: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Tên chủ tài khoản</label>
                  <input
                    type="text"
                    className="field text-sm"
                    placeholder="AURA FASHION AI"
                    value={formKeys.vietqr_account_name || ''}
                    onChange={(e) => setFormKeys({ ...formKeys, vietqr_account_name: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="field-label">SePay Webhook Key (Tự động cộng tiền khi chuyển khoản)</label>
                <div className="flex gap-3">
                  <input
                    type="password"
                    className="field text-sm font-mono flex-1"
                    placeholder="sp_live_..."
                    value={formKeys.sepay_webhook_key || ''}
                    onChange={(e) => setFormKeys({ ...formKeys, sepay_webhook_key: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => handleTestKey('sepay')}
                    disabled={testingProvider === 'sepay'}
                    className="btn btn-secondary text-xs px-3"
                  >
                    Kiểm tra
                  </button>
                </div>
                {testResults['sepay'] && (
                  <div className={`text-xs mt-2 p-2 rounded-lg font-medium ${testResults['sepay'].ok ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                    {testResults['sepay'].message}
                  </div>
                )}
              </div>
            </div>

            {/* CHÍNH SÁCH GIÁ & CREDIT */}
            <div className="card p-5 sm:p-6 space-y-4">
              <h2 className="display text-xl font-bold">Chính sách giá & Phí sàn</h2>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="field-label">Giá mỗi video (credit)</label>
                  <input
                    type="number"
                    className="field text-sm"
                    value={formKeys.pipeline_cost_credits || '30'}
                    onChange={(e) => setFormKeys({ ...formKeys, pipeline_cost_credits: e.target.value })}
                  />
                  <span className="text-xs text-[var(--text-muted)] mt-1 block">1 credit = 100đ</span>
                </div>
                <div>
                  <label className="field-label">Phí xem trước thử đồ</label>
                  <input
                    type="number"
                    className="field text-sm"
                    value={formKeys.tryon_preview_cost_credits || '5'}
                    onChange={(e) => setFormKeys({ ...formKeys, tryon_preview_cost_credits: e.target.value })}
                  />
                  <span className="text-xs text-[var(--text-muted)] mt-1 block">Không hoàn nếu từ chối</span>
                </div>
                <div>
                  <label className="field-label">Credit tặng khi đăng ký</label>
                  <input
                    type="number"
                    className="field text-sm"
                    value={formKeys.signup_bonus_credits || '0'}
                    onChange={(e) => setFormKeys({ ...formKeys, signup_bonus_credits: e.target.value })}
                  />
                  <span className="text-xs text-[var(--text-muted)] mt-1 block">Tặng tài khoản mới</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={savingKeys} className="btn btn-primary btn-lg flex items-center gap-2">
                {savingKeys ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Lưu cấu hình API
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: QUẢN LÝ NGƯỜI MẪU AI */}
        {activeTab === 'avatars' && (
          <div className="space-y-6">
            <div className="card p-5 sm:p-6">
              <h2 className="display text-xl font-bold mb-4">Thêm người mẫu AI mới</h2>
              <form onSubmit={handleAddAvatar} className="grid sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="field-label">Tên người mẫu</label>
                  <input
                    className="field text-sm"
                    placeholder="Ví dụ: Hạ Vy"
                    value={newAvatarName}
                    onChange={(e) => setNewAvatarName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Đường dẫn ảnh người mẫu</label>
                  <input
                    className="field text-sm"
                    placeholder="https://... hoặc /media/..."
                    value={newAvatarUrl}
                    onChange={(e) => setNewAvatarUrl(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={addingAvatar} className="btn btn-primary h-11">
                  {addingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Thêm người mẫu'}
                </button>
              </form>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {avatars.map((av) => (
                <div key={av.id} className="card p-3 flex flex-col items-center text-center space-y-2 relative">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-[var(--bg-surface)]">
                    <img src={av.avatar_url} alt={av.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="font-semibold text-sm">{av.name}</div>
                  {av.is_default ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--gold-soft)] text-[var(--gold)] font-semibold">
                      Mặc định
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSetDefaultAvatar(av.id)}
                      className="text-xs text-[var(--accent-text)] hover:underline mt-auto"
                    >
                      Đặt mặc định
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: LỊCH SỬ NẠP TIỀN & DUYỆT THỦ CÔNG */}
        {activeTab === 'billing' && stats && (
          <div className="card p-5 sm:p-6 space-y-4">
            <h2 className="display text-xl font-bold">Lịch sử giao dịch VietQR toàn sàn</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                    <th className="py-2.5 px-3">Khách hàng</th>
                    <th className="py-2.5 px-3">Số tiền</th>
                    <th className="py-2.5 px-3">Credit</th>
                    <th className="py-2.5 px-3">Trạng thái</th>
                    <th className="py-2.5 px-3">Thời gian</th>
                    <th className="py-2.5 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {stats.recent_transactions.map((tx) => {
                    const isPending = tx.status === 'pending'
                    return (
                      <tr key={tx.id} className="hover:bg-[var(--bg-surface)]">
                        <td className="py-3 px-3">
                          <div className="font-medium">{tx.user_name || tx.id}</div>
                          <div className="text-xs text-[var(--text-muted)]">{tx.user_email}</div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-[var(--ok-text)]">
                          {tx.amount_vnd ? formatVnd(tx.amount_vnd) : '---'}
                        </td>
                        <td className="py-3 px-3 font-semibold">+{formatNumber(tx.amount_credits)}</td>
                        <td className="py-3 px-3">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                            tx.status === 'success'
                              ? 'bg-[var(--ok-bg)] text-[var(--ok-text)]'
                              : 'bg-[var(--warn-bg)] text-[var(--warn-text)]'
                          }`}>
                            {tx.status === 'success' ? 'Thành công' : 'Đang chờ'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs text-[var(--text-muted)]">{tx.created_at}</td>
                        <td className="py-3 px-3 text-right">
                          {isPending && (
                            <button
                              onClick={() => handleManualVerify(tx.id)}
                              className="btn btn-secondary text-xs py-1 px-2.5"
                            >
                              Duyệt tay
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
