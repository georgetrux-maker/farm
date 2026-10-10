import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, Loader2, Pencil, Plus, RefreshCw, Users2 } from 'lucide-react'
import { addNewAvatar, fetchAvatars, setDefaultAvatar, updateAvatar, uploadImage } from '../../services/api'
import type { BrandAvatar } from '../../types'
import { AvatarImage } from '../ui/AvatarImage'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/toastContext'

type Gender = 'female' | 'male'
const DEFAULTS: Record<Gender, { height: string; weight: string; measurements: string }> = {
  female: { height: '1m65', weight: '48kg', measurements: '84-60-90' },
  male: { height: '1m76', weight: '68kg', measurements: '96-78-94' },
}
const EMPTY_FORM = { name: '', style: '', ...DEFAULTS.female, avatar_url: '', gender: 'female' as Gender }

type Tab = 'all' | Gender | 'default'
const genderOf = (a: BrandAvatar): Gender => a.gender ?? 'female'

/** Kho người mẫu AI (chỉ quản trị viên): thêm người mẫu, đổi ảnh, chọn người mẫu mặc định cho mọi shop. */
export const AvatarManager: React.FC = () => {
  const toast = useToast()
  const [avatars, setAvatars] = useState<BrandAvatar[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<BrandAvatar | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [form, setForm] = useState(EMPTY_FORM)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const replaceTarget = useRef<BrandAvatar | null>(null)

  const load = useCallback(() => {
    fetchAvatars()
      .then(setAvatars)
      .catch((e) => toast(e.message, 'error'))
  }, [toast])

  useEffect(() => {
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [load])

  const makeDefault = async (a: BrandAvatar) => {
    setBusyId(a.id)
    try {
      await setDefaultAvatar(a.id)
      toast(`${a.name} là người mẫu mặc định`, 'success')
      load()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const pickReplacement = (a: BrandAvatar) => {
    replaceTarget.current = a
    replaceRef.current?.click()
  }

  const replacePhoto = async (file: File) => {
    const target = replaceTarget.current
    if (!target) return
    setBusyId(target.id)
    try {
      const res = await uploadImage(file)
      await updateAvatar(target.id, { avatar_url: res.media_url })
      toast(`Đã đổi ảnh ${target.name}`, 'success')
      load()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusyId(null)
      replaceTarget.current = null
    }
  }

  const upload = async (file: File) => {
    setUploading(true)
    setFormError(null)
    try {
      const res = await uploadImage(file)
      setForm((f) => ({ ...f, avatar_url: res.media_url }))
    } catch (e: any) {
      setFormError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const openAdd = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setAdding(true)
  }
  const openEdit = (a: BrandAvatar) => {
    setEditing(a)
    setForm({
      name: a.name, style: a.style, height: a.height, weight: a.weight, measurements: a.measurements,
      avatar_url: a.avatar_url, gender: genderOf(a),
    })
    setFormError(null)
    setAdding(true)
  }
  /** Đổi Nữ/Nam: số đo đang để mặc định thì đổi theo, đã sửa thì giữ nguyên */
  const setGender = (gender: Gender) =>
    setForm((f) => {
      const old = DEFAULTS[f.gender]
      const untouched = f.height === old.height && f.weight === old.weight && f.measurements === old.measurements
      return { ...f, gender, ...(untouched ? DEFAULTS[gender] : {}) }
    })

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!form.name.trim() || !form.style.trim()) return setFormError('Vui lòng nhập tên và phong cách người mẫu')
    if (!form.avatar_url) return setFormError('Vui lòng tải ảnh toàn thân của người mẫu')
    setSaving(true)
    try {
      const data = { ...form, name: form.name.trim(), style: form.style.trim() }
      if (editing) {
        // Chỉ gửi ảnh khi đã đổi (ảnh mẫu có sẵn có thể là link ngoài)
        const { avatar_url, ...rest } = data
        await updateAvatar(editing.id, avatar_url === editing.avatar_url ? rest : data)
        toast(`Đã cập nhật ${data.name}`, 'success')
      } else {
        await addNewAvatar({ ...data, badge: 'Mới' })
        toast(`Đã thêm người mẫu ${data.name}`, 'success')
      }
      setAdding(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      load()
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const set = (key: 'name' | 'style' | 'height' | 'weight' | 'measurements') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const count = (t: Tab) =>
    (avatars ?? []).filter((a) => t === 'all' || (t === 'default' ? !!a.is_default : genderOf(a) === t)).length
  const shown = (avatars ?? []).filter((a) => tab === 'all' || (tab === 'default' ? !!a.is_default : genderOf(a) === tab))
  const TABS: { id: Tab; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'female', label: 'Nữ' },
    { id: 'male', label: 'Nam' },
    { id: 'default', label: 'Mặc định' },
  ]

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 p-1 rounded-full bg-[var(--bg-surface)] overflow-x-auto no-scrollbar" role="tablist" aria-label="Lọc người mẫu">
          {TABS.map((t) => (
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
        <button onClick={openAdd} className="btn btn-primary">
          <Plus className="w-4 h-4" /> Thêm người mẫu
        </button>
      </div>
      <p className="text-sm text-[var(--text-muted)] -mt-2">
        Người mẫu dùng chung cho mọi shop. Người mẫu mặc định được chọn sẵn khi shop tạo video.
      </p>

      {!avatars ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton rounded-2xl aspect-[3/4]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-muted)]">
          <Users2 className="w-8 h-8 mx-auto mb-2" /> {avatars.length ? 'Không có người mẫu trong nhóm này.' : 'Chưa có người mẫu nào.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-7">
          {shown.map((a) => (
            <article key={a.id} className="group">
              <div
                className={`relative rounded-2xl overflow-hidden ring-2 ring-offset-2 ring-offset-[var(--bg-app)] ${
                  a.is_default ? 'ring-[var(--accent-color)]' : 'ring-transparent'
                }`}
              >
                <AvatarImage
                  src={a.avatar_url}
                  name={a.name}
                  className="w-full aspect-[3/4] transition-transform duration-700 group-hover:scale-[1.04]"
                />
                {a.is_default ? (
                  <span className="absolute top-2.5 left-2.5 glass rounded-full px-2.5 py-1 text-xs font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Mặc định
                  </span>
                ) : null}
                <span className="absolute top-2.5 right-2.5 glass rounded-full px-2.5 py-1 text-xs font-semibold">
                  {genderOf(a) === 'male' ? 'Nam' : 'Nữ'}
                </span>
              </div>
              <div className="pt-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="display text-lg">{a.name}</h3>
                  <button onClick={() => openEdit(a)} className="icon-btn w-8 h-8 -mr-1.5" aria-label={`Sửa ${a.name}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-sm text-[var(--text-muted)] line-clamp-1">{a.style}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {[a.height, a.weight, a.measurements].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Đã dùng cho {a.renders_count ?? 0} video</p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => pickReplacement(a)}
                    disabled={busyId === a.id}
                    className="btn btn-ghost btn-sm flex-1"
                    aria-label={`Đổi ảnh ${a.name}`}
                  >
                    {busyId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Đổi ảnh
                  </button>
                  {!a.is_default && (
                    <button onClick={() => makeDefault(a)} disabled={busyId === a.id} className="btn btn-secondary btn-sm flex-1">
                      Đặt mặc định
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <input
        ref={replaceRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) replacePhoto(f)
          e.target.value = ''
        }}
      />

      <Modal open={adding} onClose={() => setAdding(false)} title={editing ? `Sửa ${editing.name}` : 'Thêm người mẫu AI'}>
        <form onSubmit={save} className="space-y-4" noValidate>
          <div className="flex gap-4 items-start">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-24 aspect-[3/4] shrink-0 rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden flex items-center justify-center hover:border-[var(--accent-color)] transition-colors"
              aria-label="Chọn ảnh người mẫu"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
              ) : form.avatar_url ? (
                <img src={form.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <ImagePlus className="w-6 h-6 text-[var(--accent-text)]" />
              )}
            </button>
            <p className="text-sm text-[var(--text-muted)]">
              Ảnh toàn thân, đứng thẳng, nền đơn giản, thấy rõ dáng người. AI sẽ mặc sản phẩm lên người mẫu này.
            </p>
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
          <div>
            <span className="field-label">Giới tính</span>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-surface)]" role="radiogroup" aria-label="Giới tính">
              {(['female', 'male'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={form.gender === g}
                  onClick={() => setGender(g)}
                  className={`h-9 rounded-lg text-sm font-semibold transition-colors ${
                    form.gender === g ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {g === 'female' ? 'Nữ' : 'Nam'}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="field-label">Tên người mẫu *</span>
            <input className="field" value={form.name} onChange={set('name')} maxLength={80} placeholder="Ví dụ: Hoàng Yến" />
          </label>
          <label className="block">
            <span className="field-label">Phong cách *</span>
            <input className="field" value={form.style} onChange={set('style')} maxLength={120} placeholder="Ví dụ: Công sở hiện đại" />
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            <label className="block">
              <span className="field-label">Chiều cao</span>
              <input className="field" value={form.height} onChange={set('height')} maxLength={20} />
            </label>
            <label className="block">
              <span className="field-label">Cân nặng</span>
              <input className="field" value={form.weight} onChange={set('weight')} maxLength={20} />
            </label>
            <label className="block">
              <span className="field-label">Số đo</span>
              <input className="field" value={form.measurements} onChange={set('measurements')} maxLength={40} />
            </label>
          </div>
          {formError && <p className="text-sm text-[var(--danger-text)]">{formError}</p>}
          <button type="submit" disabled={saving || uploading} className="btn btn-primary btn-lg w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {editing ? 'Lưu thay đổi' : 'Thêm người mẫu'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
