import React from 'react'
import type { PipelineNode } from '../../types'
import { CheckCircle2, Loader2, Sparkles, SlidersHorizontal } from 'lucide-react'

interface NodeCardProps {
  node: PipelineNode
  isSelected: boolean
  onSelect: (node: PipelineNode) => void
  onMouseDown: (e: React.MouseEvent, node: PipelineNode) => void
}

export const NodeCard: React.FC<NodeCardProps> = ({
  node,
  isSelected,
  onSelect,
  onMouseDown,
}) => {
  const getStatusBadge = () => {
    switch (node.status) {
      case 'running':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--accent-color)] bg-[var(--accent-color)]/10 px-2 py-0.5 rounded border border-[var(--accent-color)]/30 animate-pulse">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            ĐANG CHẠY
          </span>
        )
      case 'completed':
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--accent-color)] bg-[var(--accent-color)]/10 px-2 py-0.5 rounded border border-[var(--accent-color)]/30">
            <CheckCircle2 className="w-2.5 h-2.5" />
            HOÀN TẤT
          </span>
        )
      default:
        return (
          <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-surface)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
            SẴN SÀNG
          </span>
        )
    }
  }

  return (
    <div
      style={{ left: `${node.x}px`, top: `${node.y}px` }}
      onMouseDown={(e) => onMouseDown(e, node)}
      onClick={() => onSelect(node)}
      className={`absolute w-72 rounded-2xl bg-[var(--bg-card)] border transition-all cursor-move select-none p-4 shadow-xl ${
        isSelected
          ? 'border-[var(--accent-color)] shadow-[0_0_20px_var(--accent-glow)]'
          : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
      } ${node.status === 'running' ? 'node-active-glow border-[var(--accent-color)]' : ''}`}
    >
      {/* Input Port */}
      <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[var(--bg-surface)] border-2 border-zinc-500 hover:border-[var(--accent-color)] transition-colors" />

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-color)]">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] block">{node.tag}</span>
            <h4 className="text-sm font-semibold text-[var(--text-main)] leading-tight">{node.title}</h4>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* Description */}
      <p className="text-xs text-[var(--text-muted)] mb-3 line-clamp-2 leading-relaxed">{node.description}</p>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11px] font-mono">
        {Object.entries(node.metrics).map(([key, value]) => (
          <div key={key} className="bg-[var(--bg-surface)] px-2 py-1 rounded border border-[var(--border-subtle)]">
            <span className="text-[var(--text-muted)] block text-[9px] uppercase">{key}</span>
            <span className="text-[var(--accent-color)] font-semibold">{value}</span>
          </div>
        ))}
      </div>

      {/* Inspector hint */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1">
          <SlidersHorizontal className="w-3 h-3 text-[var(--text-muted)]" />
          Click để mở tham số
        </span>
        <span className="font-mono opacity-60">ID: {node.id}</span>
      </div>

      {/* Output Port */}
      <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[var(--bg-surface)] border-2 border-zinc-500 hover:border-[var(--accent-color)] transition-colors" />
    </div>
  )
}
