import { useEffect, useState } from 'react'
import { fetchAvatars, fetchStudioOptions } from '../services/api'
import { SCENE_LABELS, STYLE_LABELS, TEMPLATE_SHORT_LABELS } from './labels'

export interface StudioLabels {
  model: (id?: string | null) => string | null
  template: (id?: string | null) => string | null
  voice: (id?: string | null) => string | null
  style: (id?: string | null) => string | null
  scene: (id?: string | null) => string | null
}

let cache: Promise<{ models: Record<string, string>; voices: Record<string, string> }> | null = null

/** Gọi sau khi thêm/sửa/xóa người mẫu để lần sau tải lại tên */
export function invalidateStudioLabels() {
  cache = null
}

function load() {
  cache ??= Promise.all([fetchStudioOptions(), fetchAvatars()])
    .then(([opts, avatars]) => ({
      models: Object.fromEntries(avatars.map((a) => [a.id, a.name])),
      voices: Object.fromEntries(opts.voices.map((v) => [v.id, v.label])),
    }))
    .catch((e) => {
      cache = null // lần sau thử lại
      throw e
    })
  return cache
}

/** Tên hiển thị của người mẫu, kiểu video, giọng đọc, lời văn theo id lưu trong job (tải một lần, dùng chung). */
export function useStudioLabels(): StudioLabels {
  const [maps, setMaps] = useState<{ models: Record<string, string>; voices: Record<string, string> } | null>(null)
  useEffect(() => {
    let alive = true
    load()
      .then((m) => alive && setMaps(m))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return {
    model: (id) => (id ? (maps?.models[id] ?? null) : null),
    template: (id) => (id ? (TEMPLATE_SHORT_LABELS[id] ?? id) : null),
    voice: (id) => (id ? (maps?.voices[id] ?? null) : null),
    style: (id) => (id ? (STYLE_LABELS[id] ?? id) : null),
    scene: (id) => (id ? (SCENE_LABELS[id] ?? id) : null),
  }
}
