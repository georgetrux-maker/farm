import React, { useEffect, useState } from 'react'
import { ChevronDown, Link2, Mail, MessageCircle, Phone, Wallet, Wand2 } from 'lucide-react'
import { fetchStudioOptions, fetchSupportInfo, type SupportInfo } from '../../services/api'
import { formatNumber, formatVnd } from '../../lib/format'
import type { View } from '../../lib/navigation'

interface SupportViewProps {
  onNavigate: (view: View) => void
}

/** Chỉ mở link Zalo dạng http(s) để không chạy "javascript:" do ai đó nhập vào cấu hình */
function safeLink(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

function faqs(cost: number | null) {
  return [
    {
      q: 'Mỗi video tốn bao nhiêu credit?',
      a: cost
        ? `Mỗi video ${formatNumber(cost)} credit (khoảng ${formatVnd(cost * 100)}). Số credit được trừ khi bấm tạo và hoàn lại đầy đủ nếu video bị lỗi.`
        : 'Giá mỗi video hiện ở nút tạo video ở bước 2. Credit được hoàn lại đầy đủ nếu video bị lỗi.',
    },
    {
      q: 'Chuyển khoản xong bao lâu thì được cộng credit?',
      a: 'Thường từ vài giây đến vài phút nếu bạn giữ nguyên số tiền và nội dung chuyển khoản trong mã QR. Quá 15 phút chưa thấy, hãy liên hệ hỗ trợ kèm mã giao dịch (bắt đầu bằng TX) ở trang Ví Credits.',
    },
    {
      q: 'Tôi lỡ ghi sai nội dung chuyển khoản thì sao?',
      a: 'Hệ thống không tự nhận ra được giao dịch. Bạn gửi ảnh chụp biên lai và mã giao dịch cho bộ phận hỗ trợ, quản trị viên sẽ kiểm tra và cộng credit thủ công.',
    },
    {
      q: 'Ảnh sản phẩm thế nào thì video đẹp nhất?',
      a: 'Ảnh rõ nét, đủ sáng, cạnh dài từ 800px; sản phẩm chiếm phần lớn khung hình, nền gọn. Ảnh trải phẳng hoặc mặc trên ma-nơ-canh đều dùng được.',
    },
    {
      q: 'Tôi có sửa được lời thoại AI viết không?',
      a: 'Có. Ở bước 2 “Tùy chỉnh”, phần Kịch bản xem trước cho phép sửa từng câu trước khi tạo video. AI đọc đúng nguyên văn bạn sửa.',
    },
    {
      q: 'Làm sao đăng video thẳng lên TikTok, Facebook?',
      a: 'Vào Kênh liên kết để kết nối tài khoản một lần. Sau đó ở trang kết quả hoặc Video của tôi, bấm Đăng TikTok / Đăng Facebook.',
    },
  ]
}

/** Hỗ trợ: liên hệ (do quản trị viên cài trong Cài đặt API) và câu hỏi thường gặp. */
export const SupportView: React.FC<SupportViewProps> = ({ onNavigate }) => {
  const [info, setInfo] = useState<SupportInfo | null>(null)
  const [cost, setCost] = useState<number | null>(null)
  const [open, setOpen] = useState(0)

  useEffect(() => {
    fetchSupportInfo()
      .then(setInfo)
      .catch(() => setInfo({ hotline: '', zalo: '', email: '' }))
    fetchStudioOptions()
      .then((o) => setCost(o.pipeline_cost_credits))
      .catch(() => {})
  }, [])

  const zalo = info?.zalo ? safeLink(info.zalo) : null
  const contacts = [
    {
      icon: Phone,
      label: 'Hotline',
      value: info?.hotline,
      href: info?.hotline ? `tel:${info.hotline.replace(/[^\d+]/g, '')}` : null,
      hint: 'Bấm để gọi',
    },
    { icon: MessageCircle, label: 'Zalo', value: info?.zalo ? 'Nhắn tin qua Zalo' : '', href: zalo, hint: 'Gửi ảnh biên lai, mã giao dịch' },
    { icon: Mail, label: 'Email', value: info?.email, href: info?.email ? `mailto:${info.email}` : null, hint: 'Kèm mã giao dịch nếu hỏi về nạp tiền' },
  ]
  const noContact = info && !info.hotline && !info.zalo && !info.email

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6">
        <div>
          <p className="eyebrow">Trợ giúp</p>
          <h1 className="display text-3xl sm:text-4xl mt-1.5">Hỗ trợ</h1>
          <p className="text-[var(--text-muted)] mt-2">Cần giúp đỡ? Liên hệ trực tiếp hoặc xem các câu hỏi thường gặp bên dưới.</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 sm:gap-4">
          {contacts.map((c) => {
            const Icon = c.icon
            const body = (
              <>
                <span className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-text)] flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-[var(--text-muted)]">{c.label}</p>
                  <p className="font-semibold truncate">{info ? c.value || 'Chưa cập nhật' : '…'}</p>
                  {c.value && <p className="text-xs text-[var(--text-muted)] mt-0.5">{c.hint}</p>}
                </div>
              </>
            )
            return c.href ? (
              <a
                key={c.label}
                href={c.href}
                target={c.label === 'Zalo' ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="card p-4 sm:p-5 flex items-center gap-3.5 hover:border-[var(--accent-border)] transition-colors"
              >
                {body}
              </a>
            ) : (
              <div key={c.label} className="card p-4 sm:p-5 flex items-center gap-3.5">
                {body}
              </div>
            )
          })}
        </div>
        {noContact && (
          <p className="text-sm text-[var(--text-muted)]">
            Quản trị viên chưa cài thông tin liên hệ (Quản trị hệ thống → Cài đặt API → Hỗ trợ).
          </p>
        )}

        <section className="card p-2 sm:p-3">
          <h2 className="display text-xl px-3 sm:px-4 pt-3 pb-2">Câu hỏi thường gặp</h2>
          <ul>
            {faqs(cost).map((f, i) => {
              const expanded = open === i
              return (
                <li key={f.q} className="border-t border-[var(--border-subtle)] first:border-0">
                  <button
                    onClick={() => setOpen(expanded ? -1 : i)}
                    aria-expanded={expanded}
                    className="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-3.5 text-left font-medium hover:text-[var(--accent-text)]"
                  >
                    {f.q}
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                  {expanded && <p className="px-3 sm:px-4 pb-4 -mt-1 text-sm text-[var(--text-sub)] animate-fade-in">{f.a}</p>}
                </li>
              )
            })}
          </ul>
        </section>

        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { icon: Wand2, label: 'Tạo video mới', view: 'create' as View },
            { icon: Link2, label: 'Kết nối TikTok, Facebook', view: 'connect' as View },
            { icon: Wallet, label: 'Nạp credit', view: 'wallet' as View },
          ].map((l) => (
            <button key={l.label} onClick={() => onNavigate(l.view)} className="btn btn-secondary justify-start">
              <l.icon className="w-4 h-4" /> {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
