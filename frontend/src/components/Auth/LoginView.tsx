import React, { useState } from 'react'
import { Eye, EyeOff, Loader2, Send, Shirt, Sparkles, Wand2 } from 'lucide-react'
import { login, register, setApiToken, type UserProfile } from '../../services/api'

interface LoginViewProps {
  onLoggedIn: (user: UserProfile, isNewAccount: boolean) => void
}

const input =
  'w-full bg-[var(--bg-surface)] border rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-color)]'
const labelCls = 'text-sm font-medium text-[var(--text-muted)] block mb-1.5'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FEATURES = [
  { icon: Shirt, text: 'Tải ảnh sản phẩm, AI cho người mẫu mặc thử' },
  { icon: Wand2, text: 'Tự viết lời review, lồng tiếng và phụ đề' },
  { icon: Send, text: 'Đăng thẳng lên TikTok, Facebook' },
]

type Field = 'name' | 'email' | 'password'

export const LoginView: React.FC<LoginViewProps> = ({ onLoggedIn }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login')
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
    if (mode === 'register' && !name.trim()) errs.name = 'Vui lòng nhập tên shop'
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
        mode === 'login' ? await login(email.trim(), password) : await register(name.trim(), email.trim(), password)
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

  const border = (f: Field) => (fieldErrors[f] ? 'border-[var(--danger-border)]' : 'border-[var(--border-subtle)]')
  const fieldError = (f: Field) =>
    fieldErrors[f] && (
      <span id={`${f}-error`} className="text-sm text-[var(--danger-text)] block mt-1">
        {fieldErrors[f]}
      </span>
    )

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg-app)] text-[var(--text-main)]">
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <form
          onSubmit={submit}
          noValidate
          className="w-full max-w-sm rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-6 sm:p-7 space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-color)] text-black font-extrabold flex items-center justify-center">
              A
            </div>
            <div>
              <div className="font-display font-bold text-lg">AURA</div>
              <div className="text-sm text-[var(--text-muted)]">Video review thời trang bằng AI</div>
            </div>
          </div>

          <ul className="space-y-1.5">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2 text-sm text-[var(--text-sub)]">
                <Icon className="w-4 h-4 text-[var(--accent-text)] shrink-0" /> {text}
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-surface)] text-sm" role="tablist">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`py-2 rounded-lg font-semibold ${
                  mode === m ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
                }`}
              >
                {m === 'login' ? 'Đăng nhập' : 'Đăng ký'}
              </button>
            ))}
          </div>

          {mode === 'register' && (
            <div>
              <label htmlFor="name" className={labelCls}>
                Tên shop
              </label>
              <input
                id="name"
                className={`${input} ${border('name')}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                autoComplete="organization"
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? 'name-error' : undefined}
              />
              {fieldError('name')}
            </div>
          )}
          <div>
            <label htmlFor="email" className={labelCls}>
              Email
            </label>
            <input
              id="email"
              className={`${input} ${border('email')}`}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            />
            {fieldError('email')}
          </div>
          <div>
            <label htmlFor="password" className={labelCls}>
              Mật khẩu
            </label>
            <div className="relative">
              <input
                id="password"
                className={`${input} ${border('password')} pr-11`}
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
                className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-[var(--text-muted)]"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {fieldError('password') ||
              (mode === 'register' && <span className="text-sm text-[var(--text-muted)] block mt-1">Ít nhất 8 ký tự</span>)}
          </div>

          {error && (
            <p className="text-sm text-[var(--danger-text)]" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
        </form>
      </div>
    </div>
  )
}
