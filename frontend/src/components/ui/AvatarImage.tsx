import React, { useState } from 'react'

interface AvatarImageProps {
  src: string
  name: string
  className?: string
}

/** Ảnh người mẫu; nếu ảnh không tải được thì hiện chữ cái đầu trên nền màu vải thay vì biểu tượng ảnh lỗi. */
export const AvatarImage: React.FC<AvatarImageProps> = ({ src, name, className = '' }) => {
  const [failed, setFailed] = useState(false)
  if (failed || !src) {
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-[#EED9DF] via-[#F3E7DC] to-[#E6D3C1] dark:from-[#3A2A2F] dark:via-[#2F2622] dark:to-[#3A3027] text-[#7A4255] dark:text-[#EBB3C3] font-display text-3xl font-semibold ${className}`}
        role="img"
        aria-label={name}
      >
        {initials || '?'}
      </div>
    )
  }
  return <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />
}
