# Hướng Dẫn Hệ Thống Biến Thể Sản Phẩm

## Tổng Quan

Hệ thống biến thể mới hỗ trợ **nhiều thuộc tính kết hợp** cho một sản phẩm. Ví dụ: một sản phẩm có thể có cả **Size** (M, L, XL) và **Color** (Đỏ, Xanh) cùng lúc.

## Cấu Trúc Database

### 1. `variant_attribute_definitions`
Định nghĩa các thuộc tính có thể có cho sản phẩm.

**Ví dụ:**
```sql
INSERT INTO variant_attribute_definitions (product_id, attribute_name, display_name, display_order, is_required)
VALUES 
  (1, 'Size', 'Kích cỡ', 1, true),
  (1, 'Color', 'Màu sắc', 2, true);
```

### 2. `variant_attribute_values`
Lưu các giá trị có thể có của từng thuộc tính.

**Ví dụ:**
```sql
-- Giá trị cho Size
INSERT INTO variant_attribute_values (definition_id, value, display_order)
VALUES 
  (1, 'M', 1),
  (1, 'L', 2),
  (1, 'XL', 3);

-- Giá trị cho Color
INSERT INTO variant_attribute_values (definition_id, value, display_order)
VALUES 
  (2, 'Đỏ', 1),
  (2, 'Xanh', 2),
  (2, 'Vàng', 3);
```

### 3. `product_variants`
Lưu các biến thể kết hợp dạng JSONB.

**Ví dụ:**
```sql
INSERT INTO product_variants (product_id, sku, variant_attributes, price_adjustment, stock_quantity)
VALUES 
  (1, 'AO-THUN-001-M-DO', '{"Size": "M", "Color": "Đỏ"}'::jsonb, 0, 50),
  (1, 'AO-THUN-001-M-XANH', '{"Size": "M", "Color": "Xanh"}'::jsonb, 0, 30),
  (1, 'AO-THUN-001-L-DO', '{"Size": "L", "Color": "Đỏ"}'::jsonb, 50000, 40);
```

## Cách Sử Dụng

### Bước 1: Tạo định nghĩa thuộc tính cho sản phẩm

```typescript
// POST /api/products/:product_id/variant-attributes
{
  "attribute_name": "Size",
  "display_name": "Kích cỡ",
  "display_order": 1,
  "is_required": true
}
```

### Bước 2: Thêm giá trị cho từng thuộc tính

```typescript
// POST /api/products/:product_id/variant-attributes/:definition_id/values
{
  "value": "M",
  "display_order": 1
}
```

### Bước 3: Tạo biến thể kết hợp

```typescript
// POST /api/products/:product_id/variants
{
  "sku": "AO-THUN-001-M-DO",
  "variant_attributes": {
    "Size": "M",
    "Color": "Đỏ"
  },
  "price_adjustment": 0,
  "stock_quantity": 50
}
```

## Query Examples

### Tìm tất cả biến thể có Size = "M"
```sql
SELECT * FROM product_variants 
WHERE variant_attributes->>'Size' = 'M' 
AND deleted_at IS NULL;
```

### Tìm biến thể có cả Size = "M" và Color = "Đỏ"
```sql
SELECT * FROM product_variants 
WHERE variant_attributes->>'Size' = 'M' 
AND variant_attributes->>'Color' = 'Đỏ'
AND deleted_at IS NULL;
```

### Lấy tất cả biến thể của sản phẩm, nhóm theo thuộc tính
```sql
SELECT 
  variant_attributes->>'Size' as size,
  variant_attributes->>'Color' as color,
  stock_quantity,
  price_adjustment
FROM product_variants 
WHERE product_id = 1 
AND deleted_at IS NULL
ORDER BY variant_attributes;
```

## Lợi Ích

1. **Linh hoạt**: Hỗ trợ bất kỳ số lượng thuộc tính nào (Size, Color, Material, Style...)
2. **Dễ mở rộng**: Thêm thuộc tính mới không cần thay đổi cấu trúc database
3. **Query nhanh**: Sử dụng GIN index cho JSONB
4. **Toàn vẹn dữ liệu**: Constraint UNIQUE đảm bảo không trùng kết hợp

## Migration Notes

- Cấu trúc cũ: `variant_type` + `variant_value` (chỉ 1 thuộc tính)
- Cấu trúc mới: `variant_attributes` JSONB (nhiều thuộc tính kết hợp)
- Cần cập nhật tất cả code sử dụng `variant_type` và `variant_value`



