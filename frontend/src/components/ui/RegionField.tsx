import React from 'react'
import type { Region } from '../../types'
import { REGION_LABELS } from '../../lib/labels'

/** Chọn vùng của người mẫu (để lọc Châu Á / Châu Âu); để trống nếu chưa rõ */
export const RegionField: React.FC<{ value: Region | ''; onChange: (value: Region | '') => void }> = ({ value, onChange }) => (
  <label className="block">
    <span className="field-label">Vùng</span>
    <select className="field" value={value} onChange={(e) => onChange(e.target.value as Region | '')}>
      <option value="">Chưa chọn</option>
      {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
        <option key={r} value={r}>
          {REGION_LABELS[r]}
        </option>
      ))}
    </select>
  </label>
)
