import React, { useState } from 'react'

export interface DonutSlice {
  key: string
  label: string
  value: number
  /** Biến màu biểu đồ, ví dụ "var(--viz-1)" */
  color: string
}

interface DonutChartProps {
  slices: DonutSlice[]
  formatValue: (value: number) => string
  /** Chữ nhỏ dưới tổng ở giữa vòng */
  centerLabel: string
  emptyText?: string
}

const R = 52
const STROKE = 16
const C = 2 * Math.PI * R
const GAP = 2 // khe 2px màu nền giữa các phần

/**
 * Tỉ trọng (tối đa vài phần): vòng mảnh có khe 2px giữa các phần, tổng ở giữa; chú thích bên cạnh luôn ghi
 * số tiền và phần trăm nên không phải dựa vào màu hay rê chuột mới đọc được.
 */
export const DonutChart: React.FC<DonutChartProps> = ({ slices, formatValue, centerLabel, emptyText = 'Chưa có dữ liệu' }) => {
  const [active, setActive] = useState<string | null>(null)
  const shown = slices.filter((s) => s.value > 0)
  const total = shown.reduce((sum, s) => sum + s.value, 0)
  const gap = shown.length > 1 ? GAP : 0

  // Vị trí bắt đầu của mỗi phần = tổng độ dài các phần trước nó
  const lengths = shown.map((s) => (s.value / total) * C)
  const arcs = shown.map((s, i) => ({
    ...s,
    dash: Math.max(0.5, lengths[i] - gap),
    offset: lengths.slice(0, i).reduce((a, b) => a + b, 0),
  }))
  const focus = shown.find((s) => s.key === active)

  return (
    <div className="flex flex-col sm:flex-row lg:flex-col items-center gap-5">
      <div className="relative w-40 h-40 shrink-0">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90" role="img" aria-label={centerLabel}>
          <circle cx="70" cy="70" r={R} fill="none" stroke="var(--bg-surface)" strokeWidth={STROKE} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={active === a.key ? STROKE + 4 : STROKE}
              strokeDasharray={`${a.dash} ${C - a.dash}`}
              strokeDashoffset={-a.offset}
              className="transition-[stroke-width,opacity] duration-200 cursor-pointer"
              opacity={active && active !== a.key ? 0.45 : 1}
              onPointerEnter={() => setActive(a.key)}
              onPointerLeave={() => setActive(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
          {total > 0 ? (
            <>
              <span className="text-lg font-semibold leading-tight">{formatValue(focus ? focus.value : total)}</span>
              <span className="text-[11px] text-[var(--text-muted)] leading-tight mt-0.5">{focus ? focus.label : centerLabel}</span>
            </>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">{emptyText}</span>
          )}
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-1 text-sm">
        {slices.map((s) => {
          const pct = total ? Math.round((s.value / total) * 100) : 0
          return (
            <li
              key={s.key}
              tabIndex={s.value > 0 ? 0 : -1}
              onPointerEnter={() => s.value > 0 && setActive(s.key)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => s.value > 0 && setActive(s.key)}
              onBlur={() => setActive(null)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl outline-none transition-colors ${
                active === s.key ? 'bg-[var(--bg-surface)]' : ''
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: s.color }} />
              <span className="flex-1 min-w-0 truncate text-[var(--text-sub)]">{s.label}</span>
              <span className="font-semibold tabular-nums">{formatValue(s.value)}</span>
              <span className="w-10 text-right text-[var(--text-muted)] tabular-nums">{pct}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
