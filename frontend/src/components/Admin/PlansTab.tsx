import React, { useCallback, useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import {
  fetchAdminPlans, fetchAdminSubscriptions, saveAdminPlans, type AdminPlanConfig, type AdminPlans, type AdminSubscription,
} from '../../services/api'
import { formatDate, formatNumber, formatVnd } from '../../lib/format'
import { Toggle } from '../Create/Pickers'
import { StatStrip } from '../ui/StatStrip'
import { useToast } from '../ui/toastContext'

const VND_PER_CREDIT = 100
type SubStatus = 'active' | 'pending' | 'expired'
const SUB_TABS: { id: SubStatus; label: string }[] = [
  { id: 'active', label: 'Đang dùng' },
  { id: 'pending', label: 'Chờ thanh toán' },
  { id: 'expired', label: 'Hết hạn' },
]

const yearlyPrice = (price: number, discount: number) => Math.round((price * 12 * (100 - discount)) / 100 / 1000) * 1000
const digits = (v: string) => Number(v.replace(/\D/g, '')) || 0

/** Admin: sửa giá, credit mỗi tháng, số người mẫu riêng của 3 gói, giảm giá trả theo năm; xem các gói đã bán. */
export const PlansTab: React.FC = () => {
  const toast = useToast()
  const [data, setData] = useState<AdminPlans | null>(null)
  const [plans, setPlans] = useState<AdminPlanConfig[]>([])
  const [discount, setDiscount] = useState('20')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<SubStatus>('active')
  const [subs, setSubs] = useState<AdminSubscription[] | null>(null)

  const load = useCallback(() => {
    fetchAdminPlans()
      .then((res) => {
        setData(res)
        setPlans(res.plans)
        setDiscount(String(res.yearly_discount))
      })
      .catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [load])

  useEffect(() => {
    let alive = true
    fetchAdminSubscriptions(tab)
      .then((res) => alive && setSubs(res.items))
      .catch(() => alive && setSubs([]))
    return () => {
      alive = false
    }
  }, [tab])

  const update = (id: string, patch: Partial<AdminPlanConfig>) =>
    setPlans((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const dirty = !!data && (JSON.stringify(plans) !== JSON.stringify(data.plans) || Number(discount) !== data.yearly_discount)

  const save = async () => {
    setError(null)
    setSaving(true)
    try {
      await saveAdminPlans(plans, digits(discount))
      toast('Đã lưu bảng giá gói tháng. Gói đã bán giữ nguyên giá lúc mua.', 'success')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được')
    } finally {
      setSaving(false)
    }
  }

  if (!data) {
    return error ? <p className="text-sm text-[var(--danger-text)]">{error}</p> : <div className="skeleton h-96 rounded-3xl" />
  }

  const pct = digits(discount)
  return (
    <div className="space-y-5 sm:space-y-6">
      <StatStrip
        items={[
          ...data.plans.map((p) => ({
            label: p.name,
            value: formatNumber(data.active_shops[p.id] ?? 0),
            sub: 'shop đang dùng',
          })),
          { label: 'Doanh thu gói tháng này', value: formatVnd(data.revenue_month_vnd), sub: 'tính theo ngày nhận tiền' },
        ]}
      />

      <section className="card p-4 sm:p-6 space-y-5">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="title text-lg">Bảng giá</h2>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">Sửa giá chỉ áp dụng cho lần mua sau, gói đã bán giữ giá và credit lúc mua.</p>
          </div>
          <label className="block w-60">
            <span className="field-label">Giảm giá khi trả theo năm (%)</span>
            <input className="field" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {plans.map((p) => {
            const bonus = p.price_vnd ? Math.round((p.credits_per_month / (p.price_vnd / VND_PER_CREDIT) - 1) * 100) : 0
            return (
              <div key={p.id} className={`rounded-2xl border p-4 space-y-3.5 ${p.active ? 'border-[var(--border-subtle)]' : 'border-dashed border-[var(--border-strong)] opacity-80'}`}>
                <label className="block">
                  <span className="field-label">Tên gói</span>
                  <input className="field" value={p.name} maxLength={40} onChange={(e) => update(p.id, { name: e.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="field-label">Giá mỗi tháng (đ)</span>
                    <input className="field" inputMode="numeric" value={p.price_vnd || ''} onChange={(e) => update(p.id, { price_vnd: digits(e.target.value) })} />
                  </label>
                  <label className="block">
                    <span className="field-label">Credit mỗi tháng</span>
                    <input className="field" inputMode="numeric" value={p.credits_per_month || ''} onChange={(e) => update(p.id, { credits_per_month: digits(e.target.value) })} />
                  </label>
                </div>
                <label className="block">
                  <span className="field-label">Người mẫu riêng tối đa</span>
                  <input className="field" inputMode="numeric" value={String(p.private_models)} onChange={(e) => update(p.id, { private_models: digits(e.target.value) })} />
                </label>
                <label className="block">
                  <span className="field-label">Mô tả ngắn</span>
                  <input className="field" value={p.description} maxLength={120} onChange={(e) => update(p.id, { description: e.target.value })} />
                </label>
                <p className="text-sm text-[var(--text-muted)]">
                  Năm: <strong className="text-[var(--text-main)]">{formatVnd(yearlyPrice(p.price_vnd, pct))}</strong>
                  {bonus > 0 ? `, credit nhiều hơn nạp lẻ ${bonus}%` : bonus < 0 ? `, ít credit hơn nạp lẻ ${-bonus}%` : ''}
                </p>
                <div className="space-y-3 pt-1">
                  <Toggle checked={p.active} onChange={(v) => update(p.id, { active: v })} label="Đang bán" />
                  <Toggle checked={p.highlight} onChange={(v) => update(p.id, { highlight: v })} label="Gắn nhãn Phổ biến" />
                </div>
              </div>
            )
          })}
        </div>

        {error && <p className="text-sm text-[var(--danger-text)]">{error}</p>}
        <div className="flex justify-end gap-2">
          {dirty && (
            <button onClick={() => { setPlans(data.plans); setDiscount(String(data.yearly_discount)) }} disabled={saving} className="btn btn-ghost">
              Bỏ thay đổi
            </button>
          )}
          <button onClick={save} disabled={!dirty || saving} className="btn btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu bảng giá
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="title text-lg">Gói đã bán</h2>
          <div role="tablist" aria-label="Trạng thái gói" className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)]">
            {SUB_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-semibold ${tab === t.id ? 'bg-[var(--bg-card)] shadow-sm' : 'text-[var(--text-muted)]'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {subs === null ? (
          <div className="p-5 space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="skeleton h-10 rounded-xl" />
            ))}
          </div>
        ) : subs.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-[var(--text-muted)]">
            {tab === 'pending' ? 'Không có lệnh mua gói nào đang chờ. Duyệt tay lệnh mua gói ở mục Giao dịch.' : 'Chưa có gói nào.'}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
            {subs.map((s) => (
              <li key={s.id} className="px-4 sm:px-5 py-3.5 grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-1 sm:gap-4 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{s.user_name || s.user_id}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{s.user_email}</p>
                </div>
                <div>
                  <p className="font-medium">
                    {s.plan_name} · {s.cycle === 'yearly' ? '12 tháng' : '1 tháng'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatVnd(s.price_vnd)} · {formatNumber(s.credits_per_month)} credit/tháng
                  </p>
                </div>
                <div className="text-[var(--text-muted)]">
                  {s.starts_at ? (
                    <>
                      <p>
                        {formatDate(s.starts_at)} đến {formatDate(s.expires_at)}
                      </p>
                      <p className="text-xs">
                        Đã cộng credit {s.grants_done}/{s.months} tháng
                      </p>
                    </>
                  ) : (
                    <p>Tạo lúc {formatDate(s.created_at)}, chờ thanh toán</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
