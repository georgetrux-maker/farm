import React, { useState } from 'react'
import { BarChart3, Table2 } from 'lucide-react'

export interface ColumnPoint {
  key: string
  /** Nhãn ngắn dưới cột, ví dụ "Th 2" */
  label: string
  /** Nhãn đầy đủ trong chú thích và bảng, ví dụ "Thứ 2, 06/10" */
  fullLabel: string
  value: number
}

interface ColumnChartProps {
  points: ColumnPoint[]
  /** Tên số liệu cho trình đọc màn hình và tiêu đề cột bảng, ví dụ "Doanh thu" */
  measure: string
  formatValue: (value: number) => string
  /** Nhãn trục dọc gọn: 0 / 500k / 1,2tr */
  formatTick?: (value: number) => string
  /** Chiều cao vùng vẽ (chưa tính hàng nhãn ngày) */
  plotHeight?: number
  emptyText?: string
}

/** Bước chia trục đẹp: 1, 2, 5 × 10^n */
function niceStep(raw: number, integer: boolean): number {
  if (raw <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power
  return integer ? Math.max(1, Math.round(step)) : step
}

/**
 * Biểu đồ cột một chuỗi số liệu: cột mảnh (tối đa 24px), bo 4px ở đầu, lưới mảnh, nhãn giá trị
 * chỉ ở cột cao nhất và cột cuối; rê chuột/Tab vào cột để xem chú thích; có nút xem dạng bảng.
 */
export const ColumnChart: React.FC<ColumnChartProps> = ({
  points, measure, formatValue, formatTick = formatValue, plotHeight = 176, emptyText = 'Chưa có dữ liệu',
}) => {
  const [active, setActive] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)

  const integer = points.every((p) => Number.isInteger(p.value))
  const max = Math.max(0, ...points.map((p) => p.value))
  const step = niceStep(max / 3, integer)
  const top = Math.max(step, Math.ceil(max / step) * step)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const maxIndex = max > 0 ? points.findIndex((p) => p.value === max) : -1
  const last = points.length - 1

  return (
    <div>
      <div className="flex justify-end -mt-1 mb-2">
        <button
          onClick={() => setAsTable((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-main)]"
        >
          {asTable ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
          {asTable ? 'Xem biểu đồ' : 'Xem dạng bảng'}
        </button>
      </div>

      {asTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
              <th className="py-2 font-medium">Ngày</th>
              <th className="py-2 font-medium text-right">{measure}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-b border-[var(--border-subtle)] last:border-0">
                <td className="py-2">{p.fullLabel}</td>
                <td className="py-2 text-right tabular-nums font-medium">{formatValue(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 pt-5">
          {/* Trục dọc */}
          <div className="relative" style={{ height: plotHeight }} aria-hidden>
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-0 translate-y-1/2 text-[11px] leading-none text-[var(--text-muted)] tabular-nums whitespace-nowrap"
                style={{ bottom: `${(t / top) * 100}%` }}
              >
                {formatTick(t)}
              </span>
            ))}
          </div>

          <div className="relative" style={{ height: plotHeight }}>
            {ticks.map((t) => (
              <div
                key={t}
                className={`absolute inset-x-0 h-px ${t === 0 ? 'bg-[var(--border-strong)]' : 'bg-[var(--border-subtle)]'}`}
                style={{ bottom: `${(t / top) * 100}%` }}
              />
            ))}
            {max === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-[var(--text-muted)]">{emptyText}</p>
            )}
            <div className="absolute inset-0 flex" onPointerLeave={() => setActive(null)}>
              {points.map((p, i) => {
                const pct = (p.value / top) * 100
                const isActive = active === i
                const showLabel = p.value > 0 && !isActive && (i === maxIndex || i === last)
                const align = i === 0 ? 'left-0' : i === last ? 'right-0' : 'left-1/2 -translate-x-1/2'
                return (
                  <button
                    key={p.key}
                    type="button"
                    className="relative flex-1 h-full flex items-end justify-center outline-none group"
                    aria-label={`${p.fullLabel}: ${formatValue(p.value)}`}
                    onPointerEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  >
                    {p.value > 0 && (
                      <span
                        className={`w-full max-w-6 rounded-t-[4px] bg-[var(--viz-1)] transition-[filter,opacity] group-focus-visible:ring-2 group-focus-visible:ring-[var(--accent-color)] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[var(--bg-card)] ${
                          active !== null && !isActive ? 'opacity-55' : ''
                        }`}
                        style={{ height: `${pct}%`, minHeight: 2, marginInline: 'auto' }}
                      />
                    )}
                    {showLabel && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold text-[var(--text-main)] whitespace-nowrap pointer-events-none"
                        style={{ bottom: `calc(${pct}% + 4px)` }}
                      >
                        {formatTick(p.value)}
                      </span>
                    )}
                    {isActive && (
                      <span
                        role="tooltip"
                        className={`absolute ${align} z-10 px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-pop)] text-left whitespace-nowrap pointer-events-none`}
                        style={{ bottom: `calc(${Math.min(pct, 78)}% + 8px)` }}
                      >
                        <span className="block text-sm font-semibold text-[var(--text-main)]">{formatValue(p.value)}</span>
                        <span className="block text-xs text-[var(--text-muted)]">{p.fullLabel}</span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Nhãn ngày */}
          <div />
          <div className="flex pt-2" aria-hidden>
            {points.map((p, i) => (
              <span
                key={p.key}
                className={`flex-1 text-center text-[11px] whitespace-nowrap ${
                  i === last ? 'font-semibold text-[var(--text-main)]' : 'text-[var(--text-muted)]'
                } ${points.length > 10 && i % 3 !== last % 3 ? 'invisible' : ''}`}
              >
                {p.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
