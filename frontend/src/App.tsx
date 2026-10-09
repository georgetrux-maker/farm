import { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { NodeCanvas } from './components/Studio/NodeCanvas'
import { NodeInspector } from './components/Studio/NodeInspector'
import { StudioControls } from './components/Studio/StudioControls'
import { ShoppableFeed } from './components/TryOn/ShoppableFeed'
import { TryOnModal } from './components/TryOn/TryOnModal'
import { QuickCheckoutDrawer } from './components/TryOn/QuickCheckoutDrawer'
import { VietQRModal } from './components/Wallet/VietQRModal'
import { AuditModal } from './components/SystemAudit/AuditModal'
import { DashboardView } from './components/Dashboard/DashboardView'
import { CreateVideoView } from './components/Create/CreateVideoView'
import type { PipelineNode } from './types'
import { triggerPipelineRun, fetchJobStatus, fetchProfile, logout, UnauthorizedError, type UserProfile } from './services/api'
import { LoginView } from './components/Auth/LoginView'

const DEMO_PRODUCT_ID = 'prod_dam_voan_to'

export default function App() {
  const [activeView, setActiveView] = useState<'create' | 'split' | 'studio' | 'tryon' | 'dashboard'>('create')
  const [walletCredits, setWalletCredits] = useState<number>(0)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [authState, setAuthState] = useState<'loading' | 'in' | 'out'>('loading')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const handleLoggedIn = (u: UserProfile) => {
    setUser(u)
    setWalletCredits(u.credits)
    setAuthState('in')
  }

  // Kiểm tra phiên đăng nhập và số dư thật từ máy chủ
  useEffect(() => {
    fetchProfile()
      .then(handleLoggedIn)
      .catch((e) => {
        if (e instanceof UnauthorizedError) setAuthState('out')
        else {
          console.error('Không tải được tài khoản:', e)
          setAuthState('in')
        }
      })
  }, [])

  // Quay về từ trang cấp quyền TikTok/Facebook: hiện kết quả rồi xóa tham số khỏi URL
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const platform = q.get('social')
    if (!platform) return
    const name = platform === 'tiktok' ? 'TikTok' : 'Facebook'
    const result = q.get('result')
    const message = q.get('message') ?? ''
    const id = setTimeout(() => {
      setNotice(
        result === 'connected'
          ? { ok: true, text: `Đã kết nối ${name}: ${message}` }
          : { ok: false, text: `Kết nối ${name} không thành công. ${message}` },
      )
      setActiveView('dashboard')
    }, 0)
    window.history.replaceState(null, '', window.location.pathname)
    return () => clearTimeout(id)
  }, [])

  const handleLogout = async () => {
    await logout().catch(() => {})
    setUser(null)
    setActiveView('create')
    setAuthState('out')
  }

  // Light / Dark Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('aura_theme')
    return saved === 'light' || saved === 'dark' ? saved : 'dark'
  })

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    }
    localStorage.setItem('aura_theme', theme)
  }, [theme])

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  // Modals state
  const [isTryOnOpen, setIsTryOnOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isDepositOpen, setIsDepositOpen] = useState(false)
  const [isAuditOpen, setIsAuditOpen] = useState(false)

  // Video State
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string>('/samples/sample_final.mp4')
  const [completedVideoUrl, setCompletedVideoUrl] = useState<string | null>(null)

  // Pipeline execution state
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState('')

  // 6 Pipeline Nodes
  const [nodes, setNodes] = useState<PipelineNode[]>([
    {
      id: 'node_scraper',
      title: 'Nhập Sản Phẩm',
      tag: 'NODE 01: INPUT',
      type: 'scraper',
      x: 60,
      y: 120,
      status: 'idle',
      description: 'Cào dữ liệu từ Shopee / TikTok Shop hoặc ảnh trải sàn 4K',
      metrics: { 'Sản phẩm': 'Đầm Voan', 'Giá niêm yết': '189.000đ' },
      config: { url: 'https://shopee.vn/dam-voan-to-hoa-nhi-i.128491.99281' },
    },
    {
      id: 'node_sam',
      title: 'Bóc Tách Vải SAM 2',
      tag: 'NODE 02: SEGMENT',
      type: 'sam',
      x: 420,
      y: 120,
      status: 'idle',
      description: 'Khử nền alpha thông minh, giữ trọn nếp vải và độ rủ mềm mại',
      metrics: { 'Engine': 'Tách nền sáng', 'Đầu ra': 'PNG trong suốt' },
      config: { threshold: 0.96 },
    },
    {
      id: 'node_vton',
      title: 'Mẫu AI IDM-VTON',
      tag: 'NODE 03: VTON',
      type: 'vton',
      x: 780,
      y: 120,
      status: 'idle',
      description: 'Đặt trang phục lên người mẫu đã chọn (ghép AI thật ở Đợt 2)',
      metrics: { 'Người mẫu': 'Chọn trong cấu hình', 'Engine': 'Tạm (chưa AI)' },
      config: { avatar: 'model_01' },
    },
    {
      id: 'node_motion',
      title: 'Kling I2V Catwalk',
      tag: 'NODE 04: MOTION',
      type: 'motion',
      x: 1140,
      y: 120,
      status: 'idle',
      description: 'Tạo video dọc 9:16 theo mẫu chuyển động đã chọn',
      metrics: { 'Tỉ lệ': '9:16 Dọc', 'Khung hình': '30 FPS' },
      config: { preset: 'catwalk', duration: 3 },
    },
    {
      id: 'node_tts',
      title: 'Lồng Tiếng & Sub',
      tag: 'NODE 05: VOICE',
      type: 'tts',
      x: 1500,
      y: 120,
      status: 'idle',
      description: 'Lồng tiếng KOC Hoài My truyền cảm và phụ đề nhảy chữ WebVTT',
      metrics: { 'Giọng đọc': 'Hoài My', 'Phụ đề': 'Đồng bộ' },
      config: { voice: 'vi-VN-HoaiMyNeural' },
    },
    {
      id: 'node_publish',
      title: 'Xuất Bản Tương Tác',
      tag: 'NODE 06: PUBLISH',
      type: 'publish',
      x: 1860,
      y: 120,
      status: 'idle',
      description: 'Tạo video mua sắm kèm điểm ghim hotspot cổ áo và eo',
      metrics: { 'Caption': 'Tự động', 'Hashtag': 'Theo sản phẩm' },
      config: { remove_watermark: true },
    },
  ])

  const [selectedNode, setSelectedNode] = useState<PipelineNode | null>(null)

  const handleUpdateConfig = (nodeId: string, newConfig: any) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, config: newConfig } : n))
    )
  }

  // Trigger Real AI Pipeline
  const handleRunPipeline = async () => {
    try {
      setIsRunning(true)
      setProgress(5)
      setCurrentStep('Khởi tạo tác vụ trong hàng đợi...')

      // Step 1: Call real API to trigger pipeline
      // Lấy lựa chọn người mẫu, mẫu video, giọng đọc từ cấu hình các node
      const configOf = (id: string) => nodes.find((n) => n.id === id)?.config ?? {}
      const runRes = await triggerPipelineRun({
        product_id: DEMO_PRODUCT_ID,
        avatar_id: configOf('node_vton').avatar,
        template: configOf('node_motion').preset,
        duration_sec: configOf('node_motion').duration,
        voice: configOf('node_tts').voice,
      })

      setWalletCredits(runRes.remaining_credits)
      const jobId = runRes.job_id

      // Step 2: Poll job progress
      const nodeSequence = [
        'node_scraper',
        'node_sam',
        'node_vton',
        'node_motion',
        'node_tts',
        'node_publish',
      ]

      let pollErrors = 0
      const interval = setInterval(async () => {
        try {
          const job = await fetchJobStatus(jobId)
          pollErrors = 0
          setProgress(job.progress)
          setCurrentStep(job.current_step)

          // Update active node in UI
          const activeIndex = Math.min(
            nodeSequence.length - 1,
            Math.floor((job.progress / 100) * nodeSequence.length)
          )

          setNodes((prev) =>
            prev.map((node, idx) => {
              if (idx < activeIndex) return { ...node, status: 'completed' }
              if (idx === activeIndex && job.progress < 100) return { ...node, status: 'running' }
              if (job.progress === 100) return { ...node, status: 'completed' }
              return { ...node, status: 'idle' }
            })
          )

          if (job.status === 'completed') {
            clearInterval(interval)
            setIsRunning(false)
            if (job.output_video_url) {
              setCurrentVideoUrl(job.output_video_url)
              setCompletedVideoUrl(job.output_video_url)
            }
          } else if (job.status === 'failed') {
            clearInterval(interval)
            setIsRunning(false)
            setNodes((prev) => prev.map((n) => (n.status === 'running' ? { ...n, status: 'error' } : n)))
            fetchProfile().then((p) => setWalletCredits(p.credits)).catch(() => {})
            alert(
              `Tạo video thất bại: ${job.error_message ?? 'lỗi không xác định'}` +
                (job.refunded ? '\nCredit đã được hoàn lại.' : ''),
            )
          }
        } catch (e) {
          console.error('Lỗi khi kiểm tra tiến độ:', e)
          // Mất kết nối liên tục khoảng 10 giây thì dừng hỏi
          if (++pollErrors >= 15) {
            clearInterval(interval)
            setIsRunning(false)
            alert('Mất kết nối tới máy chủ khi theo dõi tiến độ. Vào Dashboard để xem kết quả sau.')
          }
        }
      }, 700)
    } catch (err: any) {
      console.error(err)
      setIsRunning(false)
      alert(err.message || 'Lỗi kết nối máy chủ')
    }
  }

  const handleReset = () => {
    setNodes((prev) => prev.map((n) => ({ ...n, status: 'idle' })))
    setProgress(0)
    setCurrentStep('')
    setCompletedVideoUrl(null)
  }

  if (authState === 'loading') {
    return <div className="h-screen w-screen bg-[var(--bg-app)]" />
  }
  if (authState === 'out') {
    return <LoginView onLoggedIn={handleLoggedIn} />
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-app)] text-[var(--text-main)] overflow-hidden transition-colors duration-200">
      {/* Header with Light/Dark and 4 Navigation Views */}
      <Header
        activeView={activeView}
        setActiveView={setActiveView}
        walletCredits={walletCredits}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenDeposit={() => setIsDepositOpen(true)}
        onOpenAudit={() => setIsAuditOpen(true)}
        userName={user?.name}
        onLogout={handleLogout}
      />

      {notice && (
        <div
          className={`px-4 py-2 text-sm flex items-center justify-between ${
            notice.ok ? 'bg-[var(--accent-color)]/10 text-[var(--accent-color)]' : 'bg-red-500/10 text-red-400'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="text-xs underline">
            Đóng
          </button>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* VIEW 1 & 2: B2B Node Studio */}
        {(activeView === 'split' || activeView === 'studio') && (
          <div
            className={`relative flex flex-col h-full overflow-hidden transition-all duration-300 ${
              activeView === 'split' ? 'w-[68%]' : 'w-full'
            }`}
          >
            {/* Studio Controls Top Bar */}
            <StudioControls
              isRunning={isRunning}
              progress={progress}
              currentStep={currentStep}
              completedVideoUrl={completedVideoUrl}
              onRunPipeline={handleRunPipeline}
              onReset={handleReset}
            />

            {/* Canvas Area */}
            <NodeCanvas
              nodes={nodes}
              setNodes={setNodes}
              selectedNode={selectedNode}
              setSelectedNode={setSelectedNode}
            />
          </div>
        )}

        {/* Node Inspector Drawer */}
        {selectedNode && (
          <NodeInspector
            node={nodes.find((n) => n.id === selectedNode.id) ?? selectedNode}
            onClose={() => setSelectedNode(null)}
            onUpdateConfig={handleUpdateConfig}
          />
        )}

        {/* VIEW 3: Dedicated Comprehensive Dashboard & Settings */}
        {activeView === 'create' && <CreateVideoView onCreditsChange={setWalletCredits} />}

        {activeView === 'dashboard' && (
          <DashboardView
            walletCredits={walletCredits}
            theme={theme}
            initialTab={notice ? 'integrations' : undefined}
          />
        )}

        {/* VIEW 4: C2C Shoppable Player */}
        {(activeView === 'split' || activeView === 'tryon') && (
          <div
            className={`border-l border-[var(--border-subtle)] bg-[var(--bg-app)] flex flex-col h-full overflow-hidden transition-all duration-300 ${
              activeView === 'split' ? 'w-[32%]' : 'w-full'
            }`}
          >
            <ShoppableFeed
              videoUrl={currentVideoUrl}
              onOpenTryOn={() => setIsTryOnOpen(true)}
              onOpenCheckout={() => setIsCheckoutOpen(true)}
            />
          </div>
        )}
      </div>

      {/* Interactive Modals */}
      <TryOnModal
        isOpen={isTryOnOpen}
        onClose={() => setIsTryOnOpen(false)}
        onOpenCheckout={() => {
          setIsTryOnOpen(false)
          setIsCheckoutOpen(true)
        }}
      />

      <QuickCheckoutDrawer
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
      />

      <VietQRModal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        onSuccessDeposit={(newBalance) => setWalletCredits(newBalance)}
      />

      <AuditModal
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
      />
    </div>
  )
}
