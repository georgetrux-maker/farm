import React, { useState } from 'react'
import { X, Sparkles, Check, ShoppingBag, ArrowRight } from 'lucide-react'
import type { BodyProfile } from '../../types'
import { recommendSize } from '../../services/api'

interface TryOnModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenCheckout: () => void
}

export const TryOnModal: React.FC<TryOnModalProps> = ({
  isOpen,
  onClose,
  onOpenCheckout,
}) => {
  const profiles: BodyProfile[] = [
    {
      id: 'pear',
      label: 'Dáng Quả Lê (1m58 / 51kg)',
      description: 'Hông rộng, đùi đầy đặn, eo nhỏ',
      height: 158,
      weight: 51,
      bust: 84,
      waist: 66,
      hips: 93,
      bodyShape: 'pear',
      modelImg: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
      tryonImg: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=600&q=80',
    },
    {
      id: 'hourglass',
      label: 'Đồng Hồ Cát (1m65 / 52kg)',
      description: 'Tỉ lệ ngực và hông cân đối, eo thắt',
      height: 165,
      weight: 52,
      bust: 88,
      waist: 63,
      hips: 92,
      bodyShape: 'hourglass',
      modelImg: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=80',
      tryonImg: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=600&q=80',
    },
    {
      id: 'petite',
      label: 'Dáng Mi Nhon (1m52 / 44kg)',
      description: 'Nhỏ nhắn, vóc dáng thanh mảnh',
      height: 152,
      weight: 44,
      bust: 80,
      waist: 60,
      hips: 85,
      bodyShape: 'petite',
      modelImg: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80',
      tryonImg: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=600&q=80',
    },
  ]

  const [selectedProfile, setSelectedProfile] = useState<BodyProfile>(profiles[0])
  const [sliderPos, setSliderPos] = useState<number>(50)
  const [sizeResult, setSizeResult] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  if (!isOpen) return null

  const handleRecommendSize = async () => {
    setIsAnalyzing(true)
    try {
      const res = await recommendSize({
        height: selectedProfile.height,
        weight: selectedProfile.weight,
        bust: selectedProfile.bust,
        waist: selectedProfile.waist,
        hips: selectedProfile.hips,
        body_shape: selectedProfile.bodyShape,
      })
      setSizeResult(res)
    } catch (err) {
      console.error(err)
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-4xl bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors">
        {/* Header */}
        <div className="h-16 px-6 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30 flex items-center justify-center text-[var(--accent-color)]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-[var(--text-main)]">Thử Đồ Ảo Cá Nhân Hoá (Try On Me)</h3>
              <p className="text-xs text-[var(--text-muted)]">Xem trước đầm voan hoa nhí trên vóc dáng thật của bạn</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-surface)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left: Profile selector & Size Advisor */}
          <div className="md:col-span-5 space-y-5">
            <div>
              <span className="text-[var(--text-muted)] font-mono text-[11px] uppercase block mb-2 font-medium">
                1. Chọn Hồ Sơ Vóc Dáng Cơ Thể
              </span>
              <div className="space-y-2">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedProfile(p)
                      setSizeResult(null)
                    }}
                    className={`w-full p-3 rounded-2xl border text-left transition-all ${
                      selectedProfile.id === p.id
                        ? 'bg-[#1A1D29] border-[#00F5A0] shadow-[0_0_15px_rgba(0,245,160,0.15)]'
                        : 'bg-[#12141D] border-white/[0.06] hover:border-white/[0.15]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-white">{p.label}</span>
                      {selectedProfile.id === p.id && (
                        <Check className="w-3.5 h-3.5 text-[#00F5A0]" />
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-tight mb-2">{p.description}</p>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-400">
                      <span>Ngực: {p.bust}cm</span>
                      <span>Eo: {p.waist}cm</span>
                      <span>Mông: {p.hips}cm</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* AI Size Recommendation Card */}
            <div className="p-4 rounded-2xl bg-[#1A1D29] border border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Tư Vấn Size Chuẩn Xác</span>
                <span className="text-[10px] font-mono text-[#00F5A0] bg-[#00F5A0]/10 px-2 py-0.5 rounded border border-[#00F5A0]/20">
                  IDM-VTON
                </span>
              </div>

              {sizeResult ? (
                <div className="space-y-2 pt-1 text-xs">
                  <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/[0.06]">
                    <span className="text-zinc-300">Size đề xuất:</span>
                    <span className="text-base font-bold font-mono text-[#00F5A0]">Size {sizeResult.recommended_size}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div className="bg-black/20 p-2 rounded-lg">
                      <span className="text-zinc-500 block text-[9px]">Độ vừa vặn:</span>
                      <span className="text-white font-semibold">{sizeResult.confidence}%</span>
                    </div>
                    <div className="bg-black/20 p-2 rounded-lg">
                      <span className="text-zinc-500 block text-[9px]">Che bụng mỡ:</span>
                      <span className="text-[#00F5A0] font-semibold">{sizeResult.fit_score}%</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-400 pt-1 leading-relaxed">
                    {sizeResult.reasoning}
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleRecommendSize}
                  disabled={isAnalyzing}
                  className="w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-medium text-xs transition-all flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#00F5A0]" />
                  <span>{isAnalyzing ? 'Đang phân tích số đo...' : 'Phân Tích Size Phù Hợp'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Right: Interactive Split Screen Slider */}
          <div className="md:col-span-7 flex flex-col items-center">
            <span className="text-zinc-400 font-mono text-[11px] uppercase block mb-2 font-medium self-start">
              2. Kéo Thanh Trượt So Sánh (Trước / Sau)
            </span>

            {/* Split Screen Slider Box */}
            <div className="relative w-full h-[420px] rounded-2xl overflow-hidden border border-white/[0.08] select-none bg-black">
              {/* After image (VTON try on) */}
              <img
                src={selectedProfile.tryonImg}
                alt="Thử đồ ảo AI"
                className="absolute inset-0 w-full h-full object-cover"
              />

              {/* Before image (Original body) clipped */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${sliderPos}%` }}
              >
                <img
                  src={selectedProfile.modelImg}
                  alt="Ảnh gốc trước khi mặc"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ width: '100%', minWidth: '460px' }}
                />
                <span className="absolute top-3 left-3 px-2 py-1 rounded bg-black/60 text-[10px] font-mono text-white backdrop-blur-md">
                  ẢNH DÁNG GỐC
                </span>
              </div>

              {/* Label for After */}
              <span className="absolute top-3 right-3 px-2 py-1 rounded bg-[#00F5A0]/80 text-[10px] font-mono text-black font-bold backdrop-blur-md">
                ĐÃ GHÉP ĐẦM AI
              </span>

              {/* Slider Line & Handle */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_white] cursor-ew-resize z-20"
                style={{ left: `${sliderPos}%` }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white text-black shadow-2xl flex items-center justify-center text-xs font-bold font-mono">
                  ⇆
                </div>
              </div>

              {/* Hidden Range Input on top */}
              <input
                type="range"
                min="5"
                max="95"
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
              />
            </div>

            <div className="flex items-center justify-between w-full mt-2 text-[11px] text-zinc-500 font-mono">
              <span>← Ảnh cơ thể ban đầu</span>
              <span>Kéo trái / phải để so sánh</span>
              <span>Đầm hoa nhí tôn dáng →</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-16 px-6 border-t border-white/[0.08] bg-[#0A0B10]/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Giá bán ưu đãi:</span>
            <span className="text-base font-bold text-white font-mono">189.000đ</span>
            <span className="text-xs text-zinc-500 line-through">350.000đ</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Đóng lại
            </button>
            <button
              onClick={() => {
                onClose()
                onOpenCheckout()
              }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#00D68B] text-black font-semibold text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(0,245,160,0.3)] hover:opacity-95 transition-all"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Tiến Hành Đặt Hàng</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
