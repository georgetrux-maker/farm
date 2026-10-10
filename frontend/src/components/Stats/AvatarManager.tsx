import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, Loader2, Plus, Users2 } from 'lucide-react'
import { addNewAvatar, fetchAvatars, setDefaultAvatar, uploadImage } from '../../services/api'
import type { BrandAvatar } from '../../types'
import { AvatarImage } from '../ui/AvatarImage'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/toastContext'

const EMPTY_FORM = { name: '', style: '', height: '1m65', weight: '48kg', measurements: '84-60-90', avatar_url: '' }

/** Kho người mẫu AI (chỉ quản trị viên): thêm người mẫu, chọn người mẫu mặc định cho mọi shop. */
export const AvatarManager: React.FC = () => {
  const toast = useToast()
  const [avatars, setAvatars] = useState<BrandAvatar[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!form.name.trim() || !form.style.trim()) return setFormError('Vui lòng nhập tên và phong cách người mẫu')
    if (!form.avatar_url) return setFormError('Vui lòng tải ảnh toàn thân của người mẫu')
    setSaving(true)
    try {
      await addNewAvatar({ ...form, name: form.name.trim(), style: form.style.trim(), badge: 'Mới' })
      toast(`Đã thêm người mẫu ${form.name.trim()}`, 'success')
      setAdding(false)
      setForm(EMPTY_FORM)
      load()
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[var(--text-muted)] max-w-xl">
          Người mẫu dùng chung cho mọi shop. Người mẫu mặc định được chọn sẵn khi shop tạo video.
        </p>
        <button onClick={() => setAdding(true)} className="btn btn-primary">
          <Plus className="w-4 h-4" /> Thêm người mẫu
        </button>
      </div>

      {!avatars ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton rounded-2xl aspect-[3/4]" />
          ))}
        </div>
      ) : avatars.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-muted)]">
          <Users2 className="w-8 h-8 mx-auto mb-2" /> Chưa có người mẫu nào.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-7">
          {avatars.map((a) => (
            <article key={a.id} className="group">
              <div
                className={`relative rounded-2xl overflow-hidden ring-2 ring-offset-2 ring-offset-[var(--bg-app)] ${
                  a.is_default ? 'ring-[var(--ink)]' : 'ring-transparent'
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
              </div>
              <div className="pt-3">
                <h3 className="display text-lg">{a.name}</h3>
                <p className="text-sm text-[var(--text-muted)] line-clamp-1">{a.style}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {[a.height, a.weight, a.measurements].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Đã dùng cho {a.renders_count ?? 0} video</p>
                {!a.is_default && (
                  <button
                    onClick={() => makeDefault(a)}
                    disabled={busyId === a.id}
                    className="btn btn-secondary btn-sm w-full mt-3"
                  >
                    {busyId === a.id ? 'Đang lưu...' : 'Đặt làm mặc định'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Thêm người mẫu AI">
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
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Thêm người mẫu
          </button>
        </form>
      </Modal>
    </div>
  )
}
