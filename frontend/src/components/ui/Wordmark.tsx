import React from 'react'

/** Logo chữ kiểu nhãn hiệu thời trang */
export const Wordmark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`font-display font-semibold tracking-[0.24em] pl-[0.24em] ${className}`}>AURA</span>
)
