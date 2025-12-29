# Fix: Lỗi Tạo Biến Thể với Images

## Nguyên Nhân

Lỗi `{"success":false,"message":"Lỗi tạo biến thể","error":{"code":"INTERNAL_ERROR"}}` xảy ra vì:

1. **Migration chưa chạy**: Cột `variant_id` chưa tồn tại trong bảng `product_media`
2. Backend cố gắng INSERT vào `product_media` với `variant_id` nhưng cột này chưa có

## Giải Pháp

### Bước 1: Chạy Migration

Migration mới đã được thêm vào `migrations/index.ts`. Cần chạy migration để thêm cột `variant_id`:

```bash
cd DATN-Backend
npm run migrate
```

Hoặc nếu có script riêng:

```bash
npm run db:migrate
```

Hoặc chạy trực tiếp:

```bash
node dist/connections/db/migrate.js
```

### Bước 2: Kiểm Tra Migration Đã Chạy

Kiểm tra trong database:

```sql
-- Kiểm tra cột variant_id đã có chưa
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'product_media' AND column_name = 'variant_id';

-- Nếu có kết quả trả về thì migration đã chạy thành công
```

### Bước 3: Kiểm Tra Logs Backend

Nếu vẫn lỗi, kiểm tra logs backend để xem chi tiết:

```bash
# Xem logs
tail -f logs/error-*.log
# hoặc
tail -f logs_local/error-*.log
```

Logs sẽ hiển thị chi tiết lỗi, ví dụ:
- `column "variant_id" does not exist` → Migration chưa chạy
- `null value in column "product_id"` → Thiếu product_id
- Các lỗi khác → Xem chi tiết trong logs

## Kiểm Tra Migration Status

Kiểm tra migration đã chạy chưa:

```sql
SELECT name, executed_at 
FROM migrations 
WHERE name = '20251222_000001_add_variant_id_to_product_media';
```

Nếu không có kết quả → Migration chưa chạy.

## Chạy Migration Thủ Công (Nếu Cần)

Nếu migration script không chạy được, có thể chạy SQL trực tiếp:

```sql
-- Thêm cột variant_id
ALTER TABLE product_media
ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE CASCADE;

-- Thêm indexes
CREATE INDEX IF NOT EXISTS idx_product_media_variant ON product_media(variant_id)
WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_media_product_variant ON product_media(product_id, variant_id);
```

## Sau Khi Chạy Migration

1. Restart backend server
2. Thử tạo variant với images lại
3. Kiểm tra logs nếu vẫn lỗi

## Debug Thêm

Nếu vẫn lỗi sau khi chạy migration, kiểm tra:

1. **Validation Schema**: Kiểm tra `image_urls` có được parse đúng không
2. **Request Body**: Xem frontend gửi `image_urls` dưới dạng gì (array hay string)
3. **Database Connection**: Đảm bảo backend kết nối đúng database
4. **Foreign Key Constraint**: Kiểm tra `product_variants` table có đúng không

## Test Query

Test query trực tiếp trong database:

```sql
-- Test insert variant image
INSERT INTO product_media (product_id, variant_id, type, image_url, display_order, is_primary)
VALUES (1, 1, 'image', 'https://example.com/image.jpg', 0, TRUE);

-- Nếu query này chạy được → Migration đã OK
-- Nếu lỗi "column variant_id does not exist" → Cần chạy migration
```

