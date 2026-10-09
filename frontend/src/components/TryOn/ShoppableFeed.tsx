import React, { useState, useRef } from 'react'
import { Volume2, VolumeX, Sparkles, ShoppingBag, Heart, MessageCircle, Bookmark, Share2 } from 'lucide-react'
import type { ProductHotspot } from '../../types'

interface ShoppableFeedProps {
  videoUrl: string
  onOpenTryOn: () => void
  onOpenCheckout: () => void
}

export const ShoppableFeed: React.FC<ShoppableFeedProps> = ({
  videoUrl,
  onOpenTryOn,
  onOpenCheckout,
}) => {
  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(true)
  const [activeHotspot, setActiveHotspot] = useState<ProductHotspot | null>(null)
  const [liked, setLiked] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const hotspots: ProductHotspot[] = [
    {
      id: 'collar',
      x: 50,
      y: 34,
      label: 'Cổ Vuông Viền Ren Tơ',
      detail: 'Thiết kế cổ vuông tôn xương quai xanh, viền ren nhập khẩu mềm mịn không gây cọ xát da.',
      price: '189.000đ',
    },
    {
      id: 'waist',
      x: 50,
      y: 53,
      label: 'Chiết Eo Tỉ Lệ Vàng',
      detail: 'Bản thắt eo co giãn nhẹ nhàng, che khuyết điểm vòng 2 và nâng hông tự nhiên.',
      price: '189.000đ',
    },
  ]

  const togglePlay = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    } else {
      videoRef.current.play()
      setIsPlaying(true)
    }
  }

  const toggleMute = () => {
    if (!videoRef.current) return
    videoRef.current.muted = !isMuted
    setIsMuted(!isMuted)
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[var(--bg-app)] p-4 transition-colors">
      {/* 9:16 Phone Mockup Container */}
      <div className="relative w-[340px] h-[640px] rounded-[36px] bg-[var(--bg-card)] border-[4px] border-[var(--border-strong)] shadow-2xl overflow-hidden flex flex-col">
        {/* Top Speaker / Dynamic Island */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-4 bg-black rounded-full z-30" />

        {/* Video Element */}
        <div className="relative flex-1 bg-black overflow-hidden cursor-pointer" onClick={togglePlay}>
          <video
            ref={videoRef}
            src={videoUrl}
            autoPlay
            loop
            muted={isMuted}
            playsInline
            className="w-full h-full object-cover"
          />

          {/* Interactive Hotspots Layer */}
          {hotspots.map((spot) => (
            <div
              key={spot.id}
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              onClick={(e) => {
                e.stopPropagation()
                setActiveHotspot(activeHotspot?.id === spot.id ? null : spot)
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 group cursor-pointer"
            >
              <div className="relative flex items-center justify-center">
                <span className="absolute w-6 h-6 rounded-full bg-[#00F5A0]/40 animate-ping-slow" />
                <span className="relative w-4 h-4 rounded-full bg-[#00F5A0] border-2 border-black flex items-center justify-center text-[8px] font-bold text-black shadow-lg">
                  +
                </span>
              </div>
            </div>
          ))}

          {/* Hotspot Tooltip Popover */}
          {activeHotspot && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-28 left-4 right-4 bg-[#12141D]/95 backdrop-blur-md p-3.5 rounded-2xl border border-[#00F5A0]/40 z-30 shadow-2xl animate-in fade-in"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-xs text-white">{activeHotspot.label}</span>
                <span className="text-xs font-mono font-bold text-[#00F5A0]">{activeHotspot.price}</span>
              </div>
              <p className="text-[11px] text-zinc-300 leading-relaxed mb-2.5">{activeHotspot.detail}</p>
              <button
                onClick={() => {
                  setActiveHotspot(null)
                  onOpenTryOn()
                }}
                className="w-full py-1.5 rounded-lg bg-[#00F5A0] text-black font-semibold text-[11px] flex items-center justify-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Thử Lên Dáng Người Tôi
              </button>
            </div>
          )}

          {/* Play / Sound Overlay Controls */}
          <div className="absolute top-8 right-3 flex flex-col gap-2 z-20">
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleMute()
              }}
              className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-[#00F5A0]" />}
            </button>
          </div>

          {/* Right Action Icons (TikTok style) */}
          <div className="absolute right-3 bottom-24 flex flex-col items-center gap-3 z-20 text-white">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setLiked(!liked)
              }}
              className="flex flex-col items-center gap-0.5"
            >
              <div className={`w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center ${liked ? 'text-red-500' : 'text-white'}`}>
                <Heart className={`w-4 h-4 ${liked ? 'fill-red-500' : ''}`} />
              </div>
              <span className="text-[9px] font-mono font-semibold">12.4K</span>
            </button>
            <button onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white">
                <MessageCircle className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-mono font-semibold">342</span>
            </button>
            <button onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white">
                <Bookmark className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-mono font-semibold">1.2K</span>
            </button>
            <button onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5">
              <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white">
                <Share2 className="w-4 h-4" />
              </div>
              <span className="text-[9px] font-mono font-semibold">89</span>
            </button>
          </div>

          {/* Bottom Captions Overlay */}
          <div className="absolute bottom-20 left-4 right-16 z-20 text-white pointer-events-none">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold">@linhchi.fashion</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/20 uppercase font-mono">KOC</span>
            </div>
            <p className="text-[11px] text-zinc-200 line-clamp-2 leading-snug">
              Đầm Voan Tơ Hoa Nhí Cao Cấp, bồng bềnh nữ tính, tôn dáng và che bụng mỡ cực đỉnh!
            </p>
          </div>

          {/* Bottom Interactive Bar */}
          <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenTryOn()
              }}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#00D68B] text-black font-semibold text-xs flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(0,245,160,0.4)] hover:opacity-95 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>THỬ LÊN TÔI</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenCheckout()
              }}
              className="px-3 py-2.5 rounded-xl bg-[#1A1D29]/90 backdrop-blur-md border border-white/10 text-white font-semibold text-xs flex items-center justify-center gap-1 hover:bg-[#1A1D29] transition-all"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-[#00F5A0]" />
              <span>189K</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
