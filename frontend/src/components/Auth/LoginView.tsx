import React, { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { login, register, setApiToken, type UserProfile } from '../../services/api'

interface LoginViewProps {
  onLoggedIn: (user: UserProfile) => void
}

const input =
  'w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-color)]'

export const LoginView: React.FC<LoginViewProps> = ({ onLoggedIn }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = mode === 'login' ? await login(email, password) : await register(name, email, password)
      setApiToken(res.token)
      onLoggedIn(res.user)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--bg-app)] text-[var(--text-main)] px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-7 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-color)] text-black font-bold flex items-center justify-center">
            A
          </div>
          <div>
            <div className="font-display font-bold text-lg">AURA</div>
            <div className="text-xs text-[var(--text-muted)]">Video review thời trang bằng AI</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-surface)] text-sm">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setError(null)
              }}
              className={`py-2 rounded-lg font-semibold ${
                mode === m ? 'bg-[var(--bg-card)] text-[var(--text-main)]' : 'text-[var(--text-muted)]'
              }`}
            >
              {m === 'login' ? 'Đăng nhập' : 'Đăng ký'}
            </button>
          ))}
        </div>

        {mode === 'register' && (
          <label className="block">
            <span className="text-xs text-[var(--text-muted)] block mb-1.5">Tên shop</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </label>
        )}
        <label className="block">
          <span className="text-xs text-[var(--text-muted)] block mb-1.5">Email</span>
          <input
            className={input}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-xs text-[var(--text-muted)] block mb-1.5">Mật khẩu</span>
          <input
            className={input}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {mode === 'register' && <span className="text-[11px] text-[var(--text-muted)]">Ít nhất 8 ký tự</span>}
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

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
  )
}
