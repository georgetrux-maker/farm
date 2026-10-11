import React, { useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { fetchPlans, subscribePlan, type DepositInfo, type PlansResponse } from '../../services/api'
import { formatDate, formatNumber, formatVnd } from '../../lib/format'

type Cycle = 'monthly' | 'yearly'

interface PlansSectionProps {
  /** Đang có mã QR chờ thanh toán (nạp hoặc mua gói): tạm khóa nút mua */
  pending: DepositInfo | null
  onCreated: (payment: DepositInfo) => void
  /** Số dư đổi (vừa kích hoạt gói, được cộng credit tháng mới): tải lại trạng thái gói */
  credits: number
}

/** Gói tháng Starter / Professional / Business: trả theo tháng hoặc theo năm (giảm giá), thanh toán VietQR. */
export const PlansSection: React.FC<PlansSectionProps> = ({ pending, onCreated, credits }) => {
  const [data, setData] = useState<PlansResponse | null>(null)
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchPlans()
      .then((res) => alive && setData(res))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Không tải được bảng giá'))
    return () => {
      alive = false
    }
  }, [credits, pending])

  const buy = async (planId: string) => {
    setError(null)
    setBuying(planId)
    try {
      onCreated(await subscribePlan(planId, cycle))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được mã thanh toán')
    } finally {
      setBuying(null)
    }
  }

  const status = data?.status
  const current = status?.current ?? null
  const upcoming = status?.upcoming ?? []
  const discount = data?.yearly_discount ?? 0

  return (
    <section className="card p-4 sm:p-6" aria-labelledby="plans-title">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div>
          <h2 id="plans-title" className="title text-lg">
            Gói tháng
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Nhiều credit hơn nạp lẻ, cộng vào ví đầu mỗi tháng. Gói không tự gia hạn, Aura nhắc bạn {data?.remind_days ?? 3} ngày
            trước khi hết hạn.
          </p>
        </div>
        <div role="tablist" aria-label="Chu kỳ thanh toán" className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)] shrink-0">
          {(
            [
              { id: 'monthly', label: 'Theo tháng' },
              { id: 'yearly', label: discount ? `Theo năm, giảm ${discount}%` : 'Theo năm' },
            ] as const
          ).map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={cycle === c.id}
              onClick={() => setCycle(c.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
                cycle === c.id ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {current && (
        <div
          className={`mt-4 flex gap-2.5 items-start text-sm px-4 py-3 rounded-2xl border ${
            status?.renew_reminder
              ? 'border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn-text)]'
              : 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
          }`}
        >
          {status?.renew_reminder ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <Check className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent-text)]" />}
          <p>
            Đang dùng gói <strong>{current.plan_name}</strong> ({current.cycle === 'yearly' ? 'trả theo năm' : 'trả theo tháng'}), hết hạn{' '}
            <strong>{formatDate(current.expires_at)}</strong>
            {status?.days_left !== null && status?.days_left !== undefined && !upcoming.length ? `, còn ${status.days_left} ngày` : ''}.
            {current.next_credit_at && <> Credit tháng tới được cộng ngày {formatDate(current.next_credit_at)}.</>}
            {upcoming.map((u) => (
              <span key={u.id} className="block mt-0.5">
                Đã mua tiếp gói {u.plan_name}, bắt đầu ngày {formatDate(u.starts_at)}.
              </span>
            ))}
            {status?.renew_reminder && <span className="block mt-0.5 font-semibold">Gia hạn để tiếp tục nhận credit hằng tháng.</span>}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-[var(--danger-text)] mt-3">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-3 sm:gap-4 mt-5">
        {!data
          ? [0, 1, 2].map((i) => <div key={i} className="skeleton rounded-2xl h-72" />)
          : data.plans.map((p) => {
              const yearly = cycle === 'yearly'
              const isCurrent = current?.plan_id === p.id
              const cta = isCurrent ? 'Gia hạn' : current ? 'Đổi sang gói này' : 'Chọn gói'
              return (
                <article
                  key={p.id}
                  className={`relative flex flex-col rounded-2xl border p-5 ${
                    p.highlight ? 'border-[var(--accent-color)] border-2 bg-[var(--accent-soft)]' : 'border-[var(--border-subtle)]'
                  }`}
                >
                  {p.highlight && <span className="tag absolute -top-2.5 left-5">Phổ biến</span>}
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="title text-lg">{p.name}</h3>
                    {isCurrent && <span className="text-xs font-semibold text-[var(--accent-text)]">Đang dùng</span>}
                  </div>
                  {p.description && <p className="text-sm text-[var(--text-muted)] mt-1">{p.description}</p>}
                  <div className="mt-4">
                    <span className="text-3xl font-semibold tracking-tight tabular-nums">
                      {formatVnd(yearly ? p.yearly_monthly_vnd : p.price_vnd)}
                    </span>
                    <span className="text-sm text-[var(--text-muted)]"> /tháng</span>
                  </div>
                  <p className="text-sm text-[var(--text-muted)] mt-1 min-h-[1.25rem]">
                    {yearly ? (
                      <>
                        Trả {formatVnd(p.yearly_price_vnd)} mỗi năm{' '}
                        <span className="line-through">{formatVnd(p.price_vnd * 12)}</span>
                      </>
                    ) : (
                      'Trả từng tháng'
                    )}
                  </p>
                  <ul className="mt-4 space-y-2 text-sm flex-1">
                    <li className="flex gap-2">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent-text)]" />
                      <span>
                        <strong>{formatNumber(p.credits_per_month)} credit</strong> mỗi tháng
                        {p.bonus_percent > 0 && <span className="text-[var(--text-muted)]">, nhiều hơn {p.bonus_percent}% so với nạp lẻ</span>}
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent-text)]" />
                      <span>Khoảng {formatNumber(p.videos_per_month)} video mỗi tháng</span>
                    </li>
                    <li className="flex gap-2">
                      <Check className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent-text)]" />
                      <span>{p.private_models > 0 ? `${formatNumber(p.private_models)} người mẫu riêng` : 'Dùng kho người mẫu chung'}</span>
                    </li>
                    {yearly && (
                      <li className="flex gap-2">
                        <Check className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent-text)]" />
                        <span>Credit vẫn cộng từng tháng, đủ 12 tháng</span>
                      </li>
                    )}
                  </ul>
                  <button
                    onClick={() => buy(p.id)}
                    disabled={!!pending || buying !== null}
                    className={`btn w-full mt-5 ${p.highlight || isCurrent ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {buying === p.id && <Loader2 className="w-4 h-4 animate-spin" />}
                    {cta} · {formatVnd(yearly ? p.yearly_price_vnd : p.price_vnd)}
                  </button>
                  {current && !isCurrent && (
                    <p className="text-xs text-[var(--text-muted)] mt-2 text-center">Bắt đầu khi gói hiện tại hết hạn</p>
                  )}
                </article>
              )
            })}
      </div>
      {pending && <p className="text-sm text-[var(--text-muted)] mt-3">Bạn đang có một mã QR chờ thanh toán ở bên dưới.</p>}
    </section>
  )
}
