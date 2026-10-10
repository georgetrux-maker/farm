import React, { useEffect, useState } from 'react'
import {
  ArrowRight, Check, Clapperboard, Mic, PlayCircle, Send, Shirt, ShoppingBag, Trash2, UserRound, Zap,
} from 'lucide-react'
import { fetchFeedInfo, fetchPlans, type PlanInfo } from '../../services/api'
import { formatNumber, formatVnd } from '../../lib/format'
import { PhoneMockups } from '../ui/PhoneMockups'
import { Wordmark } from '../ui/Wordmark'

interface LandingViewProps {
  onLogin: () => void
  onRegister: (role: 'shop' | 'buyer') => void
  onOpenFeed: () => void
}

const FEATURES = [
  { icon: Zap, title: 'Auto Mode', text: 'Tải ảnh hoặc dán link Shopee, TikTok Shop. Chọn phong cách và bối cảnh, AI làm phần còn lại.' },
  { icon: Clapperboard, title: 'Pro Studio', text: 'Dựng video nhiều cảnh: mỗi cảnh một bối cảnh, kiểu chuyển động và thời lượng, có hiệu ứng chuyển cảnh.' },
  { icon: UserRound, title: 'Người mẫu AI', text: 'Kho người mẫu nam, nữ có sẵn. Tạo người mẫu riêng từ ảnh của shop khi có quyền dùng ảnh.' },
  { icon: Mic, title: 'Lời review và giọng đọc', text: 'AI viết lời review theo sản phẩm, lồng tiếng Việt, in phụ đề và thẻ tên kèm giá lên video.' },
  { icon: Send, title: 'Đăng TikTok, Facebook', text: 'Kết nối tài khoản rồi đăng video kèm caption và hashtag ngay trong Aura.' },
  { icon: Shirt, title: 'Feed và thử đồ ảo', text: 'Đưa video lên feed của Aura. Khách thử đồ lên ảnh của mình rồi bấm Mua ngay tới trang của shop.' },
]

const STEPS = [
  { title: 'Thêm sản phẩm', text: 'Dán link sản phẩm hoặc tải ảnh lên. Aura kiểm tra ảnh và điền sẵn thông tin.' },
  { title: 'Chọn phong cách', text: 'Người mẫu, bối cảnh, giọng đọc. Muốn nhanh thì để Auto Mode chọn.' },
  { title: 'Nhận video và đăng bán', text: 'Video dọc 9:16 có phụ đề, tải về hoặc đăng thẳng lên mạng xã hội và feed Aura.' },
]

/** Trang giới thiệu công khai: chỉ nói những gì Aura đang làm được. */
export const LandingView: React.FC<LandingViewProps> = ({ onLogin, onRegister, onOpenFeed }) => {
  const [plans, setPlans] = useState<PlanInfo[]>([])
  const [photoHours, setPhotoHours] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    fetchPlans()
      .then((res) => alive && setPlans(res.plans))
      .catch(() => {})
    fetchFeedInfo()
      .then((res) => alive && setPhotoHours(res.photo_hours))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const cheapest = plans.length ? Math.min(...plans.map((p) => p.price_vnd)) : null

  return (
    <div className="flex-1 overflow-y-auto text-[var(--text-main)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-card)_88%,transparent)] backdrop-blur-md">
        <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
          <Wordmark className="text-xl" />
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[var(--text-sub)]" aria-label="Mục trên trang">
            <a href="#tinh-nang" onClick={(e) => { e.preventDefault(); document.getElementById('tinh-nang')?.scrollIntoView({ behavior: 'smooth' }) }} className="hover:text-[var(--text-main)]">
              Tính năng
            </a>
            <a href="#nguoi-mua" onClick={(e) => { e.preventDefault(); document.getElementById('nguoi-mua')?.scrollIntoView({ behavior: 'smooth' }) }} className="hover:text-[var(--text-main)]">
              Cho người mua
            </a>
            <a href="#bang-gia" onClick={(e) => { e.preventDefault(); document.getElementById('bang-gia')?.scrollIntoView({ behavior: 'smooth' }) }} className="hover:text-[var(--text-main)]">
              Bảng giá
            </a>
            <button type="button" onClick={onOpenFeed} className="hover:text-[var(--text-main)]">
              Feed
            </button>
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onLogin} className="btn btn-ghost btn-sm">
              Đăng nhập
            </button>
            <button type="button" onClick={() => onRegister('shop')} className="btn btn-primary btn-sm hidden sm:inline-flex">
              Tạo tài khoản
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Mở đầu */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-12 sm:pb-20 grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-10 lg:gap-14 items-center">
          <div className="animate-fade-up">
            <h1 className="display text-[2.4rem] leading-[1.06] sm:text-6xl">
              Ảnh sản phẩm thành <em className="text-[var(--accent-text)]">video thời trang</em> có người mẫu AI
            </h1>
            <p className="text-lg text-[var(--text-sub)] mt-5 max-w-xl">
              Aura viết lời review, lồng tiếng, gắn phụ đề và giúp shop đăng TikTok, Facebook. Người mua xem video, thử đồ lên ảnh của
              mình rồi bấm mua ở shop.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <button type="button" onClick={() => onRegister('shop')} className="btn btn-primary btn-lg">
                Tạo tài khoản shop <ArrowRight className="w-4 h-4" />
              </button>
              <button type="button" onClick={onOpenFeed} className="btn btn-secondary btn-lg">
                <PlayCircle className="w-4 h-4" /> Xem feed thử đồ
              </button>
            </div>
            {cheapest && (
              <p className="text-sm text-[var(--text-muted)] mt-4">
                Gói tháng từ {formatVnd(cheapest)}, hoặc nạp lẻ từ {formatVnd(10_000)}.
              </p>
            )}
          </div>
          <PhoneMockups className="h-[300px] sm:h-[400px] w-full max-w-xl mx-auto" />
        </section>

        {/* Tính năng */}
        <section id="tinh-nang" className="border-t border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-card)_60%,transparent)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <h2 className="display text-3xl sm:text-4xl max-w-2xl">Mọi thứ shop cần để bán bằng video</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px mt-10 rounded-[1.25rem] overflow-hidden border border-[var(--border-subtle)] bg-[var(--border-subtle)]">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-[var(--bg-card)] p-6">
                  <f.icon className="w-5 h-5 text-[var(--accent-text)]" />
                  <h3 className="title text-lg mt-4">{f.title}</h3>
                  <p className="text-sm text-[var(--text-muted)] mt-1.5 leading-relaxed">{f.text}</p>
                </div>
              ))}
            </div>
            <ol className="grid md:grid-cols-3 gap-6 mt-14">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="w-9 h-9 rounded-[10px] bg-[var(--ink)] text-[var(--on-ink)] font-semibold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-sm text-[var(--text-muted)] mt-1">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Người mua */}
        <section id="nguoi-mua" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="display text-3xl sm:text-4xl">Người mua: xem, thử, rồi mới mua</h2>
            <ul className="mt-6 space-y-3">
              {[
                { icon: PlayCircle, text: 'Xem video thời trang từ các shop trên feed của Aura.' },
                { icon: Shirt, text: 'Thử đồ lên ảnh của bạn, miễn phí với bạn vì shop trả phí lượt thử.' },
                {
                  icon: Trash2,
                  text: `Ảnh của bạn không hiện cho shop hay ai khác và tự xóa sau ${photoHours ?? 24} giờ, xóa sớm hơn cũng được.`,
                },
                { icon: ShoppingBag, text: 'Bấm Mua ngay để tới trang bán của shop (Shopee, TikTok Shop hoặc website).' },
              ].map((b) => (
                <li key={b.text} className="flex gap-3 text-[var(--text-sub)]">
                  <b.icon className="w-5 h-5 shrink-0 mt-0.5 text-[var(--accent-text)]" />
                  {b.text}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3 mt-8">
              <button type="button" onClick={onOpenFeed} className="btn btn-primary btn-lg">
                <PlayCircle className="w-4 h-4" /> Xem feed
              </button>
              <button type="button" onClick={() => onRegister('buyer')} className="btn btn-secondary btn-lg">
                Tạo tài khoản người mua
              </button>
            </div>
          </div>
          <div className="card p-5 sm:p-6 max-w-md w-full mx-auto lg:ml-auto">
            <p className="title text-lg">Thử đồ ảo</p>
            <ol className="mt-4 space-y-4 text-sm">
              {['Bấm “Thử đồ” trên video có biểu tượng chiếc áo', 'Tải ảnh toàn thân của bạn và chọn size', 'Kéo thanh Trước / Sau để so sánh, ưng thì bấm Mua ngay'].map(
                (t, i) => (
                  <li key={t} className="flex gap-3">
                    <span className="w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-text)] text-xs font-semibold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="pt-1 text-[var(--text-sub)]">{t}</span>
                  </li>
                ),
              )}
            </ol>
          </div>
        </section>

        {/* Bảng giá */}
        <section id="bang-gia" className="border-t border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-card)_60%,transparent)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <h2 className="display text-3xl sm:text-4xl">Bảng giá cho shop</h2>
            <p className="text-[var(--text-muted)] mt-3 max-w-2xl">
              Mua gói tháng để có nhiều credit hơn, hoặc nạp lẻ (1 credit = 100đ). Thanh toán bằng VietQR, credit được cộng tự động.
            </p>
            <div className="grid md:grid-cols-3 gap-4 mt-10">
              {(plans.length ? plans : []).map((p) => (
                <article
                  key={p.id}
                  className={`relative flex flex-col rounded-2xl p-6 bg-[var(--bg-card)] ${
                    p.highlight ? 'border-2 border-[var(--accent-color)]' : 'border border-[var(--border-subtle)]'
                  }`}
                >
                  {p.highlight && <span className="tag absolute -top-2.5 left-6">Phổ biến</span>}
                  <h3 className="title text-xl">{p.name}</h3>
                  {p.description && <p className="text-sm text-[var(--text-muted)] mt-1">{p.description}</p>}
                  <p className="mt-5">
                    <span className="text-3xl font-semibold tracking-tight">{formatVnd(p.price_vnd)}</span>
                    <span className="text-sm text-[var(--text-muted)]"> /tháng</span>
                  </p>
                  <ul className="mt-5 space-y-2 text-sm flex-1">
                    {[
                      `${formatNumber(p.credits_per_month)} credit mỗi tháng`,
                      `Khoảng ${formatNumber(p.videos_per_month)} video mỗi tháng`,
                      p.private_models ? `${formatNumber(p.private_models)} người mẫu riêng` : 'Kho người mẫu chung',
                    ].map((t) => (
                      <li key={t} className="flex gap-2">
                        <Check className="w-4 h-4 mt-0.5 shrink-0 text-[var(--accent-text)]" /> {t}
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => onRegister('shop')} className={`btn w-full mt-6 ${p.highlight ? 'btn-primary' : 'btn-secondary'}`}>
                    Bắt đầu
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border-subtle)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-[var(--text-muted)]">
          <Wordmark className="text-base text-[var(--text-main)]" />
          <p>Video có sử dụng hình ảnh do AI tạo.</p>
          <button type="button" onClick={onLogin} className="font-semibold text-[var(--accent-text)]">
            Đăng nhập
          </button>
        </div>
      </footer>
    </div>
  )
}
