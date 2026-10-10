import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, KeyRound, Loader2, RotateCcw, Save, XCircle, Zap } from 'lucide-react'
import {
  fetchAdminSettings, saveAdminSettings, testProvider,
  type AdminSetting, type AdminSettings, type ProviderCheck, type ProviderId,
} from '../../services/api'
import { useToast } from '../ui/toastContext'

type Edits = Record<string, string | boolean | null>
type EditValue = string | boolean | null | undefined

const SECTIONS: { id: string; tab: string; title: string; note: string; providers: { id: string; name: string; testable: boolean }[] }[] = [
  {
    id: 'ai',
    tab: 'AI',
    title: 'Trí tuệ nhân tạo',
    note: 'Để trống thì app dùng engine tạm miễn phí cho bước đó.',
    providers: [
      { id: 'anthropic', name: 'Claude: phân tích ảnh, viết kịch bản', testable: true },
      { id: 'fashn', name: 'FASHN: thử đồ lên người mẫu', testable: true },
      { id: 'replicate', name: 'Replicate (Kling): video chuyển động', testable: true },
    ],
  },
  {
    id: 'payment',
    tab: 'Thanh toán',
    title: 'Thanh toán',
    note: 'Khách quét mã VietQR, SePay báo tiền về thì credit tự cộng.',
    providers: [
      { id: 'vietqr', name: 'Tài khoản nhận tiền VietQR', testable: false },
      { id: 'sepay', name: 'Webhook SePay', testable: true },
    ],
  },
  {
    id: 'social',
    tab: 'Mạng xã hội',
    title: 'Mạng xã hội',
    note: 'Cần app được TikTok/Facebook duyệt để đăng công khai.',
    providers: [
      { id: 'tiktok', name: 'TikTok', testable: true },
      { id: 'facebook', name: 'Facebook Reels', testable: true },
    ],
  },
  {
    id: 'pricing',
    tab: 'Giá & tài khoản',
    title: 'Giá & tài khoản',
    note: '1 credit = 100đ.',
    providers: [
      { id: 'pricing', name: 'Chính sách giá', testable: false },
      { id: 'other', name: 'Đăng ký tài khoản', testable: false },
    ],
  },
  {
    id: 'support',
    tab: 'Hỗ trợ',
    title: 'Liên hệ hỗ trợ',
    note: 'Hiện ở trang Hỗ trợ của shop. Để trống mục nào thì ẩn mục đó.',
    providers: [{ id: 'support', name: 'Kênh liên hệ', testable: false }],
  },
]
const NO_STATUS = new Set(['pricing', 'other', 'support'])

const SOURCE_TEXT: Record<AdminSetting['source'], string> = {
  admin: 'Đã lưu trong Admin',
  env: 'Đang lấy từ file .env',
  default: 'Giá trị mặc định',
  none: 'Chưa có',
}

const CHECK_STYLE: Record<ProviderCheck['status'], { icon: React.ElementType; cls: string }> = {
  ok: { icon: CheckCircle2, cls: 'bg-[var(--ok-bg)] text-[var(--ok-text)] border-[var(--ok-border)]' },
  info: { icon: Info, cls: 'bg-[var(--bg-surface)] text-[var(--text-sub)] border-[var(--border-subtle)]' },
  no_credit: { icon: AlertTriangle, cls: 'bg-[var(--warn-bg)] text-[var(--warn-text)] border-[var(--warn-border)]' },
  not_configured: { icon: AlertTriangle, cls: 'bg-[var(--warn-bg)] text-[var(--warn-text)] border-[var(--warn-border)]' },
  invalid_key: { icon: XCircle, cls: 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]' },
  error: { icon: XCircle, cls: 'bg-[var(--danger-bg)] text-[var(--danger-text)] border-[var(--danger-border)]' },
}

/** Một ô cấu hình. Key bí mật không bao giờ hiện nguyên văn: để trống = giữ key đang dùng. */
const SettingField: React.FC<{
  s: AdminSetting
  edit: EditValue
  onEdit: (value: EditValue) => void
}> = ({ s, edit, onEdit }) => {
  const id = `setting-${s.key}`
  const changed = edit !== undefined
  const clearing = edit === null

  // Công tắc bật/tắt (vd tắt Claude để dùng mẫu câu miễn phí): bấm lại về giá trị cũ thì coi như chưa sửa
  if (s.kind === 'bool') {
    const saved = s.value === true
    const on = typeof edit === 'boolean' ? edit : saved
    return (
      <div className="sm:col-span-2 flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{s.label}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {changed ? 'Đã sửa, chưa lưu' : `${on ? 'Đang bật' : 'Đang tắt'} · ${SOURCE_TEXT[s.source]}`}
            {s.hint ? ` · ${s.hint}` : ''}
          </p>
        </div>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={s.label}
          onClick={() => onEdit(!on === saved ? undefined : !on)}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
            on ? 'bg-[var(--accent-color)]' : 'bg-[var(--border-strong)]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
              on ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>
    )
  }
  const current = s.value === null || s.value === undefined ? '' : String(s.value)
  const shown = clearing ? '' : changed ? String(edit ?? '') : s.kind === 'secret' ? '' : current

  let input: React.ReactNode
  if (s.kind === 'choice' && s.options) {
    input = (
      <select id={id} className="field" value={shown} onChange={(e) => onEdit(e.target.value === current ? undefined : e.target.value)}>
        {!s.options.includes(current) && <option value={current}>{current || 'Chọn...'}</option>}
        {s.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  } else {
    input = (
      <input
        id={id}
        className={`field ${s.kind === 'secret' || s.kind === 'text' ? 'font-mono text-sm' : ''}`}
        type={s.kind === 'secret' ? 'password' : s.kind === 'int' ? 'number' : 'text'}
        inputMode={s.kind === 'int' ? 'numeric' : undefined}
        min={s.min}
        max={s.max}
        autoComplete="off"
        spellCheck={false}
        value={shown}
        placeholder={s.kind === 'secret' ? (s.configured ? `${s.value} (để trống = giữ nguyên)` : s.placeholder || 'Chưa có') : s.placeholder}
        onChange={(e) => {
          const v = e.target.value
          if (s.kind === 'secret') onEdit(v ? v : undefined)
          else onEdit(v === current ? undefined : v)
        }}
      />
    )
  }

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="field-label flex items-center justify-between gap-2">
        <span>{s.label}</span>
        <span className={`text-[11px] font-medium ${changed ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)]'}`}>
          {clearing ? 'Sẽ xóa, dùng lại .env' : changed ? 'Đã sửa, chưa lưu' : SOURCE_TEXT[s.source]}
        </span>
      </label>
      {input}
      <div className="flex items-start justify-between gap-3 mt-1.5">
        <p className="text-xs text-[var(--text-muted)]">{s.hint}</p>
        {s.source === 'admin' && !clearing && (
          <button type="button" onClick={() => onEdit(null)} className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--danger-text)] shrink-0">
            Xóa giá trị đã lưu
          </button>
        )}
        {clearing && (
          <button type="button" onClick={() => onEdit(undefined)} className="text-xs font-semibold text-[var(--accent-text)] shrink-0">
            Giữ lại
          </button>
        )}
      </div>
    </div>
  )
}

export const SettingsTab: React.FC = () => {
  const toast = useToast()
  const [data, setData] = useState<AdminSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [edits, setEdits] = useState<Edits>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [checks, setChecks] = useState<Record<string, ProviderCheck>>({})
  const [tab, setTab] = useState(SECTIONS[0].id)

  const load = useCallback(() => {
    setError(null)
    fetchAdminSettings()
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [load])

  const byProvider = useMemo(() => {
    const map: Record<string, AdminSetting[]> = {}
    for (const s of data?.settings ?? []) (map[s.provider] ??= []).push(s)
    return map
  }, [data])

  const changedCount = Object.keys(edits).length

  const setEdit = (key: string, value: EditValue) =>
    setEdits((prev) => {
      const next = { ...prev }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })

  const save = async () => {
    setSaving(true)
    try {
      const res = await saveAdminSettings(edits)
      setData((d) => (d ? { ...d, settings: res.settings } : d))
      setEdits({})
      setChecks({})
      toast(res.message, 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const runCheck = async (provider: string) => {
    const typed: Record<string, string> = {}
    for (const s of byProvider[provider] ?? []) {
      const v = edits[s.key]
      if (typeof v === 'string' && v) typed[s.key] = v
    }
    setTesting(provider)
    try {
      const res = await testProvider(provider as ProviderId, typed)
      setChecks((c) => ({ ...c, [provider]: res }))
    } catch (e: any) {
      setChecks((c) => ({ ...c, [provider]: { ok: false, status: 'error', message: e.message } }))
    } finally {
      setTesting(null)
    }
  }

  if (error) {
    return (
      <p className="text-sm text-[var(--danger-text)]">
        {error}{' '}
        <button onClick={load} className="underline font-semibold">
          Thử lại
        </button>
      </p>
    )
  }
  if (!data) return <div className="skeleton h-96 rounded-3xl" />

  return (
    <div className="space-y-6 animate-fade-up pb-24">
      {!data.secret_key_ready && (
        <div className="card p-4 flex gap-3 border-[var(--warn-border)] bg-[var(--warn-bg)] text-[var(--warn-text)]">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            Máy chủ chưa có <code className="font-mono">APP_SECRET_KEY</code> (ít nhất 32 ký tự) trong <code className="font-mono">backend/.env</code>,
            nên chưa mã hóa và lưu được cấu hình. Thêm biến này rồi khởi động lại máy chủ. Các giá trị đang dùng vẫn đọc từ file .env.
          </p>
        </div>
      )}
      <p className="text-sm text-[var(--text-muted)] max-w-3xl flex gap-2">
        <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
        Key được mã hóa trước khi lưu. Giá trị lưu ở đây được ưu tiên hơn file .env; bấm “Xóa giá trị đã lưu” để quay về .env.
        Nút “Kiểm tra” thử luôn key vừa gõ, chưa cần lưu.
      </p>

      <div className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)] overflow-x-auto no-scrollbar w-full sm:w-fit" role="tablist">
        {SECTIONS.map((section) => {
          const keys = new Set(section.providers.flatMap((p) => (byProvider[p.id] ?? []).map((f) => f.key)))
          const dirty = Object.keys(edits).some((k) => keys.has(k))
          return (
            <button
              key={section.id}
              role="tab"
              aria-selected={tab === section.id}
              onClick={() => setTab(section.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                tab === section.id ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
              }`}
            >
              {section.tab}
              {dirty && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]" aria-label="có thay đổi chưa lưu" />}
            </button>
          )
        })}
      </div>

      {SECTIONS.filter((section) => section.id === tab).map((section) => (
        <section key={section.title} className="card p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="title text-lg">{section.title}</h2>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">{section.note}</p>
          </div>
          {section.providers.map((p) => {
            const fields = byProvider[p.id] ?? []
            const configured = fields.filter((f) => f.kind === 'secret' || f.kind === 'text').every((f) => f.configured)
            const switchField = fields.find((f) => f.kind === 'bool' && f.key.endsWith('_enabled'))
            const switchedOff = switchField && (typeof edits[switchField.key] === 'boolean' ? edits[switchField.key] === false : switchField.value === false)
            const check = checks[p.id]
            const CheckIcon = check ? CHECK_STYLE[check.status].icon : null
            return (
              <div key={p.id} className="rounded-2xl bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <h3 className="font-semibold">{p.name}</h3>
                    {!NO_STATUS.has(p.id) && (
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          switchedOff
                            ? 'bg-[var(--bg-card)] text-[var(--text-muted)]'
                            : configured
                              ? 'bg-[var(--ok-bg)] text-[var(--ok-text)]'
                              : 'bg-[var(--bg-card)] text-[var(--text-muted)]'
                        }`}
                      >
                        {switchedOff ? 'Đang tắt' : configured ? 'Đã cấu hình' : 'Chưa cấu hình'}
                      </span>
                    )}
                  </div>
                  {p.testable && (
                    <button type="button" onClick={() => runCheck(p.id)} disabled={testing !== null} className="btn btn-secondary btn-sm">
                      {testing === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      Kiểm tra kết nối
                    </button>
                  )}
                </div>
                {check && CheckIcon && (
                  <div className={`flex gap-2 items-start text-sm rounded-xl border px-3 py-2.5 ${CHECK_STYLE[check.status].cls}`} role="status">
                    <CheckIcon className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="break-words min-w-0">{check.message}</span>
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  {fields.map((s) => (
                    <SettingField key={s.key} s={s} edit={edits[s.key]} onEdit={(v) => setEdit(s.key, v)} />
                  ))}
                </div>
              </div>
            )
          })}
        </section>
      ))}

      {/* Thanh lưu ghim ở đáy màn hình (portal ra body vì khung cha có hiệu ứng transform): chỉ hiện khi có thay đổi */}
      {changedCount > 0 && createPortal(
        <div className="fixed inset-x-0 bottom-0 z-30 pb-[calc(env(safe-area-inset-bottom)+4.5rem)] lg:pb-4 px-4 pointer-events-none animate-sheet-up">
          <div className="max-w-3xl mx-auto card shadow-[var(--shadow-pop)] p-3 sm:p-4 flex items-center justify-between gap-3 pointer-events-auto">
            <span className="text-sm font-semibold">{changedCount} mục đã sửa</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEdits({})} className="btn btn-ghost btn-sm" disabled={saving}>
                <RotateCcw className="w-3.5 h-3.5" /> Hoàn tác
              </button>
              <button type="button" onClick={save} className="btn btn-primary btn-sm" disabled={saving || !data.secret_key_ready}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu thay đổi
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
