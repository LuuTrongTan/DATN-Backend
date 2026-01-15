# Logic Các Bảng Liên Quan Đến Product

## Tổng Quan

Hệ thống quản lý sản phẩm sử dụng nhiều bảng liên kết với nhau để quản lý:
- Thông tin sản phẩm cơ bản
- Biến thể sản phẩm (variants)
- Media (hình ảnh, video)
- Tags
- Tồn kho (stock)
- Đơn hàng và giỏ hàng

---

## 1. Bảng `products` - Sản Phẩm Chính

### Cấu Trúc
```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES categories(id),
  sku VARCHAR(100) UNIQUE,              -- Mã SKU duy nhất
  name VARCHAR(255) NOT NULL,             -- Tên sản phẩm
  description TEXT,                       -- Mô tả
  price INTEGER NOT NULL,                 -- Giá gốc (VND)
  stock_quantity INTEGER DEFAULT 0,        -- Tồn kho tổng
  brand VARCHAR(100),                      -- Thương hiệu
  view_count INTEGER DEFAULT 0,           -- Số lượt xem
  sold_count INTEGER DEFAULT 0,           -- Số lượng đã bán
  is_active BOOLEAN DEFAULT TRUE,         -- Trạng thái hoạt động
  search_vector tsvector,                  -- Vector tìm kiếm full-text
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP                    -- Soft delete
)
```

### Logic Quan Trọng

1. **SKU**: Phải unique, dùng để định danh sản phẩm
2. **stock_quantity**: Tồn kho tổng của sản phẩm (không tính variants)
3. **Soft Delete**: Sử dụng `deleted_at` thay vì xóa vật lý
4. **Price**: Giá gốc, giá thực tế = price + variant.price_adjustment (nếu có variant)

### Indexes
- `idx_products_category`: Tìm theo category
- `idx_products_sku`: Tìm theo SKU
- `idx_products_active`: Lọc sản phẩm active
- `idx_products_search_vector`: Full-text search
- `idx_products_category_active`: Composite index cho filter

---

## 2. Bảng `product_variants` - Biến Thể Sản Phẩm

### Cấu Trúc
```sql
CREATE TABLE product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  sku VARCHAR(100) UNIQUE,                -- SKU riêng cho variant
  variant_type VARCHAR(50) NOT NULL,      -- Loại: Size, Color, Material...
  variant_value VARCHAR(100) NOT NULL,    -- Giá trị: M, L, XL hoặc Đỏ, Xanh...
  price_adjustment INTEGER DEFAULT 0,      -- Điều chỉnh giá (+/- VND)
  stock_quantity INTEGER DEFAULT 0,        -- Tồn kho của variant này
  image_url VARCHAR(500),                  -- Ảnh riêng cho variant
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  CONSTRAINT unique_product_variant UNIQUE (product_id, variant_type, variant_value)
)
```

### Logic Quan Trọng

1. **ON DELETE CASCADE**: Xóa product → tự động xóa variants
2. **Unique Constraint**: Không thể có 2 variants cùng (product_id, variant_type, variant_value)
3. **Price Calculation**: 
   - Giá variant = `products.price + variant.price_adjustment`
   - Nếu không có variant: giá = `products.price`
4. **Stock Management**:
   - Variant có `stock_quantity` riêng
   - Product có `stock_quantity` tổng
   - Khi mua variant: trừ cả 2 stocks

### Ví Dụ
```
Product: Áo thun (price: 200,000 VND)
- Variant Size M: price_adjustment = 0 → giá = 200,000
- Variant Size L: price_adjustment = +20,000 → giá = 220,000
- Variant Màu Đỏ: price_adjustment = 0, có image_url riêng
```

---

## 3. Bảng `product_media` - Hình Ảnh và Video

### Cấu Trúc
```sql
CREATE TABLE product_media (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL DEFAULT 'image',  -- 'image' hoặc 'video'
  image_url VARCHAR(500) NOT NULL,            -- URL của media
  alt_text VARCHAR(255),                      -- Alt text cho SEO
  display_order INTEGER DEFAULT 0,            -- Thứ tự hiển thị
  is_primary BOOLEAN DEFAULT FALSE,           -- Ảnh chính
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### Logic Quan Trọng

1. **ON DELETE CASCADE**: Xóa product → tự động xóa media
2. **Type**: 
   - `'image'`: Hình ảnh (có thể nhiều)
   - `'video'`: Video (thường chỉ 1)
3. **Display Order**: Sắp xếp theo `display_order`, sau đó theo `id`
4. **Primary Image**: `is_primary = TRUE` cho ảnh đầu tiên
5. **Query Pattern**:
   ```sql
   -- Lấy tất cả ảnh
   SELECT array_agg(image_url ORDER BY display_order, id)
   FROM product_media
   WHERE product_id = ? AND type = 'image'
   
   -- Lấy video đầu tiên
   SELECT image_url
   FROM product_media
   WHERE product_id = ? AND type = 'video'
   ORDER BY display_order, id
   LIMIT 1
   ```

### Frontend Usage
- `image_urls`: Array các URL ảnh
- `image_urls[0]`: Ảnh chính để hiển thị
- `video_url`: URL video (nếu có)

---

## 4. Bảng `product_tags` và `product_tag_relations` - Tags

### Cấu Trúc
```sql
CREATE TABLE product_tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,      -- Tên tag: "Bestseller", "New"
  slug VARCHAR(100) UNIQUE NOT NULL,      -- Slug: "bestseller", "new"
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

CREATE TABLE product_tag_relations (
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES product_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, tag_id)         -- Many-to-many relationship
)
```

### Logic Quan Trọng

1. **Many-to-Many**: Một product có nhiều tags, một tag có nhiều products
2. **ON DELETE CASCADE**: Xóa product/tag → tự động xóa relations
3. **Composite Primary Key**: Đảm bảo không trùng (product_id, tag_id)

---

## 5. Bảng `cart_items` - Giỏ Hàng

### Cấu Trúc
```sql
CREATE TABLE cart_items (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  product_id INTEGER REFERENCES products(id),
  variant_id INTEGER REFERENCES product_variants(id),  -- NULL nếu không có variant
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### Logic Quan Trọng

1. **Variant Support**: 
   - Nếu có `variant_id`: mua variant cụ thể
   - Nếu `variant_id = NULL`: mua sản phẩm gốc
2. **Price Calculation**:
   ```typescript
   if (variant_id) {
     price = product.price + variant.price_adjustment
   } else {
     price = product.price
   }
   ```
3. **Stock Check**: Kiểm tra stock của variant (nếu có) hoặc product

---

## 6. Bảng `order_items` - Chi Tiết Đơn Hàng

### Cấu Trúc
```sql
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  variant_id INTEGER REFERENCES product_variants(id),  -- NULL nếu không có variant
  quantity INTEGER NOT NULL,
  price INTEGER NOT NULL,                               -- Giá tại thời điểm đặt hàng
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### Logic Quan Trọng

1. **Price Snapshot**: Lưu giá tại thời điểm đặt hàng (không thay đổi)
2. **Variant Support**: Tương tự cart_items
3. **Stock Deduction**: Khi order được confirm → trừ stock
   ```sql
   -- Trừ stock variant (nếu có)
   UPDATE product_variants 
   SET stock_quantity = stock_quantity - quantity
   WHERE id = variant_id
   
   -- Trừ stock product
   UPDATE products 
   SET stock_quantity = stock_quantity - quantity
   WHERE id = product_id
   ```

---

## 7. Bảng `wishlist` - Yêu Thích

### Cấu Trúc
```sql
CREATE TABLE wishlist (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  product_id INTEGER REFERENCES products(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### Logic Quan Trọng

1. **Simple Many-to-Many**: User ↔ Product
2. **No Variant**: Chỉ lưu product_id, không lưu variant cụ thể
3. **Unique Constraint**: Nên có UNIQUE(user_id, product_id) để tránh trùng

---

## Quan Hệ Giữa Các Bảng

```
products (1) ──< (N) product_variants
products (1) ──< (N) product_media
products (1) ──< (N) product_tag_relations ──> (N) product_tags
products (1) ──< (N) cart_items
products (1) ──< (N) order_items
products (1) ──< (N) wishlist

product_variants (1) ──< (N) cart_items
product_variants (1) ──< (N) order_items
```

---

## Logic Tính Toán Quan Trọng

### 1. Giá Sản Phẩm
```typescript
function getProductPrice(product: Product, variant?: ProductVariant): number {
  if (variant) {
    return product.price + variant.price_adjustment;
  }
  return product.price;
}
```

### 2. Tồn Kho
```typescript
function getAvailableStock(product: Product, variant?: ProductVariant): number {
  if (variant) {
    return variant.stock_quantity; // Ưu tiên variant stock
  }
  return product.stock_quantity; // Stock tổng
}
```

### 3. Query Product với Media
```sql
SELECT 
  p.*,
  c.name as category_name,
  -- Tất cả ảnh
  (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
   FROM product_media pm
   WHERE pm.product_id = p.id AND pm.type = 'image') AS image_urls,
  -- Video đầu tiên
  (SELECT pm.image_url
   FROM product_media pm
   WHERE pm.product_id = p.id AND pm.type = 'video'
   ORDER BY pm.display_order, pm.id
   LIMIT 1) AS video_url
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.id = ?
```

### 4. Trừ Stock Khi Đặt Hàng
```sql
-- Trừ stock variant (nếu có)
UPDATE product_variants 
SET stock_quantity = stock_quantity - :quantity,
    updated_at = NOW()
WHERE id = :variant_id AND stock_quantity >= :quantity;

-- Trừ stock product
UPDATE products 
SET stock_quantity = stock_quantity - :quantity,
    updated_at = NOW()
WHERE id = :product_id AND stock_quantity >= :quantity;

```

---

## Best Practices

1. **Soft Delete**: Luôn dùng `deleted_at` thay vì DELETE thật
2. **CASCADE**: Sử dụng ON DELETE CASCADE cho các bảng phụ thuộc
3. **Stock Management**: Cập nhật trực tiếp `stock_quantity` trên `products` hoặc `product_variants` (không ghi history)
4. **Price Snapshot**: Lưu giá trong `order_items` để không bị ảnh hưởng khi giá thay đổi
5. **Media Query**: Luôn query `product_media` để lấy images, không lưu trong `products`
6. **Indexes**: Đảm bảo có indexes cho các trường thường query (category_id, is_active, deleted_at)

---

## Các Vấn Đề Cần Lưu Ý

1. **Stock Sync**: Cần đồng bộ stock giữa `products.stock_quantity` và tổng `product_variants.stock_quantity`
2. **Image URLs**: Không lưu trong `products` table, chỉ query từ `product_media`
3. **Variant Price**: Luôn tính `price + price_adjustment` khi hiển thị
4. **Unique Constraints**: Đảm bảo SKU unique và variant (product_id, variant_type, variant_value) unique

