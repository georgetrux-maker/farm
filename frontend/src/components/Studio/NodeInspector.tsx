import React from 'react'
import type { PipelineNode } from '../../types'
import { X, Sparkles, Sliders, Check } from 'lucide-react'

interface NodeInspectorProps {
  node: PipelineNode | null
  onClose: () => void
  onUpdateConfig: (nodeId: string, newConfig: any) => void
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  node,
  onClose,
  onUpdateConfig,
}) => {
  if (!node) return null

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-96 border-l border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-main)] flex flex-col z-30 shadow-2xl animate-in slide-in-from-right duration-200 transition-colors"
    >
      {/* Header */}
      <div className="h-14 px-5 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[var(--accent-color)]" />
          <h3 className="font-semibold text-sm text-[var(--text-main)]">Cấu Hình Node</h3>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--accent-color)] border border-[var(--border-subtle)]">
            {node.tag}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content Form */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
        <div>
          <label className="text-[var(--text-muted)] font-medium block mb-1.5 uppercase font-mono text-[10px]">Tên Node</label>
          <input
            type="text"
            readOnly
            value={node.title}
            className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-main)] font-medium focus:outline-none"
          />
        </div>

        <div>
          <label className="text-[var(--text-muted)] font-medium block mb-1.5 uppercase font-mono text-[10px]">Mô Tả Xử Lý</label>
          <p className="text-[var(--text-main)] bg-[var(--bg-surface)]/60 p-3 rounded-lg border border-[var(--border-subtle)] leading-relaxed">
            {node.description}
          </p>
        </div>

        {/* Dynamic Inputs Based on Node Type */}
        {node.id === 'node_scraper' && (
          <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <label className="text-[var(--text-muted)] font-medium block mb-1.5">Link Sản Phẩm (Shopee / TikTok Shop)</label>
              <input
                type="text"
                defaultValue={node.config.url || 'https://shopee.vn/dam-voan-to-hoa-nhi-i.128491.99281'}
                onChange={(e) => onUpdateConfig(node.id, { ...node.config, url: e.target.value })}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-main)] font-mono text-xs focus:border-[var(--accent-color)] outline-none"
              />
            </div>
            <div>
              <label className="text-[var(--text-muted)] font-medium block mb-1.5">Chế Độ Bóc Tách Tự Động</label>
              <select className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-main)] outline-none">
                <option value="auto">Tự động nhận diện ảnh trải sàn & thông số</option>
                <option value="manual">Chỉ lấy hình ảnh chụp cận cảnh</option>
              </select>
            </div>
          </div>
        )}

        {node.id === 'node_sam' && (
          <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-[var(--text-muted)] font-medium">Ngưỡng Khử Nền Alpha SAM 2</span>
                <span className="font-mono text-[var(--accent-color)]">0.96</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.99"
                step="0.01"
                defaultValue={0.96}
                className="w-full accent-[var(--accent-color)] cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-main)]">Bảo Toàn Nếp Gấp & Độ Rủ 4K</span>
              <span className="w-5 h-5 rounded-full bg-[var(--accent-color)]/20 text-[var(--accent-color)] flex items-center justify-center">
                <Check className="w-3 h-3" />
              </span>
            </div>
          </div>
        )}

        {node.id === 'node_vton' && (
          <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <label className="text-[var(--text-muted)] font-medium block mb-1.5">Người Mẫu AI Độc Quyền</label>
              <select
                defaultValue="model_01"
                onChange={(e) => onUpdateConfig(node.id, { ...node.config, avatar: e.target.value })}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-main)] outline-none"
              >
                <option value="model_01">Linh Đan - Á Đông thanh lịch (1m68)</option>
                <option value="model_02">Bảo Anh - GenZ năng động (1m62)</option>
                <option value="model_03">Mai Khanh - Quyến rũ dạ hội (1m72)</option>
              </select>
            </div>
            <div>
              <label className="text-[var(--text-muted)] font-medium block mb-1.5">Độ Vừa Vặn Thử Đồ (VTON Fit)</label>
              <div className="grid grid-cols-3 gap-2">
                <button className="py-2 rounded-lg bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)]">Rộng rãi</button>
                <button className="py-2 rounded-lg bg-[var(--accent-color)]/10 text-[var(--accent-color)] border border-[var(--accent-color)]/30 font-semibold">Chuẩn form</button>
                <button className="py-2 rounded-lg bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)]">Ôm sát</button>
              </div>
            </div>
          </div>
        )}

        {node.id === 'node_motion' && (
          <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <label className="text-[var(--text-muted)] font-medium block mb-1.5">Preset Chuyển Động Runway</label>
              <select className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-main)] outline-none">
                <option>Catwalk Studio Sải Bước Nhẹ Nhàng (3s)</option>
                <option>Xoay 360 Độ Tôn Dáng Toàn Thân (5s)</option>
                <option>Dạo Phố Streetwear Tự Nhiên (4s)</option>
              </select>
            </div>
            <div>
              <label className="text-[var(--text-muted)] font-medium block mb-1.5">Tốc Độ Khung Hình (FFmpeg)</label>
              <select className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-main)] outline-none">
                <option>60 FPS mượt mà (Chuẩn TikTok HD)</option>
                <option>30 FPS tiết kiệm tài nguyên</option>
              </select>
            </div>
          </div>
        )}

        {node.id === 'node_tts' && (
          <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <label className="text-[var(--text-muted)] font-medium block mb-1.5">Giọng Đọc KOC Tiếng Việt</label>
              <select
                defaultValue="vi-VN-HoaiMyNeural"
                onChange={(e) => onUpdateConfig(node.id, { ...node.config, voice: e.target.value })}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[var(--text-main)] outline-none"
              >
                <option value="vi-VN-HoaiMyNeural">Hoài My - Giọng nữ truyền cảm, tự nhiên</option>
                <option value="vi-VN-NamMinhNeural">Nam Minh - Giọng nam ấm áp, trẻ trung</option>
              </select>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <span className="text-[var(--text-main)]">Tự Động Sinh Phụ Đề WebVTT</span>
              <span className="w-5 h-5 rounded-full bg-[var(--accent-color)]/20 text-[var(--accent-color)] flex items-center justify-center">
                <Check className="w-3 h-3" />
              </span>
            </div>
          </div>
        )}

        {node.id === 'node_publish' && (
          <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
            <div>
              <label className="text-[var(--text-muted)] font-medium block mb-1.5">Gắn Hotspot Tương Tác</label>
              <p className="text-[var(--text-muted)] text-[11px] mb-2">2 Điểm ghim: Tọa độ cổ áo (y: 35%) và thắt eo (y: 52%)</p>
            </div>
            <div>
              <label className="text-[var(--text-muted)] font-medium block mb-1.5">Xuất Bản Video 9:16 Không Watermark</label>
              <div className="p-3 bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30 rounded-lg text-[var(--accent-color)]">
                Sẵn sàng kết nối kênh TikTok Shop & Shopee Live
              </div>
            </div>
          </div>
        )}

        {/* Live Metrics */}
        <div className="pt-3 border-t border-[var(--border-subtle)]">
          <span className="text-[var(--text-muted)] font-medium block mb-2 uppercase font-mono text-[10px]">Chỉ Số Hoạt Động</span>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(node.metrics).map(([key, val]) => (
              <div key={key} className="bg-[var(--bg-surface)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] uppercase text-[9px] block font-mono">{key}</span>
                <span className="text-[var(--text-main)] font-mono font-semibold">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/50">
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[var(--accent-color)] to-[var(--accent-color)]/80 text-black font-semibold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-1.5 shadow-md"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Lưu Tham Số Node
        </button>
      </div>
    </div>
  )
}
