import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { BottomNav } from './components/BottomNav'
import { Wordmark } from './components/ui/Wordmark'
import { LoginView } from './components/Auth/LoginView'
import { HomeView } from './components/Home/HomeView'
import { CreateVideoView } from './components/Create/CreateVideoView'
import { ProStudioView } from './components/Studio/ProStudioView'
import { seedFromVideo, type CreateRequest } from './lib/createRequest'
import { ProductsView } from './components/Products/ProductsView'
import { ModelsView } from './components/Models/ModelsView'
import { MyVideosView } from './components/Videos/MyVideosView'
import { ConnectView } from './components/Connect/ConnectView'
import { WalletView } from './components/Wallet/WalletView'
import { SupportView } from './components/Support/SupportView'
import { TemplateShowcaseView } from './components/Showcase/TemplateShowcaseView'
import { AdminDashboardView } from './components/Admin/AdminDashboardView'
import { AuditModal } from './components/SystemAudit/AuditModal'
import { useToast } from './components/ui/toastContext'
import {
  UNAUTHORIZED_EVENT, UnauthorizedError, clearApiToken, fetchDepositStatus, fetchProfile, logout,
  type DepositInfo, type ShowcaseTemplate, type UserProfile,
} from './services/api'
import type { LibraryProduct, MyVideo } from './types'
import { formatNumber, formatVnd } from './lib/format'
import { parseHash, toHash, type AdminSection, type View } from './lib/navigation'
import { applyTheme, savedMode, savedPalette, type Palette, type ThemeMode } from './lib/theme'

const DEPOSIT_WATCH_MS = 30 * 60 * 1000 // theo dõi tiền về tối đa 30 phút

interface Route {
  view: View
  section: AdminSection
}

/** Vừa quay về từ trang cấp quyền TikTok/Facebook thì mở trang Kênh liên kết */
function initialRoute(): Route {
  if (new URLSearchParams(window.location.search).has('social')) return { view: 'connect', section: 'overview' }
  return parseHash(window.location.hash)
}

export default function App() {
  const toast = useToast()
  const [authState, setAuthState] = useState<'loading' | 'in' | 'out' | 'offline'>('loading')
  const [user, setUser] = useState<UserProfile | null>(null)
  const [walletCredits, setWalletCredits] = useState(0)
  const [route, setRoute] = useState<Route>(initialRoute)
  const [mode, setMode] = useState<ThemeMode>(savedMode)
  const [palette, setPalette] = useState<Palette>(savedPalette)
  const [pendingDeposit, setPendingDeposit] = useState<DepositInfo | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<ShowcaseTemplate | null>(null)
  const [createRequest, setCreateRequest] = useState<CreateRequest | null>(null)
  const [studioRequest, setStudioRequest] = useState<CreateRequest | null>(null)
  const [autoRequest, setAutoRequest] = useState<number | null>(null)

  const isAdmin = user?.role === 'admin'
  // Trang Quản trị chỉ dành cho quản trị viên: tài khoản thường gõ #admin thì về Trang chủ
  const view: View = route.view === 'admin' && !isAdmin ? 'home' : route.view
  // Pro Studio giữ nguyên trạng thái khi chuyển trang (giống Tạo video), nhưng chỉ tải khi mở lần đầu
  const [studioOpened, setStudioOpened] = useState(false)
  if (view === 'studio' && !studioOpened) setStudioOpened(true)
  const authRef = useRef(authState)
  useEffect(() => {
    authRef.current = authState
  }, [authState])

  const navigate = useCallback((next: View, section: AdminSection = 'overview') => {
    setRoute({ view: next, section })
    const hash = toHash(next, section)
    if (window.location.hash.replace(/^#\/?/, '') !== hash) window.location.hash = hash
  }, [])
  const setActiveView = useCallback((next: View) => navigate(next), [navigate])
  const setAdminSection = useCallback((section: AdminSection) => navigate('admin', section), [navigate])

  // Nút Back/Forward của trình duyệt đổi trang theo #hash
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Giao diện: sáng/tối và tông màu, nhớ lại cho lần sau
  useEffect(() => applyTheme(mode, palette), [mode, palette])

  const handleLoggedIn = useCallback(
    (u: UserProfile, isNewAccount = false) => {
      setUser(u)
      setWalletCredits(u.credits)
      setAuthState('in')
      if (isNewAccount) {
        toast(
          u.credits > 0
            ? `Chào mừng ${u.name}. Bạn có ${formatNumber(u.credits)} credit để bắt đầu tạo video.`
            : `Chào mừng ${u.name}. Nạp credit (từ 10.000đ) ở trang Ví Credits để bắt đầu tạo video.`,
          'success',
        )
      }
    },
    [toast],
  )

  const loadProfile = useCallback(() => {
    setAuthState('loading')
    fetchProfile()
      .then((u) => handleLoggedIn(u))
      .catch((e) => setAuthState(e instanceof UnauthorizedError ? 'out' : 'offline'))
  }, [handleLoggedIn])

  // Kiểm tra phiên đăng nhập và số dư thật từ máy chủ
  useEffect(() => {
    const id = setTimeout(loadProfile, 0)
    return () => clearTimeout(id)
  }, [loadProfile])

  // Phiên hết hạn hoặc tài khoản bị khóa giữa chừng (máy chủ trả 401): quay về màn đăng nhập
  useEffect(() => {
    const onUnauthorized = () => {
      if (authRef.current !== 'in') return // đang đăng nhập/kiểm tra phiên: nơi gọi tự xử lý lỗi
      clearApiToken()
      authRef.current = 'out'
      setAuthState('out')
      setPendingDeposit(null)
      toast('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại', 'info')
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [toast])

  // Quay về từ trang cấp quyền TikTok/Facebook: báo kết quả rồi xóa tham số khỏi URL
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const platform = q.get('social')
    if (!platform) return
    const name = platform === 'tiktok' ? 'TikTok' : 'Facebook'
    const message = q.get('message') ?? ''
    if (q.get('result') === 'connected') toast(`Đã kết nối ${name}${message ? `: ${message}` : ''}`, 'success')
    else toast(`Kết nối ${name} không thành công. ${message}`, 'error')
    window.history.replaceState(null, '', `${window.location.pathname}#connect`)
  }, [toast])

  // Có lệnh nạp đang chờ: hỏi máy chủ mỗi 5 giây kể cả khi đã rời trang Ví
  useEffect(() => {
    if (!pendingDeposit) return
    const startedAt = Date.now()
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > DEPOSIT_WATCH_MS) {
        clearInterval(timer)
        return
      }
      try {
        const tx = await fetchDepositStatus(pendingDeposit.transaction_id)
        if (tx.status === 'success') {
          clearInterval(timer)
          setWalletCredits(tx.balance)
          setPendingDeposit(null)
          toast(
            `Đã nhận ${formatVnd(pendingDeposit.amount_vnd)}, cộng ${formatNumber(tx.credits)} credit vào ví`,
            'success',
          )
        } else if (tx.status === 'cancelled') {
          clearInterval(timer)
          setPendingDeposit(null)
          toast('Lệnh nạp đã bị hủy. Nếu bạn đã chuyển khoản, vui lòng liên hệ Hỗ trợ.', 'info')
        }
      } catch {
        // mạng chập chờn: thử lại lần sau
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [pendingDeposit, toast])

  const handleLogout = async () => {
    authRef.current = 'out' // phiên cũ có thể đã hết hạn: không báo "hết phiên" khi đang đăng xuất
    await logout().catch(() => {})
    setUser(null)
    setPendingDeposit(null)
    navigate('home')
    setAuthState('out')
  }

  const openWallet = useCallback(() => navigate('wallet'), [navigate])
  const openVideos = useCallback(() => navigate('videos'), [navigate])
  const openCreate = useCallback(() => navigate('create'), [navigate])
  const openStudio = useCallback(() => navigate('studio'), [navigate])
  const startAuto = useCallback(() => {
    setAutoRequest(Date.now())
    navigate('create')
  }, [navigate])
  const handleUseTemplate = useCallback(
    (tmpl: ShowcaseTemplate) => {
      setSelectedTemplate(tmpl)
      navigate('create')
    },
    [navigate],
  )
  // "Tạo lại" ở trang Video của tôi: mở bước 2 với sản phẩm và cài đặt của video cũ để sửa trước khi tạo
  // "Tạo video" ở Sản phẩm của tôi: mở bước 2 với sản phẩm đó
  const createFromProduct = useCallback(
    (p: LibraryProduct) => {
      setCreateRequest({
        product: {
          id: p.id, image_url: p.image_url, title: p.title, price: p.price, original_price: p.original_price,
          category: p.category, fabric: p.fabric_type,
        },
        at: Date.now(),
      })
      navigate('create')
    },
    [navigate],
  )
  // "Dùng mẫu này" ở Người mẫu AI: chọn sẵn người mẫu ở trang Tạo video
  const pickModel = useCallback(
    (avatarId: string) => {
      setCreateRequest({ avatarId, at: Date.now() })
      navigate('create')
    },
    [navigate],
  )
  // Video nhiều cảnh thì mở lại ở Pro Studio
  const handleRemake = useCallback(
    (video: MyVideo) => {
      if ((video.params?.scenes?.length ?? 0) > 1) {
        setStudioRequest(seedFromVideo(video))
        navigate('studio')
        return
      }
      setCreateRequest(seedFromVideo(video))
      navigate('create')
    },
    [navigate],
  )

  if (authState === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-[var(--text-main)]">
        <Wordmark className="text-3xl animate-fade-in" />
        <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
      </div>
    )
  }
  if (authState === 'offline') {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-main)] px-4">
        <div className="max-w-sm text-center space-y-4 animate-fade-up">
          <Wordmark className="text-2xl" />
          <h1 className="display text-2xl">Không kết nối được máy chủ</h1>
          <p className="text-sm text-[var(--text-muted)]">Kiểm tra mạng của bạn rồi thử lại.</p>
          <button onClick={loadProfile} className="btn btn-primary">
            <RefreshCw className="w-4 h-4" /> Thử lại
          </button>
        </div>
      </div>
    )
  }
  if (authState === 'out' || !user) {
    return <LoginView onLoggedIn={handleLoggedIn} />
  }

  return (
    <div className="flex-1 min-h-0 flex text-[var(--text-main)]">
      <a href="#noi-dung" className="skip-link" onClick={(e) => {
        e.preventDefault()
        document.getElementById('noi-dung')?.focus()
      }}>
        Bỏ qua menu, tới nội dung
      </a>
      <Sidebar
        view={view}
        adminSection={route.section}
        isAdmin={isAdmin}
        onNavigate={setActiveView}
        onAdminSection={setAdminSection}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <Header
          activeView={view}
          setActiveView={setActiveView}
          walletCredits={walletCredits}
          mode={mode}
          palette={palette}
          onModeChange={setMode}
          onPaletteChange={setPalette}
          onOpenDeposit={openWallet}
          onOpenAudit={isAdmin ? () => setAuditOpen(true) : undefined}
          userName={user.name}
          userEmail={user.email}
          isAdmin={isAdmin}
          onLogout={handleLogout}
        />

        <main id="noi-dung" tabIndex={-1} className="flex-1 min-h-0 flex outline-none">
          {/* Giữ trang Tạo video khi chuyển trang để không mất ảnh/thông tin đang nhập hoặc tiến độ */}
          <div className={view === 'create' ? 'flex-1 min-w-0 flex animate-fade-in' : 'hidden'}>
            <CreateVideoView
              credits={walletCredits}
              isAdmin={isAdmin}
              onCreditsChange={setWalletCredits}
              onOpenDeposit={openWallet}
              onOpenVideos={openVideos}
              onOpenStudio={openStudio}
              initialTemplate={selectedTemplate}
              onClearInitialTemplate={() => setSelectedTemplate(null)}
              request={createRequest}
              autoRequest={autoRequest}
            />
          </div>
          {studioOpened && (
            <div className={view === 'studio' ? 'flex-1 min-w-0 flex animate-fade-in' : 'hidden'}>
              <ProStudioView
                credits={walletCredits}
                onCreditsChange={setWalletCredits}
                onOpenDeposit={openWallet}
                onOpenVideos={openVideos}
                request={studioRequest}
              />
            </div>
          )}
          {view !== 'create' && view !== 'studio' && (
            <div key={view} className="flex-1 min-w-0 flex animate-fade-in">
              {view === 'home' && (
                <HomeView
                  user={user}
                  credits={walletCredits}
                  onNavigate={setActiveView}
                  onOpenDeposit={openWallet}
                  onStartAuto={startAuto}
                />
              )}
              {view === 'showcase' && <TemplateShowcaseView onUseTemplate={handleUseTemplate} />}
              {view === 'products' && (
                <ProductsView
                  credits={walletCredits}
                  onCreateVideo={createFromProduct}
                  onCreditsChange={setWalletCredits}
                  onOpenVideos={openVideos}
                  onOpenDeposit={openWallet}
                />
              )}
              {view === 'models' && <ModelsView onUseModel={pickModel} />}
              {view === 'videos' && (
                <MyVideosView onCreate={openCreate} onCreditsChange={setWalletCredits} onRemake={handleRemake} />
              )}
              {view === 'connect' && <ConnectView isAdmin={isAdmin} />}
              {view === 'wallet' && (
                <WalletView
                  credits={walletCredits}
                  pending={pendingDeposit}
                  onCreated={setPendingDeposit}
                  onDiscard={() => setPendingDeposit(null)}
                />
              )}
              {view === 'support' && <SupportView onNavigate={setActiveView} />}
              {view === 'admin' && (
                <AdminDashboardView section={route.section} onSectionChange={setAdminSection} currentUserId={user.id} />
              )}
            </div>
          )}
        </main>

        <BottomNav activeView={view} setActiveView={setActiveView} />
      </div>

      {isAdmin && <AuditModal open={auditOpen} onClose={() => setAuditOpen(false)} />}
    </div>
  )
}
