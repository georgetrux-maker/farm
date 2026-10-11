import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Pencil, Plus, ShieldCheck, Trash2, Wand2 } from 'lucide-react'
import {
  createPrivateModel, deletePrivateModel, fetchAvatars, fetchModelQuota, updatePrivateModel, uploadImage,
} from '../../services/api'
import type { BrandAvatar, Region } from '../../types'
import { invalidateStudioLabels } from '../../lib/useStudioLabels'
import { AvatarImage } from '../ui/AvatarImage'
import { Modal } from '../ui/Modal'
import { RegionField } from '../ui/RegionField'
import { useToast } from '../ui/toastContext'

interface ModelsViewProps {
  onUseModel: (avatarId: string) => void
}

type Tab = 'all' | 'female' | 'male' | 'asia' | 'europe' | 'mine'
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'female', label: 'Nữ' },
  { id: 'male', label: 'Nam' },
  { id: 'asia', label: 'Châu Á' },
  { id: 'europe', label: 'Châu Âu' },
  { id: 'mine', label: 'Mẫu của tôi' },
]

const EMPTY = {
  name: '', style: '', gender: 'female' as 'female' | 'male', region: '' as Region | '', height: '', weight: '', measurements: '', avatar_url: '',
}
/** Người mẫu có thuộc tab này không */
const inTab = (a: BrandAvatar, t: Tab) =>
  t === 'all' ? true : t === 'mine' ? !!a.mine : t === 'asia' || t === 'europe' ? a.region === t : genderOf(a) === t
const genderOf = (a: BrandAvatar) => a.gender ?? 'female'

/** Kho người mẫu AI cho shop: xem mẫu dùng chung, tạo người mẫu riêng từ ảnh của mình (cam kết có quyền dùng ảnh). */
export const ModelsView: React.FC<ModelsViewProps> = ({ onUseModel }) => {
  const toast = useToast()
  const [avatars, setAvatars] = useState<BrandAvatar[] | null>(null)
  const [quota, setQuota] = useState<{ used: number; limit: number; consent_text: string } | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [editing, setEditing] = useState<BrandAvatar | 'new' | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<'upload' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<BrandAvatar | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetchAvatars()
      .then(setAvatars)
      .catch((e) => toast(e.message, 'error'))
    fetchModelQuota()
      .then(setQuota)
      .catch(() => {})
  }, [toast])

  useEffect(() => {
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [load])

  const shown = (avatars ?? []).filter((a) => inTab(a, tab))
  const count = (t: Tab) => (avatars ?? []).filter((a) => inTab(a, t)).length
  const canCreate = quota ? quota.used < quota.limit : false

  const openNew = () => {
    setForm(EMPTY)
    setConsent(false)
    setError(null)
    setEditing('new')
  }
  const openEdit = (a: BrandAvatar) => {
    setForm({ name: a.name, style: a.style, gender: genderOf(a), region: a.region ?? '', height: a.height, weight: a.weight, measurements: a.measurements, avatar_url: a.avatar_url })
    setError(null)
    setEditing(a)
  }

  const upload = async (file: File) => {
    setBusy('upload')
    setError(null)
    try {
      const res = await uploadImage(file)
      if (res.height < res.width) setError('Nên dùng ảnh dọc, thấy toàn thân người mẫu để thử đồ đẹp hơn.')
      setForm((f) => ({ ...f, avatar_url: res.media_url }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được ảnh')
    } finally {
      setBusy(null)
    }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim() || !form.style.trim()) return setError('Vui lòng nhập tên và phong cách')
    const info = {
      name: form.name.trim(), style: form.style.trim(), gender: form.gender, region: form.region || undefined,
      height: form.height.trim(), weight: form.weight.trim(), measurements: form.measurements.trim(),
    }
    setBusy('save')
    try {
      if (editing === 'new') {
        if (!form.avatar_url) throw new Error('Vui lòng tải ảnh toàn thân của người mẫu')
        if (!consent) throw new Error('Bạn cần xác nhận có quyền sử dụng hình ảnh người này')
        await createPrivateModel({ ...info, avatar_url: form.avatar_url, consent: true })
        toast(`Đã tạo người mẫu ${info.name}. Chỉ shop của bạn thấy mẫu này.`, 'success')
      } else if (editing) {
        await updatePrivateModel(editing.id, info)
        toast(`Đã lưu ${info.name}`, 'success')
      }
      invalidateStudioLabels()
      setEditing(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được')
    } finally {
      setBusy(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await deletePrivateModel(deleting.id)
      toast(`Đã xóa ${deleting.name}. Video đã tạo vẫn giữ nguyên.`, 'success')
      invalidateStudioLabels()
      setDeleting(null)
      load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không xóa được', 'error')
    }
  }

  const set = (k: 'name' | 'style' | 'height' | 'weight' | 'measurements') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="flex-1 h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-5 sm:space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="display text-3xl sm:text-4xl">Người mẫu AI</h1>
            <p className="text-[var(--text-muted)] mt-2">Kho người mẫu cho video của bạn, kể cả người mẫu riêng chỉ shop bạn dùng.</p>
          </div>
          <div className="flex items-center gap-3">
            {quota && quota.limit > 0 && (
              <span className="text-sm text-[var(--text-muted)]">
                Mẫu riêng: {quota.used}/{quota.limit}
              </span>
            )}
            {quota && quota.limit > 0 && (
              <button onClick={openNew} disabled={!canCreate} className="btn btn-primary" title={canCreate ? undefined : 'Đã dùng hết số người mẫu riêng'}>
                <Plus className="w-4 h-4" /> Tạo mẫu riêng
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)] overflow-x-auto no-scrollbar w-fit max-w-full" role="tablist">
          {TABS.filter((t) => (t.id !== 'asia' && t.id !== 'europe') || count(t.id) > 0).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                tab === t.id ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
              }`}
            >
              {t.label}
              <span className="text-xs tabular-nums opacity-70">{count(t.id)}</span>
            </button>
          ))}
        </div>

        {!avatars ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="skeleton rounded-2xl aspect-[3/4]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-6">
            {shown.map((a, i) => (
              <article key={a.id} className="group flex flex-col animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                <button onClick={() => onUseModel(a.id)} className="relative rounded-2xl overflow-hidden" aria-label={`Tạo video với ${a.name}`}>
                  <AvatarImage src={a.avatar_url} name={a.name} className="w-full aspect-[3/4] transition-transform duration-700 group-hover:scale-[1.04]" />
                </button>
                <div className="pt-2.5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="font-semibold leading-snug truncate">{a.name}</h3>
                    {a.mine && (
                      <div className="flex -mr-1.5 shrink-0">
                        <button onClick={() => openEdit(a)} className="icon-btn w-8 h-8" aria-label={`Sửa ${a.name}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleting(a)} className="icon-btn w-8 h-8 hover:text-[var(--danger-text)]" aria-label={`Xóa ${a.name}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-[var(--text-muted)] truncate">{a.style}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 mb-2.5">
                    <span className="inline-flex px-1.5 py-0.5 rounded-md border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-sub)]">
                      {genderOf(a) === 'male' ? 'Nam' : 'Nữ'}
                    </span>
                    {a.mine && <span className="tag">Mẫu riêng</span>}
                  </div>
                  <button onClick={() => onUseModel(a.id)} className="btn btn-secondary btn-sm mt-auto">
                    <Wand2 className="w-3.5 h-3.5" /> Dùng mẫu này
                  </button>
                </div>
              </article>
            ))}
            {canCreate && (tab === 'all' || tab === 'mine') && (
              <button
                onClick={openNew}
                className="aspect-[3/4] rounded-2xl border-2 border-dashed border-[var(--border-strong)] flex flex-col items-center justify-center gap-2 text-center px-4 text-[var(--text-muted)] hover:border-[var(--accent-color)] hover:text-[var(--accent-text)] transition-colors"
              >
                <Plus className="w-7 h-7" />
                <span className="font-semibold text-[var(--text-main)]">Tạo mẫu riêng</span>
                <span className="text-xs">Tải ảnh toàn thân của người mẫu của shop</span>
              </button>
            )}
            {shown.length === 0 && tab === 'mine' && !canCreate && (
              <p className="col-span-full text-sm text-[var(--text-muted)]">Bạn chưa có người mẫu riêng.</p>
            )}
          </div>
        )}
      </div>

      <Modal open={editing !== null} onClose={() => busy !== 'save' && setEditing(null)} title={editing === 'new' ? 'Tạo người mẫu riêng' : 'Sửa người mẫu'}>
        <form onSubmit={save} className="space-y-4" noValidate>
          {editing === 'new' && (
            <div className="flex gap-4 items-start">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative w-28 aspect-[3/4] shrink-0 rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden flex items-center justify-center hover:border-[var(--accent-color)] transition-colors"
                aria-label="Chọn ảnh người mẫu"
              >
                {busy === 'upload' ? (
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
                ) : form.avatar_url ? (
                  <img src={form.avatar_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <ImagePlus className="w-6 h-6 text-[var(--accent-text)]" />
                )}
              </button>
              <ul className="text-sm text-[var(--text-muted)] space-y-1">
                <li>Ảnh dọc, thấy toàn thân từ đầu đến chân.</li>
                <li>Đứng thẳng, tay không che thân, nền đơn giản.</li>
                <li>Đủ sáng, không đeo túi lớn hay áo khoác dày.</li>
              </ul>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) upload(f)
                  e.target.value = ''
                }}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-surface)]" role="radiogroup" aria-label="Giới tính">
            {(['female', 'male'] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={form.gender === g}
                onClick={() => setForm((f) => ({ ...f, gender: g }))}
                className={`h-9 rounded-lg text-sm font-semibold transition-colors ${
                  form.gender === g ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
                }`}
              >
                {g === 'female' ? 'Nữ' : 'Nam'}
              </button>
            ))}
          </div>
          <RegionField value={form.region} onChange={(region) => setForm((f) => ({ ...f, region }))} />
          <label className="block">
            <span className="field-label">Tên người mẫu *</span>
            <input className="field" value={form.name} onChange={set('name')} maxLength={80} placeholder="Ví dụ: Hạnh Nguyên" />
          </label>
          <label className="block">
            <span className="field-label">Phong cách *</span>
            <input className="field" value={form.style} onChange={set('style')} maxLength={120} placeholder="Ví dụ: Công sở thanh lịch" />
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            <label className="block">
              <span className="field-label">Chiều cao</span>
              <input className="field" value={form.height} onChange={set('height')} maxLength={20} placeholder="1m62" />
            </label>
            <label className="block">
              <span className="field-label">Cân nặng</span>
              <input className="field" value={form.weight} onChange={set('weight')} maxLength={20} placeholder="48kg" />
            </label>
            <label className="block">
              <span className="field-label">Số đo</span>
              <input className="field" value={form.measurements} onChange={set('measurements')} maxLength={40} placeholder="84-62-90" />
            </label>
          </div>
          {editing === 'new' && (
            <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-[var(--border-subtle)] cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 w-4 h-4 accent-[var(--accent-color)]" />
              <span className="text-sm text-[var(--text-sub)]">
                <ShieldCheck className="w-4 h-4 inline -mt-0.5 mr-1 text-[var(--accent-text)]" />
                {quota?.consent_text}
              </span>
            </label>
          )}
          {error && <p className="text-sm text-[var(--danger-text)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} disabled={busy === 'save'} className="btn btn-ghost">
              Hủy
            </button>
            <button type="submit" disabled={busy !== null || (editing === 'new' && (!consent || !form.avatar_url))} className="btn btn-primary">
              {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing === 'new' ? 'Tạo người mẫu' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Xóa người mẫu riêng">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-sub)]">
              <strong>{deleting.name}</strong> sẽ không còn trong danh sách chọn người mẫu. Video đã tạo với mẫu này vẫn giữ nguyên.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="btn btn-ghost">
                Thôi
              </button>
              <button onClick={confirmDelete} className="btn btn-danger">
                <Trash2 className="w-4 h-4" /> Xóa
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
