import React, { useEffect, useState } from 'react'
import type { AccountRole, UserProfile } from '../../services/api'
import { LoginView } from '../Auth/LoginView'
import { FeedView } from '../Feed/FeedView'
import { Wordmark } from '../ui/Wordmark'
import { LandingView } from './LandingView'

type Page = { name: 'landing' } | { name: 'feed'; id: string | null } | { name: 'login' } | { name: 'register'; role: AccountRole }

/** "#feed/JOB_1", "#dang-nhap", "#dang-ky", "#dang-ky-nguoi-mua"; còn lại là trang giới thiệu */
function parsePublicHash(hash: string): Page {
  const [head, id] = hash.replace(/^#\/?/, '').split('/')
  if (head === 'feed') return { name: 'feed', id: id ? decodeURIComponent(id) : null }
  if (head === 'dang-nhap') return { name: 'login' }
  if (head === 'dang-ky') return { name: 'register', role: 'shop' }
  if (head === 'dang-ky-nguoi-mua') return { name: 'register', role: 'buyer' }
  return { name: 'landing' }
}

/** Phần dành cho khách chưa đăng nhập: trang giới thiệu, feed công khai, đăng nhập/đăng ký. */
export const PublicApp: React.FC<{ onLoggedIn: (user: UserProfile, isNew: boolean) => void }> = ({ onLoggedIn }) => {
  const [page, setPage] = useState<Page>(() => parsePublicHash(window.location.hash))
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const onHash = () => setPage(parsePublicHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (hash: string, message: string | null = null) => {
    setNotice(message)
    window.location.hash = hash
    window.scrollTo({ top: 0 })
  }
  // Sau khi đăng ký từ feed thì quay lại đúng video đang xem
  const returnToFeed = page.name === 'feed' ? (page.id ? `feed/${encodeURIComponent(page.id)}` : 'feed') : null

  if (page.name === 'feed') {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <header className="h-14 shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 flex items-center justify-between gap-3 text-[var(--text-main)]">
          <button type="button" onClick={() => go('')} aria-label="Aura, trang giới thiệu">
            <Wordmark className="text-xl" />
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => go('dang-nhap')} className="btn btn-ghost btn-sm">
              Đăng nhập
            </button>
            <button type="button" onClick={() => go('dang-ky-nguoi-mua')} className="btn btn-primary btn-sm">
              Tạo tài khoản
            </button>
          </div>
        </header>
        <main id="noi-dung" className="flex-1 min-h-0 flex">
          <FeedView
            user={null}
            startId={page.id}
            onRequireLogin={(reason) => {
              try {
                sessionStorage.setItem('aura_after_login', returnToFeed ?? 'feed')
              } catch {
                // không lưu được thì sau khi đăng nhập về trang mặc định
              }
              go('dang-ky-nguoi-mua', `${reason}. Tạo tài khoản người mua miễn phí, hoặc đăng nhập nếu bạn đã có.`)
            }}
          />
        </main>
      </div>
    )
  }

  if (page.name === 'login' || page.name === 'register') {
    return (
      <LoginView
        key={page.name === 'register' ? `register-${page.role}` : 'login'}
        initialMode={page.name}
        initialRole={page.name === 'register' ? page.role : 'shop'}
        notice={notice}
        onBack={() => go('')}
        onLoggedIn={(user, isNew) => {
          let next: string | null = null
          try {
            next = sessionStorage.getItem('aura_after_login')
            sessionStorage.removeItem('aura_after_login')
          } catch {
            next = null
          }
          window.location.hash = next ?? (user.role === 'buyer' ? 'feed' : 'home')
          onLoggedIn(user, isNew)
        }}
      />
    )
  }

  return (
    <LandingView
      onLogin={() => go('dang-nhap')}
      onRegister={(role) => go(role === 'buyer' ? 'dang-ky-nguoi-mua' : 'dang-ky')}
      onOpenFeed={() => go('feed')}
    />
  )
}
