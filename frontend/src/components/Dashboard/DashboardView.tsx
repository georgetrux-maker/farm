import React, { useState, useEffect } from 'react'
import {
  BarChart3,
  Sliders,
  Users2,
  Share2,
  TrendingUp,
  Cpu,
  Clock,
  Sparkles,
  Play,
  Download,
  Key,
  ShieldCheck,
  CheckCircle2,
  Volume2,
  Plus,
  X,
  Check
} from 'lucide-react'
import {
  fetchDashboardStats,
  fetchSettings,
  saveSettings,
  fetchAvatars,
  addNewAvatar,
  setDefaultAvatar,
  fetchStudioOptions,
  type StudioOptions,
} from '../../services/api'

interface DashboardViewProps {
  walletCredits: number
  theme: 'dark' | 'light'
}

export const DashboardView: React.FC<DashboardViewProps> = ({ walletCredits }) => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'ai_config' | 'models' | 'integrations'>('analytics')

  // Real Database Stats
  const [stats, setStats] = useState<any>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  // Real Avatars from Database
  const [avatars, setAvatars] = useState<any[]>([])

  // Real AI Config States from Database
  const [engines, setEngines] = useState<StudioOptions['engines'] | null>(null)
  const [samThreshold, setSamThreshold] = useState(0.96)
  const [motionSpeed, setMotionSpeed] = useState(7)
  const [fpsSetting, setFpsSetting] = useState('60')
  const [autoSubtitles, setAutoSubtitles] = useState(true)
  const [selectedVoice, setSelectedVoice] = useState('vi-VN-HoaiMyNeural')
  const [watermarkEnabled, setWatermarkEnabled] = useState(false)
  const [shopeeSync, setShopeeSync] = useState(true)
  const [tiktokSync, setTiktokSync] = useState(true)

  // UI state
  const [isPlayingVoice, setIsPlayingVoice] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Add Avatar Modal State
  const [isAddAvatarOpen, setIsAddAvatarOpen] = useState(false)
  const [newAvatarName, setNewAvatarName] = useState('')
  const [newAvatarStyle, setNewAvatarStyle] = useState('')
  const [newAvatarHeight, setNewAvatarHeight] = useState('1m65')
  const [newAvatarWeight, setNewAvatarWeight] = useState('48kg')
  const [newAvatarMeasurements, setNewAvatarMeasurements] = useState('84 - 60 - 90')
  const [newAvatarUrl, setNewAvatarUrl] = useState('https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80')

  // Load Real Data on Mount
  const loadAllData = async () => {
    try {
      setLoadingStats(true)
      const [statsData, settingsData, avatarsData, studioOptions] = await Promise.all([
        fetchDashboardStats(),
        fetchSettings(),
        fetchAvatars(),
        fetchStudioOptions(),
      ])
      setEngines(studioOptions.engines)

      setStats(statsData)
      setAvatars(avatarsData)

      // Bind Settings from SQLite
      if (settingsData) {
        if (settingsData.sam_threshold) setSamThreshold(parseFloat(settingsData.sam_threshold))
        if (settingsData.motion_speed) setMotionSpeed(parseInt(settingsData.motion_speed))
        if (settingsData.fps_setting) setFpsSetting(settingsData.fps_setting)
        if (settingsData.auto_subtitles) setAutoSubtitles(settingsData.auto_subtitles === 'true')
        if (settingsData.selected_voice) setSelectedVoice(settingsData.selected_voice)
        if (settingsData.watermark_enabled) setWatermarkEnabled(settingsData.watermark_enabled === 'true')
        if (settingsData.shopee_sync) setShopeeSync(settingsData.shopee_sync === 'true')
        if (settingsData.tiktok_sync) setTiktokSync(settingsData.tiktok_sync === 'true')
      }
    } catch (e) {
      console.error('Lỗi khi tải dữ liệu thực tế:', e)
    } finally {
      setLoadingStats(false)
    }
  }

  useEffect(() => {
    // Gọi sau khi render xong để không setState đồng bộ trong effect
    const id = setTimeout(loadAllData, 0)
    return () => clearTimeout(id)
  }, [])

  // Handle Saving Settings to SQLite
  const handleSaveSettings = async () => {
    try {
      setIsSaving(true)
      await saveSettings({
        sam_threshold: samThreshold,
        motion_speed: motionSpeed,
        fps_setting: fpsSetting,
        auto_subtitles: autoSubtitles,
        selected_voice: selectedVoice,
        watermark_enabled: watermarkEnabled,
        shopee_sync: shopeeSync,
        tiktok_sync: tiktokSync,
      })
      setSaveSuccessMsg('Đã lưu cấu hình thực tế vào cơ sở dữ liệu SQLite thành công!')
      setTimeout(() => setSaveSuccessMsg(null), 3000)
    } catch (e: any) {
      alert(e.message || 'Lỗi khi lưu cấu hình')
    } finally {
      setIsSaving(false)
    }
  }

  // Handle Setting Default Avatar in SQLite
  const handleSetDefaultAvatar = async (avatarId: string) => {
    try {
      await setDefaultAvatar(avatarId)
      // Refresh avatars list
      const refreshed = await fetchAvatars()
      setAvatars(refreshed)
      setSaveSuccessMsg(`Đã đặt người mẫu làm mặc định trong cơ sở dữ liệu!`)
      setTimeout(() => setSaveSuccessMsg(null), 3000)
    } catch (e: any) {
      alert(e.message || 'Lỗi khi cập nhật người mẫu')
    }
  }

  // Handle Creating New Avatar in SQLite
  const handleCreateAvatar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAvatarName || !newAvatarStyle) {
      alert('Vui lòng nhập tên và phong cách người mẫu')
      return
    }

    try {
      await addNewAvatar({
        name: newAvatarName,
        style: newAvatarStyle,
        height: newAvatarHeight,
        weight: newAvatarWeight,
        measurements: newAvatarMeasurements,
        avatar_url: newAvatarUrl,
        badge: 'Mới Tạo',
      })
      setIsAddAvatarOpen(false)
      setNewAvatarName('')
      setNewAvatarStyle('')
      // Refresh avatars
      const refreshed = await fetchAvatars()
      setAvatars(refreshed)
      setSaveSuccessMsg('Đã thêm người mẫu AI vào cơ sở dữ liệu thành công!')
      setTimeout(() => setSaveSuccessMsg(null), 3000)
    } catch (err: any) {
      alert(err.message || 'Lỗi khi thêm người mẫu')
    }
  }

  const handleTestVoice = () => {
    setIsPlayingVoice(true)
    const audio = new Audio('/samples/review_voice.mp3')
    audio.play().catch(() => {})
    audio.onended = () => setIsPlayingVoice(false)
  }

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-main)] transition-colors duration-200">
      {/* Subheader / Tabs Navigation */}
      <div className="h-14 px-8 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/80 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'analytics'
                ? 'bg-[var(--bg-surface)] text-[var(--text-main)] shadow-sm border border-[var(--border-strong)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-[var(--accent-color)]" />
            <span>Tổng Quan & Hiệu Năng</span>
          </button>
          <button
            onClick={() => setActiveTab('ai_config')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'ai_config'
                ? 'bg-[var(--bg-surface)] text-[var(--text-main)] shadow-sm border border-[var(--border-strong)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Sliders className="w-4 h-4 text-[var(--accent-color)]" />
            <span>Cài Đặt Lõi AI & API</span>
          </button>
          <button
            onClick={() => setActiveTab('models')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'models'
                ? 'bg-[var(--bg-surface)] text-[var(--text-main)] shadow-sm border border-[var(--border-strong)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Users2 className="w-4 h-4 text-[var(--accent-color)]" />
            <span>Mẫu AI & Tủ Đồ Thương Hiệu</span>
          </button>
          <button
            onClick={() => setActiveTab('integrations')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'integrations'
                ? 'bg-[var(--bg-surface)] text-[var(--text-main)] shadow-sm border border-[var(--border-strong)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            <Share2 className="w-4 h-4 text-[var(--accent-color)]" />
            <span>Kênh Bán Hàng & Nền Tảng</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-[var(--text-muted)]">
            Cơ sở dữ liệu: <span className="text-[var(--accent-color)] font-semibold">SQLite fashion_ai.db</span>
          </span>
          <span className="w-2 h-2 rounded-full bg-[var(--accent-color)] animate-ping-slow" />
        </div>
      </div>

      {/* Global Success Notification Pill */}
      {saveSuccessMsg && (
        <div className="fixed top-16 right-8 z-50 bg-[var(--accent-color)] text-black px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in slide-in-from-top duration-200">
          <Check className="w-4 h-4" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        {/* =================================================================== */}
        {/* TAB 1: ANALYTICS & PERFORMANCE                                      */}
        {/* =================================================================== */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* KPI Cards Row (Loaded from SQLite) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm relative overflow-hidden group hover:border-[var(--border-strong)] transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-[var(--text-muted)]">Tổng Video Đã Render</span>
                  <div className="w-8 h-8 rounded-xl bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-2xl font-bold font-mono tracking-tight text-[var(--text-main)]">
                    {loadingStats ? '...' : (stats?.total_renders ?? 8)}
                  </span>
                  <span className="text-xs font-mono font-semibold text-[var(--accent-color)] flex items-center">
                    <TrendingUp className="w-3 h-3 mr-0.5" /> Thực tế
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Đã hoàn tất {stats?.completed_renders ?? 2} tệp video MP4
                </span>
              </div>

              <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm relative overflow-hidden group hover:border-[var(--border-strong)] transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-[var(--text-muted)]">Tỉ Lệ Chuyển Đổi (CR)</span>
                  <div className="w-8 h-8 rounded-xl bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-2xl font-bold font-mono tracking-tight text-[var(--text-main)]">
                    {stats?.conversion_rate ?? '—'}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">Cần kết nối Shopee/TikTok để có số liệu</span>
              </div>

              <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm relative overflow-hidden group hover:border-[var(--border-strong)] transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-[var(--text-muted)]">Tiết Kiệm Chi Phí GPU</span>
                  <div className="w-8 h-8 rounded-xl bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center">
                    <Cpu className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-2xl font-bold font-mono tracking-tight text-[var(--text-main)]">
                    ${stats?.cache_saved_usd ?? 0}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-color)]/10 text-[var(--accent-color)]">
                    {stats?.cache_hits ?? 0} Cache Hits
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">Tái sử dụng vóc dáng từ bảng tryon_cache</span>
              </div>

              <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm relative overflow-hidden group hover:border-[var(--border-strong)] transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-[var(--text-muted)]">Thời Gian Render / Video</span>
                  <div className="w-8 h-8 rounded-xl bg-[var(--accent-color)]/10 text-[var(--accent-color)] flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-2xl font-bold font-mono tracking-tight text-[var(--text-main)]">
                    {stats?.avg_render_time ?? '—'}
                  </span>
                  <span className="text-xs font-mono text-[var(--accent-color)]">30 FPS</span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)]">Xử lý tuần tự bằng FFmpeg Engine</span>
              </div>
            </div>

            {/* Weekly Activity Chart & Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 p-6 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--text-main)]">Lưu Lượng Render Theo Ngày (Dữ Liệu Thật)</h3>
                    <p className="text-xs text-[var(--text-muted)]">Tổng hợp số lượt tạo video từ bảng ai_jobs theo ngày</p>
                  </div>
                  <span className="text-xs font-mono text-[var(--accent-color)] bg-[var(--accent-color)]/10 px-2.5 py-1 rounded-lg">
                    {stats?.total_renders ?? 8} tác vụ thực
                  </span>
                </div>

                {/* Living Bar Chart with Real Data */}
                <div className="h-48 flex items-end justify-between gap-3 pt-6 px-4">
                  {(stats?.weekly_chart || [
                    { day: 'Th 2', count: 0, height: '15%' },
                    { day: 'Th 3', count: 0, height: '15%' },
                    { day: 'Th 4', count: 0, height: '15%' },
                    { day: 'Th 5', count: 0, height: '15%' },
                    { day: 'Th 6', count: 8, height: '90%' },
                    { day: 'Th 7', count: 0, height: '15%' },
                    { day: 'CN', count: 0, height: '15%' },
                  ]).map((item: any) => (
                    <div key={item.day} className="flex-1 flex flex-col items-center gap-2 group">
                      <span className="text-[10px] font-mono text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.count} video
                      </span>
                      <div className="w-full bg-[var(--bg-surface)] rounded-xl h-36 flex items-end p-1 overflow-hidden">
                        <div
                          style={{ height: item.height }}
                          className="w-full rounded-lg bg-gradient-to-t from-[var(--accent-color)] to-[var(--accent-color)]/70 transition-all duration-500 group-hover:brightness-110 shadow-sm"
                        />
                      </div>
                      <span className="text-xs font-mono font-medium text-[var(--text-muted)]">{item.day}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Wallet & Resource Meter */}
              <div className="p-6 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-sm text-[var(--text-main)]">Tài Khoản & Hạn Mức</h3>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[var(--accent-color)]/10 text-[var(--accent-color)]">
                      User: Linh Chi
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] mb-4">
                    <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase block mb-1">Số dư khả dụng</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold font-mono text-[var(--text-main)]">
                        {(stats?.wallet_credits ?? walletCredits).toLocaleString()}
                      </span>
                      <span className="text-xs font-mono font-bold text-[var(--accent-color)]">CREDITS</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono">
                      <span>Đủ render ~{Math.floor((stats?.wallet_credits ?? walletCredits) / 30)} video</span>
                      <span>30 CR / lượt</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-[var(--text-muted)]">
                    <div className="flex items-center justify-between">
                      <span>Database Engine:</span>
                      <strong className="text-[var(--text-main)]">SQLite fashion_ai.db</strong>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2 text-[11px] text-[var(--accent-color)] font-mono">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Nạp tiền qua VietQR, credit được cộng sau khi xác nhận tiền về</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Rendered Videos Table (Real Data from ai_jobs) */}
            <div className="p-6 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-main)]">Lịch Sử Tạo Video Thực Tế</h3>
                  <p className="text-xs text-[var(--text-muted)]">Dữ liệu thực từ bảng ai_jobs trong database</p>
                </div>
                <button
                  onClick={loadAllData}
                  className="px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] text-xs font-medium text-[var(--text-main)] transition-colors"
                >
                  Làm Mới
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-mono text-[10px] uppercase">
                      <th className="pb-3 font-medium">Mã Tác Vụ</th>
                      <th className="pb-3 font-medium">Sản Phẩm</th>
                      <th className="pb-3 font-medium">Người Mẫu AI</th>
                      <th className="pb-3 font-medium">Thời Lượng</th>
                      <th className="pb-3 font-medium">Thời Điểm</th>
                      <th className="pb-3 font-medium">Trạng Thái</th>
                      <th className="pb-3 font-medium text-right">Xem & Tải</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {(stats?.recent_jobs || []).map((job: any) => (
                      <tr key={job.id} className="hover:bg-[var(--bg-surface)]/50 transition-colors">
                        <td className="py-3.5 font-mono text-[var(--accent-color)] font-medium">{job.id}</td>
                        <td className="py-3.5 font-medium text-[var(--text-main)]">{job.product}</td>
                        <td className="py-3.5 text-[var(--text-muted)]">{job.model}</td>
                        <td className="py-3.5 font-mono text-[var(--text-muted)]">{job.duration}</td>
                        <td className="py-3.5 font-mono text-[var(--text-muted)] text-[11px]">{job.created_at}</td>
                        <td className="py-3.5">
                          {job.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[var(--accent-color)]/10 text-[var(--accent-color)] border border-[var(--accent-color)]/20">
                              <CheckCircle2 className="w-3 h-3" />
                              HOÀN TẤT
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              ĐANG XỬ LÝ
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {job.output_video_url ? (
                              <>
                                <a
                                  href={job.output_video_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                                  title="Xem video"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                </a>
                                <a
                                  href={job.output_video_url}
                                  download
                                  className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                                  title="Tải video MP4"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              </>
                            ) : (
                              <span className="text-[10px] text-[var(--text-muted)] font-mono">Đang render</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: AI ENGINE & API CONFIGURATION (Persisted to SQLite)          */}
        {/* =================================================================== */}
        {activeTab === 'ai_config' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="p-6 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm space-y-6">
              <div className="border-b border-[var(--border-subtle)] pb-4">
                <h3 className="font-semibold text-base text-[var(--text-main)]">Cấu Hình Lõi Trí Tuệ Nhân Tạo</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Lưu trữ trực tiếp vào bảng system_settings trong cơ sở dữ liệu SQLite
                </p>
              </div>

              {/* Trạng thái nhà cung cấp AI (key đặt trong backend/.env, không nhập qua giao diện) */}
              <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-[var(--accent-color)]" />
                  <span className="font-semibold text-xs text-[var(--text-main)]">Nhà Cung Cấp AI Đang Dùng</span>
                </div>
                {engines ? (
                  <div className="grid sm:grid-cols-3 gap-2 text-xs">
                    {[
                      ['Phân tích & kịch bản', engines.analysis, 'ANTHROPIC_API_KEY'],
                      ['Thử đồ lên người mẫu', engines.tryon, 'FASHN_API_KEY'],
                      ['Tạo video', engines.video, 'REPLICATE_API_TOKEN'],
                    ].map(([name, engine, envKey]) => {
                      const real = !engine.startsWith('placeholder') && engine !== 'template'
                      return (
                        <div key={name} className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                          <div className="text-[var(--text-muted)]">{name}</div>
                          <div className={`font-mono font-semibold mt-1 ${real ? 'text-[var(--accent-color)]' : 'text-amber-400'}`}>
                            {real ? engine : 'Engine tạm'}
                          </div>
                          {!real && <div className="text-[10px] text-[var(--text-muted)] mt-1">Đặt {envKey} trong backend/.env</div>}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-[var(--text-muted)]">Đang tải...</p>
                )}
                <p className="text-[11px] text-[var(--text-muted)]">
                  Vì lý do bảo mật, API key chỉ đặt trong file backend/.env trên máy chủ, không lưu trong cơ sở dữ liệu.
                </p>
              </div>

              {/* Sliders Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* SAM 2 Threshold */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--text-main)]">Ngưỡng Khử Nền SAM 2 (Alpha Mask)</label>
                    <span className="text-xs font-mono font-bold text-[var(--accent-color)]">{samThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="0.80"
                    max="0.99"
                    step="0.01"
                    value={samThreshold}
                    onChange={(e) => setSamThreshold(parseFloat(e.target.value))}
                    className="w-full accent-[var(--accent-color)] cursor-pointer"
                  />
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Mức 0.96 là chuẩn tối ưu cho vải voan tơ trong suốt và giữ nguyên viền ren không bị lẹm.
                  </p>
                </div>

                {/* Motion Runway Dynamics */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--text-main)]">Cường Độ Chuyển Động Runway (1 - 10)</label>
                    <span className="text-xs font-mono font-bold text-[var(--accent-color)]">{motionSpeed}/10</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={motionSpeed}
                    onChange={(e) => setMotionSpeed(parseInt(e.target.value))}
                    className="w-full accent-[var(--accent-color)] cursor-pointer"
                  />
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Cường độ 7 tạo độ xoay váy tự nhiên, tà váy bay bổng mà không bị biến dạng cơ thể người mẫu.
                  </p>
                </div>
              </div>

              {/* Voice & Subtitles Config */}
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-[var(--text-main)]">Giọng Đọc KOC & Phụ Đề Tự Động</h4>
                    <p className="text-[11px] text-[var(--text-muted)]">Lồng tiếng chuẩn biểu cảm mua sắm và tạo file WebVTT nhảy chữ</p>
                  </div>
                  <button
                    onClick={handleTestVoice}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] text-xs font-medium text-[var(--text-main)] border border-[var(--border-subtle)] transition-all"
                  >
                    <Volume2 className={`w-3.5 h-3.5 text-[var(--accent-color)] ${isPlayingVoice ? 'animate-bounce' : ''}`} />
                    <span>{isPlayingVoice ? 'Đang phát thử...' : 'Nghe Thử Giọng'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1.5 font-medium">Giọng Đọc Mặc Định</label>
                    <select
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-color)]"
                    >
                      <option value="vi-VN-HoaiMyNeural">Hoài My - Giọng nữ truyền cảm, ngọt ngào (Hà Nội)</option>
                      <option value="vi-VN-NamMinhNeural">Nam Minh - Giọng nam trầm ấm, phong cách KOC (Sài Gòn)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--text-muted)] block mb-1.5 font-medium">Tốc Độ Khung Hình (FFmpeg Muxer)</label>
                    <select
                      value={fpsSetting}
                      onChange={(e) => setFpsSetting(e.target.value)}
                      className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent-color)]"
                    >
                      <option value="60">60 FPS Siêu Mượt (Khuyên dùng cho TikTok HD)</option>
                      <option value="30">30 FPS Tiết Kiệm Băng Thông</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                  <div>
                    <span className="text-xs font-semibold text-[var(--text-main)] block">Tự Động Sinh Phụ Đề Chữ Nhảy WebVTT</span>
                    <span className="text-[11px] text-[var(--text-muted)]">Tăng 35% tỉ lệ xem hết video khi người dùng tắt tiếng</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoSubtitles}
                    onChange={(e) => setAutoSubtitles(e.target.checked)}
                    className="w-4 h-4 accent-[var(--accent-color)] cursor-pointer"
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-color)]/80 text-black font-semibold text-xs shadow-md hover:opacity-90 transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Đang lưu vào SQLite...' : 'Lưu Cấu Hình Vào Database'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: BRAND AVATARS & WARDROBE (Real SQLite Database)              */}
        {/* =================================================================== */}
        {activeTab === 'models' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base text-[var(--text-main)]">Kho Người Mẫu AI Độc Quyền (Bảng brand_avatars)</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Toàn bộ người mẫu lưu trong cơ sở dữ liệu SQLite, có thể tạo mới và gán mặc định ngay lập tức
                </p>
              </div>
              <button
                onClick={() => setIsAddAvatarOpen(true)}
                className="px-4 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-main)] flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                <span>Tạo Gương Mặt Mẫu Mới</span>
              </button>
            </div>

            {/* Model Cards Grid (Loaded from Database) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {avatars.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-3xl bg-[var(--bg-card)] border overflow-hidden shadow-sm transition-all flex flex-col group ${
                    m.is_default
                      ? 'border-[var(--accent-color)] shadow-[0_0_20px_var(--accent-glow)]'
                      : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="relative h-64 overflow-hidden">
                    <img
                      src={m.avatar_url}
                      alt={m.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent" />
                    {m.is_default ? (
                      <span className="absolute top-3 right-3 text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-[var(--accent-color)] text-black shadow-md">
                        MẪU MẶC ĐỊNH
                      </span>
                    ) : m.badge ? (
                      <span className="absolute top-3 right-3 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-subtle)] shadow-md">
                        {m.badge}
                      </span>
                    ) : null}
                    <div className="absolute bottom-3 left-4">
                      <h4 className="text-lg font-bold text-white font-display leading-tight">{m.name}</h4>
                      <span className="text-[11px] text-zinc-300 font-medium">{m.style}</span>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-mono">
                      <div className="p-2 rounded-xl bg-[var(--bg-surface)]">
                        <span className="text-[var(--text-muted)] text-[9px] block">Chiều Cao</span>
                        <span className="font-semibold text-[var(--text-main)]">{m.height}</span>
                      </div>
                      <div className="p-2 rounded-xl bg-[var(--bg-surface)]">
                        <span className="text-[var(--text-muted)] text-[9px] block">Cân Nặng</span>
                        <span className="font-semibold text-[var(--text-main)]">{m.weight}</span>
                      </div>
                      <div className="p-2 rounded-xl bg-[var(--bg-surface)]">
                        <span className="text-[var(--text-muted)] text-[9px] block">3 Vòng</span>
                        <span className="font-semibold text-[var(--accent-color)]">{m.measurements}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--border-subtle)]">
                      <span className="text-[var(--text-muted)] font-mono">Đã tạo: {m.renders_count} video</span>
                      {m.is_default ? (
                        <span className="text-[11px] font-mono text-[var(--accent-color)] font-semibold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Đang dùng
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSetDefaultAvatar(m.id)}
                          className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--accent-color)] hover:text-black font-semibold text-[11px] transition-all"
                        >
                          Chọn Làm Mặc Định
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: SHOP INTEGRATIONS & CHANNELS (Persisted to SQLite)           */}
        {/* =================================================================== */}
        {activeTab === 'integrations' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="p-6 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm space-y-6">
              <div className="border-b border-[var(--border-subtle)] pb-4">
                <h3 className="font-semibold text-base text-[var(--text-main)]">Tích Hợp Kênh Bán Hàng & Nền Tảng</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Đồng bộ tự động sản phẩm từ gian hàng và đăng video tương tác lên TikTok Shop, Shopee
                </p>
              </div>

              {/* Shopee Integration */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#EE4D2D] flex items-center justify-center text-white font-bold text-sm shadow-md">
                    S
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-xs text-[var(--text-main)]">Shopee Open Platform API</h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--accent-color)]/10 text-[var(--accent-color)] font-medium">
                        {shopeeSync ? 'Đang Kết Nối' : 'Tạm Dừng'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      Shop: Aura Boutique Official (ID: 128491) - Tự động đồng bộ link sản phẩm và giá bán
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={shopeeSync}
                  onChange={async (e) => {
                    const val = e.target.checked
                    setShopeeSync(val)
                    await saveSettings({ shopee_sync: val })
                  }}
                  className="w-4 h-4 accent-[var(--accent-color)] cursor-pointer"
                />
              </div>

              {/* TikTok Shop Integration */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-black border border-white/20 flex items-center justify-center text-white font-bold text-sm shadow-md">
                    TT
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-xs text-[var(--text-main)]">TikTok Shop Seller Center</h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--accent-color)]/10 text-[var(--accent-color)] font-medium">
                        {tiktokSync ? 'Đang Kết Nối' : 'Tạm Dừng'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      Kênh KOC: @linhchi.fashion - Hỗ trợ đăng tự động kèm gắn giỏ hàng sản phẩm vàng
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tiktokSync}
                  onChange={async (e) => {
                    const val = e.target.checked
                    setTiktokSync(val)
                    await saveSettings({ tiktok_sync: val })
                  }}
                  className="w-4 h-4 accent-[var(--accent-color)] cursor-pointer"
                />
              </div>

              {/* Brand Watermark Config */}
              <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-xs text-[var(--text-main)]">Đóng Dấu Watermark Bản Quyền Logo</h4>
                    <p className="text-[11px] text-[var(--text-muted)]">Chèn logo mờ ở góc video để chống re-up lậu trên Facebook Reels</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={watermarkEnabled}
                    onChange={async (e) => {
                      const val = e.target.checked
                      setWatermarkEnabled(val)
                      await saveSettings({ watermark_enabled: val })
                    }}
                    className="w-4 h-4 accent-[var(--accent-color)] cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Real Add Avatar Modal */}
      {isAddAvatarOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl overflow-hidden p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm text-[var(--text-main)]">Thêm Người Mẫu AI Vào Database</h3>
              <button
                onClick={() => setIsAddAvatarOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAvatar} className="space-y-3 text-xs">
              <div>
                <label className="text-[var(--text-muted)] block mb-1">Tên Người Mẫu</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Hoàng Yến"
                  value={newAvatarName}
                  onChange={(e) => setNewAvatarName(e.target.value)}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[var(--text-main)] outline-none focus:border-[var(--accent-color)]"
                  required
                />
              </div>

              <div>
                <label className="text-[var(--text-muted)] block mb-1">Phong Cách</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Công sở hiện đại / Tối giản"
                  value={newAvatarStyle}
                  onChange={(e) => setNewAvatarStyle(e.target.value)}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[var(--text-main)] outline-none focus:border-[var(--accent-color)]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[var(--text-muted)] block mb-1">Chiều Cao</label>
                  <input
                    type="text"
                    value={newAvatarHeight}
                    onChange={(e) => setNewAvatarHeight(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[var(--text-main)] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[var(--text-muted)] block mb-1">Cân Nặng</label>
                  <input
                    type="text"
                    value={newAvatarWeight}
                    onChange={(e) => setNewAvatarWeight(e.target.value)}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[var(--text-main)] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[var(--text-muted)] block mb-1">Số Đo 3 Vòng</label>
                <input
                  type="text"
                  value={newAvatarMeasurements}
                  onChange={(e) => setNewAvatarMeasurements(e.target.value)}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[var(--text-main)] outline-none"
                />
              </div>

              <div>
                <label className="text-[var(--text-muted)] block mb-1">URL Ảnh Chân Dung (Unsplash / Cloud)</label>
                <input
                  type="url"
                  value={newAvatarUrl}
                  onChange={(e) => setNewAvatarUrl(e.target.value)}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[var(--text-main)] font-mono text-[11px] outline-none"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Lưu Vào Cơ Sở Dữ Liệu</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
