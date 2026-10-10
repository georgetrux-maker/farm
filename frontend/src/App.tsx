import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Header } from './components/Header'
import { BottomNav } from './components/BottomNav'
import { Wordmark } from './components/ui/Wordmark'
import { LoginView } from './components/Auth/LoginView'
import { CreateVideoView } from './components/Create/CreateVideoView'
import { MyVideosView } from './components/Videos/MyVideosView'
import { ConnectView } from './components/Connect/ConnectView'
import { StatsView } from './components/Stats/StatsView'
import { TemplateShowcaseView } from './components/Showcase/TemplateShowcaseView'
import { AdminDashboardView } from './components/Admin/AdminDashboardView'
import { VietQRModal } from './components/Wallet/VietQRModal'
import { AuditModal } from './components/SystemAudit/AuditModal'
import { useToast } from './components/ui/toastContext'
import {
  UNAUTHORIZED_EVENT, UnauthorizedError, clearApiToken, fetchDepositStatus, fetchProfile, logout,
  type DepositInfo, type ShowcaseTemplate, type UserProfile,
} from './services/api'
import { formatNumber, formatVnd } from './lib/format'
import type { View } from './lib/navigation'

const VIEWS: View[] = ['create', 'showcase', 'videos', 'connect', 'stats', 'admin']
const DEPOSIT_WATCH_MS = 30 * 60 * 1000 // theo dõi tiền về tối đa 30 phút

function viewFromHash(): View {
  const h = window.location.hash.replace(/^#\/?/, '')
  return (VIEWS as string[]).includes(h) ? (h as View) : 'create'
}

/** Vừa quay về từ trang cấp quyền TikTok/Facebook thì mở trang Kết nối */
function initialView(): View {
  return new URLSearchParams(window.location.search).has('social') ? 'connect' : viewFromHash()
}

/** Mặc định nền sáng (đúng phong cách thời trang); người dùng chọn nền tối thì nhớ lại */
function savedTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem('aura_theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export default function App() {
  const toast = useToast()
  const [authState, setAuthState] = useState<'loading' | 'in' | 'out' | 'offline'>('loading')
  const [user, setUser] = useState<UserProfile | null>(null)
  const [walletCredits, setWalletCredits] = useState(0)
  const [activeView, setActiveViewState] = useState<View>(initialView)
  const [theme, setTheme] = useState<'dark' | 'light'>(savedTheme)
  const [depositOpen, setDepositOpen] = useState(false)
  const [pendingDeposit, setPendingDeposit] = useState<DepositInfo | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<ShowcaseTemplate | null>(null)

  const isAdmin = user?.role === 'admin'
  const authRef = useRef(authState)
  useEffect(() => {
    authRef.current = authState
  }, [authState])

  const setActiveView = useCallback((view: View) => {
    setActiveViewState(view)
    if (viewFromHash() !== view) window.location.hash = view
  }, [])

  // Nút Back/Forward của trình duyệt đổi trang theo #hash
  useEffect(() => {
    const onHash = () => setActiveViewState(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const handleLoggedIn = useCallback(
    (u: UserProfile, isNewAccount = false) => {
      setUser(u)
      setWalletCredits(u.credits)
      setAuthState('in')
      if (isNewAccount) {
        toast(
          u.credits > 0
            ? `Chào mừng ${u.name}! Bạn có ${formatNumber(u.credits)} credit để bắt đầu tạo video.`
            : `Chào mừng ${u.name}! Nạp credit (từ 10.000đ) ở nút số dư góc trên để bắt đầu tạo video.`,
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

  // Phiên hết hạn giữa chừng (máy chủ trả 401): quay về màn đăng nhập
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

  // Giao diện sáng / tối
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1B1714' : '#FBF8F4')
    try {
      localStorage.setItem('aura_theme', theme)
    } catch {
      // bỏ qua
    }
  }, [theme])

  // Có lệnh nạp đang chờ: hỏi máy chủ mỗi 5 giây kể cả khi đã đóng cửa sổ nạp
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
          setDepositOpen(false)
          toast(
            `Đã nhận ${formatVnd(pendingDeposit.amount_vnd)}, cộng ${formatNumber(tx.credits)} credit vào ví`,
            'success',
          )
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
    setActiveView('create')
    setAuthState('out')
  }

  const openDeposit = useCallback(() => setDepositOpen(true), [])
  const openVideos = useCallback(() => setActiveView('videos'), [setActiveView])
  const openCreate = useCallback(() => setActiveView('create'), [setActiveView])
  const handleUseTemplate = useCallback(
    (tmpl: ShowcaseTemplate) => {
      setSelectedTemplate(tmpl)
      setActiveView('create')
    },
    [setActiveView],
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
    <div className="flex-1 min-h-0 flex flex-col text-[var(--text-main)]">
      <Header
        activeView={activeView}
        setActiveView={setActiveView}
        walletCredits={walletCredits}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onOpenDeposit={openDeposit}
        onOpenAudit={isAdmin ? () => setAuditOpen(true) : undefined}
        userName={user.name}
        userEmail={user.email}
        isAdmin={isAdmin}
        onLogout={handleLogout}
      />

      <main className="flex-1 min-h-0 flex">
        {/* Giữ trang Tạo video khi chuyển trang để không mất ảnh/thông tin đang nhập hoặc tiến độ */}
        <div className={activeView === 'create' ? 'flex-1 min-w-0 flex animate-fade-in' : 'hidden'}>
          <CreateVideoView
            credits={walletCredits}
            isAdmin={isAdmin}
            onCreditsChange={setWalletCredits}
            onOpenDeposit={openDeposit}
            onOpenVideos={openVideos}
            initialTemplate={selectedTemplate}
            onClearInitialTemplate={() => setSelectedTemplate(null)}
          />
        </div>
        {activeView !== 'create' && (
          <div key={activeView} className="flex-1 min-w-0 flex animate-fade-in">
            {activeView === 'showcase' && <TemplateShowcaseView onUseTemplate={handleUseTemplate} />}
            {activeView === 'videos' && <MyVideosView onCreate={openCreate} onCreditsChange={setWalletCredits} />}
            {activeView === 'connect' && <ConnectView isAdmin={isAdmin} />}
            {activeView === 'stats' && (
              <StatsView user={user} credits={walletCredits} isAdmin={isAdmin} onOpenDeposit={openDeposit} />
            )}
            {activeView === 'admin' && <AdminDashboardView />}
          </div>
        )}
      </main>

      <BottomNav activeView={activeView} setActiveView={setActiveView} />

      <VietQRModal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        pending={pendingDeposit}
        onCreated={setPendingDeposit}
        onDiscard={() => setPendingDeposit(null)}
      />
      {isAdmin && <AuditModal open={auditOpen} onClose={() => setAuditOpen(false)} />}
    </div>
  )
}
