import React from 'react'
import { NAV_ITEMS, type View } from '../lib/navigation'

interface BottomNavProps {
  activeView: View
  setActiveView: (view: View) => void
}

/** Thanh tab dưới cùng trên điện thoại/máy tính bảng, dễ bấm bằng ngón cái. */
export const BottomNav: React.FC<BottomNavProps> = ({ activeView, setActiveView }) => (
  <nav
    className="lg:hidden shrink-0 border-t border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-card)_92%,transparent)] backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    aria-label="Menu chính"
  >
    <div className="grid grid-cols-4 h-16">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const active = activeView === id
        return (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            aria-current={active ? 'page' : undefined}
            className={`relative flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
              active ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'
            }`}
          >
            <span
              className={`absolute top-0 h-[3px] w-8 rounded-b-full bg-[var(--accent-color)] transition-opacity ${
                active ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.2 : 1.7} />
            {label}
          </button>
        )
      })}
    </div>
  </nav>
)
