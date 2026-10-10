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
        className={`flex items-center justify-center bg-gradient-to-br from-[var(--accent-soft)] via-[var(--bg-surface)] to-[var(--gold-soft)] text-[var(--accent-text)] font-display text-3xl font-semibold ${className}`}
        role="img"
        aria-label={name}
      >
        {initials || '?'}
      </div>
    )
  }
  return <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />
}
