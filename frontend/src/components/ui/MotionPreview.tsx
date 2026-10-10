import React, { useEffect, useState } from 'react'

/**
 * Mô phỏng góc quay của từng mẫu video ngay trên ảnh (khung dọc 9:16), kèm phụ đề mẫu chạy theo câu.
 * Dùng ở Thư viện mẫu (khi chưa có video mẫu thật) và ở ô chọn góc quay khi tạo video.
 */
export const MotionPreview: React.FC<{
  image: string
  template: string
  playing: boolean
  captions?: string[]
  className?: string
  alt?: string
}> = ({ image, template, playing, captions, className = '', alt = '' }) => {
  const [line, setLine] = useState(0)

  useEffect(() => {
    if (!playing || !captions || captions.length < 2) return
    const id = setInterval(() => setLine((n) => (n + 1) % captions.length), 2200)
    return () => clearInterval(id)
  }, [playing, captions])

  return (
    <div className={`relative overflow-hidden bg-[var(--bg-surface)] aspect-[9/16] ${className}`}>
      <img
        src={image}
        alt={alt}
        loading="lazy"
        className={`absolute inset-0 w-full h-full object-cover motion-preview motion-${template} ${playing ? 'is-playing' : ''}`}
      />
      {captions && captions.length > 0 && playing && (
        <div className="absolute inset-x-3 bottom-[14%] flex justify-center pointer-events-none">
          <span key={line} className="motion-caption animate-fade-in">
            {captions[line % captions.length]}
          </span>
        </div>
      )}
    </div>
  )
}
