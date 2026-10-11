import React from 'react'
import { GarmentArt } from './GarmentArt'

/** Ba "video" minh họa: trang phục vẽ bằng SVG trên phông nền studio */
const SHOWCASE = [
  {
    garment: 'blazer' as const,
    colors: ['#3F3531', '#1E1916'] as [string, string],
    backdrop: 'from-[#EFE4D8] to-[#DCC8B4]',
    price: '459.000đ',
    caption: 'Blazer form chuẩn, đi làm là đẹp',
    pos: 'left-0 top-16 w-[44%] rotate-[-5deg] animate-float-slow',
  },
  {
    garment: 'dress' as const,
    colors: ['#D896A9', '#A8506A'] as [string, string],
    backdrop: 'from-[#F6E7EA] to-[#E9CBD3]',
    price: '289.000đ',
    caption: 'Mặc lên nhẹ tênh, xòe cực xinh!',
    pos: 'left-[28%] top-0 w-[46%] z-10 animate-float',
  },
  {
    garment: 'tee' as const,
    colors: ['#A9BFAE', '#6F8C76'] as [string, string],
    backdrop: 'from-[#E8EEE6] to-[#CFDCCD]',
    price: '159.000đ',
    caption: 'Cotton mát lạnh, phối gì cũng hợp',
    pos: 'right-0 top-24 w-[42%] rotate-[5deg] animate-float-slow [animation-delay:-3s]',
    priceRight: true,
  },
]

/** Ba khung điện thoại "video" minh họa xếp chồng nhẹ (trang đăng nhập, trang giới thiệu) */
export const PhoneMockups: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative ${className}`} aria-hidden="true">
    {SHOWCASE.map((s) => (
      <div key={s.garment} className={`absolute ${s.pos}`}>
        <div className="phone-frame">
          <div className={`relative aspect-[9/16] overflow-hidden bg-gradient-to-b ${s.backdrop}`}>
            <span className={`absolute top-3 ${'priceRight' in s ? 'right-3' : 'left-3'} glass rounded-full px-2.5 py-1 text-xs font-semibold`}>
              {s.price}
            </span>
            <GarmentArt garment={s.garment} colors={s.colors} className="absolute inset-x-[16%] top-[16%] h-[62%]" />
            <span className="absolute bottom-4 inset-x-3 text-center text-xs font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
              {s.caption}
            </span>
          </div>
        </div>
      </div>
    ))}
  </div>
)
