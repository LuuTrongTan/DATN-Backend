# Debug: Lỗi Cập Nhật Product Images

## Vấn Đề
Khi cập nhật sản phẩm và thêm 3 ảnh, gặp lỗi:
```json
{
    "success": false,
    "message": "Lỗi khi cập nhật sản phẩm",
    "error": {
        "code": "INTERNAL_ERROR"
    }
}
```

## Nguyên Nhân Có Thể

### 1. Constraint Check
- Migration có thể đã thêm constraint `chk_product_or_variant_id` yêu cầu ít nhất một trong hai (`product_id` hoặc `variant_id`) phải có giá trị
- Nếu constraint này không tồn tại hoặc có vấn đề, INSERT có thể fail

### 2. Product ID NULL
- Có thể `product_id` bị NULL khi insert
- Kiểm tra xem `id` có giá trị đúng không

### 3. Image URLs Format
- Có thể `image_urls` không đúng format (không phải array hoặc string)
- Có thể có URL không hợp lệ

## Cách Debug

### Bước 1: Kiểm Tra Logs Backend
Xem logs backend để biết lỗi cụ thể:
```bash
# Xem logs error
tail -f logs/error-*.log
# hoặc
tail -f logs_local/error-*.log
```

### Bước 2: Kiểm Tra Database Constraints
```sql
-- Kiểm tra constraints trên product_media
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'product_media'::regclass;

-- Kiểm tra cấu trúc bảng
\d product_media
```

### Bước 3: Test Query Trực Tiếp
```sql
-- Test insert với product_id và variant_id = NULL
INSERT INTO product_media (product_id, variant_id, type, image_url, display_order, is_primary)
VALUES (1, NULL, 'image', 'https://example.com/test.jpg', 0, TRUE);

-- Nếu query này fail → Có vấn đề với constraint hoặc schema
```

### Bước 4: Kiểm Tra Migration Đã Chạy
```sql
-- Kiểm tra migration đã chạy chưa
SELECT name, executed_at 
FROM migrations 
WHERE name = '20251222_000001_add_variant_id_to_product_media';

-- Kiểm tra cột variant_id đã có chưa
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'product_media' AND column_name = 'variant_id';
```

## Giải Pháp Đã Áp Dụng

### 1. Cải Thiện Error Handling
- Thêm try-catch riêng cho phần insert images
- Log chi tiết error message, code, detail, hint
- Throw error với message rõ ràng

### 2. Sửa DELETE Query
- Thêm `AND variant_id IS NULL` để chỉ xóa product images
- Không xóa variant images

### 3. Sửa INSERT Query
- Set `variant_id = NULL` rõ ràng cho product images
- Đảm bảo `product_id` có giá trị

### 4. Sửa SELECT Query
- Thêm `AND variant_id IS NULL` để chỉ lấy product images
- Không lấy variant images

### 5. Thêm Constraint Check vào Migration
- Đảm bảo ít nhất một trong hai (`product_id` hoặc `variant_id`) phải có giá trị
- Chỉ thêm constraint nếu chưa tồn tại

## Nếu Vẫn Lỗi

1. **Chạy lại migration**:
   ```bash
   cd DATN-Backend
   npm run migrate:up
   ```

2. **Kiểm tra logs backend** để xem error message cụ thể

3. **Kiểm tra database** xem có constraint nào conflict không

4. **Test query trực tiếp** trong database để xác định vấn đề

## Code Đã Sửa

### Backend Controller (`products.controller.ts`)
- ✅ DELETE query: `AND variant_id IS NULL`
- ✅ INSERT query: `variant_id = NULL` rõ ràng
- ✅ SELECT query: `AND variant_id IS NULL`
- ✅ Error handling chi tiết hơn

### Migration (`20251222_000001_add_variant_id_to_product_media.ts`)
- ✅ Thêm constraint check (nếu chưa tồn tại)
- ✅ Update existing records với product_id NULL

