import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, Plus, Upload, Users2 } from 'lucide-react'
import { addNewAvatar, fetchAvatars, setDefaultAvatar, uploadImage } from '../../services/api'
import type { BrandAvatar } from '../../types'
import { AvatarImage } from '../ui/AvatarImage'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/toastContext'

const card = 'rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]'
const input =
  'w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent-color)]'
const label = 'text-sm font-medium text-[var(--text-muted)] block mb-1.5'

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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[var(--text-muted)] max-w-xl">
          Người mẫu dùng chung cho mọi shop. Người mẫu mặc định được chọn sẵn khi shop tạo video.
        </p>
        <button
          onClick={() => setAdding(true)}
          className="px-4 py-2.5 rounded-xl bg-[var(--accent-color)] text-black text-sm font-semibold flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Thêm người mẫu
        </button>
      </div>

      {!avatars ? (
        <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
      ) : avatars.length === 0 ? (
        <div className={`${card} p-8 text-center text-sm text-[var(--text-muted)]`}>
          <Users2 className="w-8 h-8 mx-auto mb-2" /> Chưa có người mẫu nào.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {avatars.map((a) => (
            <div
              key={a.id}
              className={`rounded-2xl bg-[var(--bg-card)] border overflow-hidden flex flex-col ${
                a.is_default ? 'border-[var(--accent-color)]' : 'border-[var(--border-subtle)]'
              }`}
            >
              <AvatarImage src={a.avatar_url} name={a.name} className="w-full aspect-[3/4]" />
              <div className="p-3 flex-1 flex flex-col gap-1">
                <div className="font-semibold">{a.name}</div>
                <div className="text-sm text-[var(--text-muted)] line-clamp-2">{a.style}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {[a.height, a.weight, a.measurements].filter(Boolean).join(' · ')}
                </div>
                <div className="text-xs text-[var(--text-muted)]">Đã dùng cho {a.renders_count ?? 0} video</div>
                <div className="mt-auto pt-2">
                  {a.is_default ? (
                    <span className="text-sm font-semibold text-[var(--accent-text)] flex items-center gap-1">
                      <Check className="w-4 h-4" /> Mặc định
                    </span>
                  ) : (
                    <button
                      onClick={() => makeDefault(a)}
                      disabled={busyId === a.id}
                      className="w-full py-2 rounded-lg border border-[var(--border-strong)] text-sm font-medium disabled:opacity-60"
                    >
                      {busyId === a.id ? 'Đang lưu...' : 'Đặt làm mặc định'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Thêm người mẫu AI">
        <form onSubmit={save} className="space-y-3" noValidate>
          <div className="flex gap-3 items-start">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-24 aspect-[3/4] shrink-0 rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden flex items-center justify-center"
              aria-label="Chọn ảnh người mẫu"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
              ) : form.avatar_url ? (
                <img src={form.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <Upload className="w-5 h-5 text-[var(--text-muted)]" />
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
            <span className={label}>Tên người mẫu *</span>
            <input className={input} value={form.name} onChange={set('name')} maxLength={80} placeholder="Ví dụ: Hoàng Yến" />
          </label>
          <label className="block">
            <span className={label}>Phong cách *</span>
            <input className={input} value={form.style} onChange={set('style')} maxLength={120} placeholder="Ví dụ: Công sở hiện đại" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className={label}>Chiều cao</span>
              <input className={input} value={form.height} onChange={set('height')} maxLength={20} />
            </label>
            <label className="block">
              <span className={label}>Cân nặng</span>
              <input className={input} value={form.weight} onChange={set('weight')} maxLength={20} />
            </label>
            <label className="block">
              <span className={label}>Số đo</span>
              <input className={input} value={form.measurements} onChange={set('measurements')} maxLength={40} />
            </label>
          </div>
          {formError && <p className="text-sm text-[var(--danger-text)]">{formError}</p>}
          <button
            type="submit"
            disabled={saving || uploading}
            className="w-full py-3 rounded-xl bg-[var(--accent-color)] text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Thêm người mẫu
          </button>
        </form>
      </Modal>
    </div>
  )
}
