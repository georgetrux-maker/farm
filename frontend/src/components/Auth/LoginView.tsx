import React, { useState } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Send, Shirt, Wand2 } from 'lucide-react'
import { login, register, setApiToken, type AccountRole, type UserProfile } from '../../services/api'
import { PhoneMockups } from '../ui/PhoneMockups'
import { Wordmark } from '../ui/Wordmark'

interface LoginViewProps {
  onLoggedIn: (user: UserProfile, isNewAccount: boolean) => void
  initialMode?: 'login' | 'register'
  initialRole?: AccountRole
  /** Có thì hiện nút quay lại trang giới thiệu */
  onBack?: () => void
  /** Lý do phải đăng nhập (vd bấm Thử đồ trên feed khi chưa có tài khoản) */
  notice?: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FEATURES = [
  { icon: Shirt, text: 'Người mẫu AI mặc thử sản phẩm của bạn' },
  { icon: Wand2, text: 'Tự viết lời review, lồng tiếng, phụ đề' },
  { icon: Send, text: 'Đăng thẳng lên TikTok, Facebook' },
]

type Field = 'name' | 'email' | 'password'

export const LoginView: React.FC<LoginViewProps> = ({ onLoggedIn, initialMode = 'login', initialRole = 'shop', onBack, notice }) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [role, setRole] = useState<AccountRole>(initialRole)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({})

  // Tự kiểm tra để thông báo bằng tiếng Việt (thông báo mặc định của trình duyệt theo ngôn ngữ máy)
  const validate = () => {
    const errs: Partial<Record<Field, string>> = {}
    if (mode === 'register' && !name.trim()) errs.name = role === 'shop' ? 'Vui lòng nhập tên shop' : 'Vui lòng nhập tên của bạn'
    if (!EMAIL_RE.test(email.trim())) errs.email = 'Vui lòng nhập email hợp lệ, ví dụ ten@gmail.com'
    if (!password) errs.password = 'Vui lòng nhập mật khẩu'
    else if (mode === 'register' && password.length < 8) errs.password = 'Mật khẩu cần ít nhất 8 ký tự'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!validate()) return
    setBusy(true)
    try {
      const res =
        mode === 'login' ? await login(email.trim(), password) : await register(name.trim(), email.trim(), password, role)
      setApiToken(res.token)
      onLoggedIn(res.user, mode === 'register')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const switchMode = (m: 'login' | 'register') => {
    setMode(m)
    setError(null)
    setFieldErrors({})
  }

  const invalid = (f: Field) => (fieldErrors[f] ? 'border-[var(--danger-text)]' : '')
  const fieldError = (f: Field) =>
    fieldErrors[f] && (
      <span id={`${f}-error`} className="text-sm text-[var(--danger-text)] block mt-1.5">
        {fieldErrors[f]}
      </span>
    )

  return (
    <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Bên trái (máy tính): khẩu hiệu + minh họa video */}
      <aside className="hidden lg:flex flex-col justify-between overflow-hidden relative p-12 xl:p-16 bg-gradient-to-br from-[#EFDCE2] via-[#F4E9DF] to-[#E6D3C1] dark:from-[#271C20] dark:via-[#1E1815] dark:to-[#271F18]">
        <Wordmark className="text-2xl text-[var(--text-main)]" />
        <div className="relative max-w-xl">
          <p className="eyebrow mb-4">Studio video thời trang</p>
          <h1 className="display text-5xl xl:text-6xl leading-[1.08] text-[var(--text-main)]">
            Ảnh sản phẩm thành <em className="text-[var(--accent-text)]">video review</em> chỉ trong vài phút
          </h1>
          <p className="mt-5 text-[var(--text-sub)] text-lg max-w-md">
            Người mẫu AI mặc thử, lời review được viết sẵn, lồng tiếng và phụ đề tiếng Việt, sẵn sàng đăng TikTok.
          </p>
        </div>
        <PhoneMockups className="h-[340px] xl:h-[380px] max-w-xl w-full" />
      </aside>

      {/* Bên phải: biểu mẫu */}
      <div className="overflow-y-auto">
        <div className="min-h-full flex flex-col justify-center px-5 py-10 sm:px-10">
          <form onSubmit={submit} noValidate className="w-full max-w-sm mx-auto animate-fade-up">
            {onBack && (
              <button type="button" onClick={onBack} className="btn btn-ghost btn-sm -ml-3 mb-4">
                <ArrowLeft className="w-4 h-4" /> Trang chủ Aura
              </button>
            )}
            <Wordmark className="lg:hidden text-2xl block text-center mb-8" />
            {notice && (
              <p className="mb-5 text-sm p-3 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)] font-medium" role="status">
                {notice}
              </p>
            )}
            <h2 className="display text-3xl">
              {mode === 'login' ? 'Chào mừng trở lại' : role === 'shop' ? 'Tạo tài khoản shop' : 'Tạo tài khoản người mua'}
            </h2>
            <p className="text-[var(--text-muted)] mt-2">
              {mode === 'login'
                ? 'Đăng nhập bằng tài khoản shop hoặc người mua.'
                : role === 'shop'
                  ? 'Bắt đầu làm video review cho sản phẩm thời trang của bạn.'
                  : 'Lưu video yêu thích, thử đồ lên ảnh của bạn rồi mua ở shop.'}
            </p>

            <ul className="lg:hidden mt-5 space-y-2">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-sm text-[var(--text-sub)]">
                  <Icon className="w-4 h-4 text-[var(--accent-text)] shrink-0" /> {text}
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-2 gap-1 p-1 mt-7 rounded-full bg-[var(--bg-surface)] text-sm" role="tablist">
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={`py-2.5 rounded-full font-semibold transition-colors ${
                    mode === m ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {m === 'login' ? 'Đăng nhập' : 'Đăng ký'}
                </button>
              ))}
            </div>

            <div className="space-y-4 mt-6">
              {mode === 'register' && (
                <div role="radiogroup" aria-label="Loại tài khoản" className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'shop', title: 'Tôi bán hàng', text: 'Tạo video cho shop' },
                      { id: 'buyer', title: 'Tôi mua hàng', text: 'Xem feed, thử đồ' },
                    ] as const
                  ).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={role === r.id}
                      onClick={() => setRole(r.id)}
                      className={`text-left p-3 rounded-2xl border transition-colors ${
                        role === r.id ? 'border-[var(--ink)] bg-[var(--accent-soft)]' : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <span className="block text-sm font-semibold">{r.title}</span>
                      <span className="block text-xs text-[var(--text-muted)]">{r.text}</span>
                    </button>
                  ))}
                </div>
              )}
              {mode === 'register' && (
                <div>
                  <label htmlFor="name" className="field-label">
                    {role === 'shop' ? 'Tên shop' : 'Tên của bạn'}
                  </label>
                  <input
                    id="name"
                    className={`field ${invalid('name')}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    autoComplete={role === 'shop' ? 'organization' : 'name'}
                    placeholder={role === 'shop' ? 'Ví dụ: Tiệm Áo Mây' : 'Ví dụ: Ngọc Lan'}
                    aria-invalid={!!fieldErrors.name}
                    aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                  />
                  {fieldError('name')}
                </div>
              )}
              <div>
                <label htmlFor="email" className="field-label">
                  Email
                </label>
                <input
                  id="email"
                  className={`field ${invalid('email')}`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="ten@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                />
                {fieldError('email')}
              </div>
              <div>
                <label htmlFor="password" className="field-label">
                  Mật khẩu
                </label>
                <div className="relative">
                  <input
                    id="password"
                    className={`field pr-12 ${invalid('password')}`}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!fieldErrors.password}
                    aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="icon-btn absolute right-1 top-1/2 -translate-y-1/2"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldError('password') ||
                  (mode === 'register' && <span className="text-sm text-[var(--text-muted)] block mt-1.5">Ít nhất 8 ký tự</span>)}
              </div>
            </div>

            {error && (
              <p
                className="mt-4 text-sm p-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]"
                role="alert"
              >
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full mt-6">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
              {!busy && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
