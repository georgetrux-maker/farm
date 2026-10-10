import React from 'react'

export interface StatItem {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: React.ElementType
  action?: React.ReactNode
}

/**
 * Dải số liệu trong MỘT khung, các ô ngăn bằng vạch mảnh (thay cho nhiều thẻ rời giống nhau).
 * Điện thoại 2 cột, máy tính đủ số cột; vạch ngăn là khe 1px để lộ màu viền phía sau.
 */
export const StatStrip: React.FC<{ items: StatItem[]; className?: string }> = ({ items, className = '' }) => (
  <div
    className={`grid grid-cols-2 gap-px rounded-[1.25rem] overflow-hidden border border-[var(--border-subtle)] bg-[var(--border-subtle)] shadow-[var(--shadow-card)] ${
      items.length === 4 ? 'lg:grid-cols-4' : items.length === 3 ? 'sm:grid-cols-3' : ''
    } ${className}`}
  >
    {items.map((it, i) => {
      const Icon = it.icon
      // Số ô lẻ trên điện thoại: ô cuối chiếm cả hàng để không chừa ô trống
      const spanLast = items.length % 2 === 1 && i === items.length - 1
      return (
        <div
          key={it.label}
          className={`bg-[var(--bg-card)] p-4 sm:p-5 flex flex-col min-w-0 ${spanLast ? 'col-span-2 sm:col-span-1' : ''}`}
        >
          <span className="text-sm text-[var(--text-muted)] flex items-center gap-1.5">
            {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden />}
            {it.label}
          </span>
          <span className="text-2xl sm:text-[1.75rem] font-semibold tracking-tight mt-1.5 truncate">{it.value}</span>
          {it.sub && <span className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">{it.sub}</span>}
          {it.action && <div className="mt-auto pt-3">{it.action}</div>}
        </div>
      )
    })}
  </div>
)
