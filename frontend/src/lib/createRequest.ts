import type { AIJob, MyVideo } from '../types'

/** Sản phẩm nạp sẵn vào bước 2 (từ Sản phẩm của tôi hoặc video cũ) */
export interface ProductSeed {
  id: string | null
  image_url: string | null
  title: string
  price: number | null
  original_price: number | null
  category: string | null
  fabric: string | null
}

/**
 * Mở trang Tạo video với dữ liệu có sẵn: "Tạo lại" ở Video của tôi (sản phẩm + cài đặt + lời review),
 * "Tạo video" ở Sản phẩm của tôi (chỉ sản phẩm), "Dùng mẫu này" ở Người mẫu AI (chỉ người mẫu).
 * at đổi mỗi lần bấm để bấm lại cùng một mục vẫn có tác dụng.
 */
export interface CreateRequest {
  product?: ProductSeed
  params?: AIJob['params']
  script?: string | null
  avatarId?: string
  at: number
}

export const seedFromVideo = (v: MyVideo): CreateRequest => ({
  product: {
    id: v.product_id ?? null, image_url: v.product_image_url, title: v.product_title ?? '', price: v.product_price ?? null,
    original_price: v.product_original_price ?? null, category: v.product_category ?? null, fabric: v.product_fabric ?? null,
  },
  params: v.params,
  script: v.params?.custom_script || v.script?.full_script || null,
  at: Date.now(),
})
