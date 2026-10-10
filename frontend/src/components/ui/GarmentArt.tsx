import React, { useId } from 'react'

type Garment = 'dress' | 'tee' | 'blazer'

const SHAPES: Record<Garment, { body: string; details: string[] }> = {
  dress: {
    body: 'M48 18h6l6 12 6-12h6l4 22q-4 18 0 30l26 112q-42 10-84 0l26-112q4-12 0-30z',
    details: ['M44 70h32', 'M56 74 47 182', 'M64 74l9 108', 'M60 74v110'],
  },
  tee: {
    body: 'M32 28l18-9q10 10 20 0l18 9 18 28-16 10-4-8v112H34V58l-4 8-16-10z',
    details: ['M50 19q10 14 20 0', 'M34 150h52'],
  },
  blazer: {
    body: 'M36 28l16-8 8 32 8-32 16 8 16 12 6 100-12 2-4-72v102H30V70l-4 72-12-2 6-100z',
    details: ['M52 20l8 32 8-32', 'M60 52v120', 'M36 120h14', 'M70 120h14'],
  },
}

interface GarmentArtProps {
  garment: Garment
  /** Hai màu vải: sáng → đậm */
  colors: [string, string]
  className?: string
}

/** Hình vẽ trang phục đơn giản dùng làm minh họa (không cần ảnh ngoài). */
export const GarmentArt: React.FC<GarmentArtProps> = ({ garment, colors, className = '' }) => {
  const id = useId()
  const shape = SHAPES[garment]
  return (
    <svg viewBox="0 0 120 200" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-fabric`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[1]} />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="192" rx="44" ry="5" fill="#000" opacity="0.08" />
      <path d={shape.body} fill={`url(#${id}-fabric)`} />
      {shape.details.map((d) => (
        <path key={d} d={d} fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="1.4" strokeLinecap="round" />
      ))}
      {garment === 'blazer' && (
        <>
          <circle cx="60" cy="96" r="2.2" fill="#fff" opacity="0.6" />
          <circle cx="60" cy="112" r="2.2" fill="#fff" opacity="0.6" />
        </>
      )}
    </svg>
  )
}

/** Móc treo đồ: minh họa cho trạng thái trống */
export const HangerArt: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 96 64" className={className} fill="none" aria-hidden="true">
    <path
      d="M48 18c0-5 3.5-8 7.5-8S63 13 63 17c0 6-8 6-13 11L8 50c-3 2-2 6 2 6h76c4 0 5-4 2-6L48 28"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
