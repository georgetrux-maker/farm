import React from 'react'
import { Check } from 'lucide-react'

const STEPS = ['Sản phẩm', 'Người mẫu & video', 'Duyệt & đăng']

/** Ba bước tạo video; điện thoại chỉ hiện tên bước đang làm. */
export const Stepper: React.FC<{ step: number }> = ({ step }) => (
  <ol className="flex items-center gap-2 sm:gap-3" aria-label="Các bước tạo video">
    {STEPS.map((label, i) => {
      const done = i < step
      const active = i === step
      return (
        <li key={label} className="flex items-center gap-2 sm:gap-3" aria-current={active ? 'step' : undefined}>
          <span
            className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold border transition-colors duration-300 ${
              done
                ? 'bg-[var(--accent-color)] border-[var(--accent-color)] text-[var(--on-accent)]'
                : active
                  ? 'bg-[var(--ink)] border-[var(--ink)] text-[var(--on-ink)]'
                  : 'border-[var(--border-strong)] text-[var(--text-muted)]'
            }`}
          >
            {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
          </span>
          <span
            className={`text-sm whitespace-nowrap ${
              active ? 'font-semibold text-[var(--text-main)]' : 'hidden sm:inline text-[var(--text-muted)]'
            }`}
          >
            {label}
          </span>
          {i < STEPS.length - 1 && <span className="w-5 sm:w-8 h-px bg-[var(--border-strong)]" aria-hidden="true" />}
        </li>
      )
    })}
  </ol>
)
