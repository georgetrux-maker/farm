import React from 'react'
import { formatNumber, formatVnd } from '../../lib/format'

/** Chi phí và số dư ở thanh tạo video */
export const CostSummary: React.FC<{ cost: number; credits: number; ready: boolean }> = ({ cost, credits, ready }) => (
  <div className="text-sm leading-snug min-w-0 flex-1 text-right sm:text-left">
    <div>
      <span className="text-[var(--text-muted)]">Chi phí: </span>
      <strong className="whitespace-nowrap">{ready ? `${formatNumber(cost)} credit` : '...'}</strong>
      {ready && <span className="hidden sm:inline text-[var(--text-muted)]"> (≈ {formatVnd(cost * 100)})</span>}
    </div>
    <div className="text-[var(--text-muted)]">
      Số dư:{' '}
      <strong className={cost > credits ? 'text-[var(--danger-text)]' : 'text-[var(--text-main)]'}>{formatNumber(credits)}</strong>
    </div>
  </div>
)
