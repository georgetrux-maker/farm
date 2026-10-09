import React, { useState } from 'react'
import { X, ShoppingBag, ExternalLink, ShieldCheck, Truck } from 'lucide-react'

interface QuickCheckoutDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export const QuickCheckoutDrawer: React.FC<QuickCheckoutDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const [selectedSize, setSelectedSize] = useState('M')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-lg bg-[#12141D] border border-white/[0.08] rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[#00F5A0]" />
            <h3 className="font-semibold text-sm text-white">Mua Hàng 1 Chạm</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Product snippet */}
        <div className="flex gap-4 p-3 rounded-2xl bg-[#1A1D29] border border-white/[0.06] mb-4">
          <img
            src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=300&q=80"
            alt="Đầm Voan Tơ Hoa Nhí"
            className="w-20 h-24 object-cover rounded-xl"
          />
          <div className="flex-1 flex flex-col justify-between py-1">
            <div>
              <h4 className="font-semibold text-xs text-white leading-tight mb-1">
                Đầm Voan Tơ Hoa Nhí Cổ Vuông Dáng Xòe
              </h4>
              <span className="text-[10px] text-zinc-400 block">Chất liệu: Voan tơ cao cấp 2 lớp mềm mịn</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold text-[#00F5A0] font-mono">189.000đ</span>
              <span className="text-[11px] text-zinc-500 line-through">350.000đ</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-mono">-46%</span>
            </div>
          </div>
        </div>

        {/* Size Selection */}
        <div className="mb-4">
          <label className="text-[11px] text-zinc-400 font-medium block mb-2">Chọn Size (Khuyên dùng: Size M)</label>
          <div className="grid grid-cols-3 gap-2">
            {['S (40-47kg)', 'M (48-54kg)', 'L (55-62kg)'].map((size) => {
              const code = size.split(' ')[0]
              const isSelected = selectedSize === code
              return (
                <button
                  key={code}
                  onClick={() => setSelectedSize(code)}
                  className={`py-2 rounded-xl text-xs font-mono transition-all border ${
                    isSelected
                      ? 'bg-[#00F5A0]/10 border-[#00F5A0] text-[#00F5A0] font-semibold'
                      : 'bg-[#1A1D29] border-white/[0.06] text-zinc-300 hover:text-white'
                  }`}
                >
                  {size}
                </button>
              )
            })}
          </div>
        </div>

        {/* Guarantees */}
        <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400 mb-5">
          <div className="flex items-center gap-1.5 bg-white/[0.02] p-2 rounded-lg border border-white/[0.04]">
            <Truck className="w-3.5 h-3.5 text-[#00F5A0]" />
            <span>Freeship toàn quốc</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/[0.02] p-2 rounded-lg border border-white/[0.04]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00F5A0]" />
            <span>Đổi trả 7 ngày miễn phí</span>
          </div>
        </div>

        {/* Checkout Buttons */}
        <div className="space-y-2">
          <a
            href="https://shopee.vn"
            target="_blank"
            rel="noreferrer"
            className="w-full py-3 rounded-xl bg-[#EE4D2D] hover:bg-[#D73211] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors shadow-lg"
          >
            <span>Mua Nhanh Qua Shopee</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href="https://tiktok.com"
            target="_blank"
            rel="noreferrer"
            className="w-full py-3 rounded-xl bg-black border border-white/20 hover:border-white/40 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <span>Mua Nhanh Qua TikTok Shop</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
