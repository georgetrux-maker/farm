import React from 'react'
import { Play, Loader2, Download, RotateCcw } from 'lucide-react'

interface StudioControlsProps {
  isRunning: boolean
  progress: number
  currentStep: string
  completedVideoUrl: string | null
  onRunPipeline: () => void
  onReset: () => void
}

export const StudioControls: React.FC<StudioControlsProps> = ({
  isRunning,
  progress,
  currentStep,
  completedVideoUrl,
  onRunPipeline,
  onReset,
}) => {
  return (
    <div className="absolute top-4 left-6 z-30 flex items-center gap-3">
      {/* Run Pipeline Button */}
      <button
        onClick={onRunPipeline}
        disabled={isRunning}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-xl transition-all ${
          isRunning
            ? 'bg-[var(--bg-surface)] text-[var(--text-muted)] cursor-not-allowed border border-[var(--border-subtle)]'
            : 'bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-color)]/80 text-black hover:shadow-[0_0_25px_var(--accent-glow)]'
        }`}
      >
        {isRunning ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-color)]" />
            <span>Đang Xử Lý Hàng Đợi ({progress}%)...</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4 fill-black" />
            <span>Chạy Luồng AI (Run Pipeline)</span>
          </>
        )}
      </button>

      {/* Progress pill if running or completed */}
      {isRunning && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-[var(--bg-card)]/90 border border-[var(--border-subtle)] backdrop-blur-md shadow-sm">
          <div className="w-32 bg-[var(--border-strong)] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[var(--accent-color)] h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-[var(--text-main)]">{currentStep}</span>
        </div>
      )}

      {completedVideoUrl && !isRunning && (
        <div className="flex items-center gap-2 animate-in fade-in">
          <a
            href={completedVideoUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-main)] transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-[var(--accent-color)]" />
            <span>Tải Video Thành Phẩm</span>
          </a>
          <button
            onClick={onReset}
            className="w-8 h-8 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--border-strong)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all"
            title="Đặt lại luồng"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
