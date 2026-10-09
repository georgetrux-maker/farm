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
import type { PipelineNode } from './types'
import { triggerPipelineRun, fetchJobStatus } from './services/api'

export default function App() {
  const [activeView, setActiveView] = useState<'split' | 'studio' | 'tryon' | 'dashboard'>('split')
  const [walletCredits, setWalletCredits] = useState<number>(4790)

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
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string>('/media/sample_final.mp4')
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
      metrics: { 'Alpha Mask': '99.2%', 'Độ rủ vải': '96.2%' },
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
      description: 'Mặc thử trang phục lên người mẫu AI Linh Đan độc quyền',
      metrics: { 'Người mẫu': 'Linh Đan', 'Điểm Fit': '99.3%' },
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
      description: 'Sinh chuyển động sải bước runway 9:16 dọc mượt mà 60fps',
      metrics: { 'Tỉ lệ': '9:16 Dọc', 'Khung hình': '60 FPS' },
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
      metrics: { 'Hotspot': '2 Điểm', 'Watermark': 'Không' },
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
      const runRes = await triggerPipelineRun({
        product_name: 'Đầm Lụa Satin Cao Cấp',
        category: 'Váy dạ hội',
        avatar_id: 'model_01',
        voice_id: 'vi-VN-HoaiMyNeural',
        scene_type: 'luxury_hall',
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

      const interval = setInterval(async () => {
        try {
          const job = await fetchJobStatus(jobId)
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
            alert('Có lỗi xảy ra trong quá trình xử lý!')
          }
        } catch (e) {
          console.error('Lỗi khi kiểm tra tiến độ:', e)
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
      />

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
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onUpdateConfig={handleUpdateConfig}
          />
        )}

        {/* VIEW 3: Dedicated Comprehensive Dashboard & Settings */}
        {activeView === 'dashboard' && (
          <DashboardView
            walletCredits={walletCredits}
            theme={theme}
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
        onSuccessDeposit={(credits) => setWalletCredits((prev) => prev + credits)}
      />

      <AuditModal
        isOpen={isAuditOpen}
        onClose={() => setIsAuditOpen(false)}
      />
    </div>
  )
}
