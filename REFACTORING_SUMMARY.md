# Tóm tắt Refactoring Backend Models

## Tổng quan
Đã refactor toàn bộ models trong `Backend/src/connections/db/models/` để đồng nhất với database schema trong `database_schema.dbml`.

## Các thay đổi chính

### 1. User Model (`user.model.ts`)
- ✅ **id**: Đổi từ `number` → `string` (UUID)
- ✅ **phone**: Đổi từ `string | null` → `string` (REQUIRED, unique)
- ✅ Thêm các trường: `avatar_url`, `date_of_birth`, `gender`, `last_login_at`

### 2. Product Model (`product.model.ts`)
- ✅ Thêm các trường: `sku` (unique, required), `brand`, `view_count`, `sold_count`, `search_vector`, `deleted_at`
- ✅ **price**: Giữ nguyên `number` nhưng lưu ý là `integer` (VND) trong database

### 3. Order Model (`order.model.ts`)
- ✅ **user_id**: Đổi từ `number` → `string` (UUID)
- ✅ Thêm các trường: `customer_name`, `customer_phone`, `customer_email`, `subtotal`, `discount_amount`, `tax_amount`, `cancelled_at`, `cancelled_by` (UUID), `cancellation_reason`, `delivery_date`, `deleted_at`
- ✅ **order_status**: Sửa từ `'shipped'` → `'shipping'` để đồng nhất với database

### 4. Category Model (`category.model.ts`)
- ✅ Thêm các trường: `parent_id`, `slug` (unique, required), `display_order`, `deleted_at`

### 5. ProductVariant Model (`product-variant.model.ts`)
- ✅ Thêm các trường: `sku` (unique, required), `image_url`, `is_active`, `updated_at`, `deleted_at`

### 6. CartItem Model (`cart-item.model.ts`)
- ✅ **user_id**: Đổi từ `number` → `string` (UUID)

### 7. OrderItem Model (`order-item.model.ts`)
- ✅ **price**: Lưu ý là `integer` (VND) trong database, không phải DECIMAL

### 8. Review Model (`review.model.ts`)
- ĐÃ LOẠI BỎ HOÀN TOÀN KHỎI HỆ THỐNG THEO PHẠM VI ĐỒ ÁN (không còn bảng, model, controller, route liên quan)

### 9. UserAddress Model (`user-address.model.ts`)
- ✅ **user_id**: Đổi từ `number` → `string` (UUID)
- ✅ Thêm trường: `deleted_at`
- ✅ **created_at/updated_at**: Đổi từ `string` → `Date`

### 10. VerificationCode Model (`verification-code.model.ts`)
- ✅ **user_id**: Đã là `string | null` (UUID) - không cần thay đổi
- ✅ Cập nhật comments để rõ ràng hơn

### 11. StockHistory Model (`stock-history.model.ts`)
- ✅ **created_by**: Đổi từ `number | null` → `string | null` (UUID)
- ✅ **created_at**: Đổi từ `string` → `Date`

### 12. Refund Model (`refund.model.ts`)
- ĐÃ LOẠI BỎ HOÀN TOÀN KHỎI HỆ THỐNG THEO PHẠM VI ĐỒ ÁN (không còn bảng, model, controller, route liên quan)

### 13. OrderStatusHistory Model (`order-status-history.model.ts`)
- ✅ **updated_by**: Đổi từ `number | null` → `string | null` (UUID)

### 14. Shipping Model (`shipping.model.ts`)
- ✅ **estimated_delivery_date**: Đổi từ `string | null` → `Date | null`
- ✅ **created_at/updated_at**: Đổi từ `string` → `Date`

### 15. Wishlist Model (`wishlist.model.ts`)
- ✅ **user_id**: Đổi từ `number` → `string` (UUID)
- ✅ **created_at**: Đổi từ `string` → `Date`

### 16. DailyStatistics Model (`daily-statistics.model.ts`)
- ✅ Cập nhật comments để rõ ràng hơn về các default values

## Constants Updates

### Order Constants (`order.constants.ts`)
- ✅ Sửa `SHIPPED: 'shipped'` → `SHIPPING: 'shipping'` để đồng nhất với database

### User Constants (`user.constants.ts`)
- ✅ **USER_STATUS**: Đổi từ boolean (`true`/`false`) → string enum (`'active'`, `'banned'`, `'deleted'`)
- ✅ Thêm type export: `UserStatus`

## Lưu ý khi cập nhật Controllers

### 1. User ID Handling
- Tất cả `user_id` trong database là UUID (string), không phải number
- Khi query, PostgreSQL tự động xử lý UUID, không cần convert
- Khi sử dụng `req.user!.id`, nó đã là string (UUID) từ JWT

### 2. Order Creation
- Cần thêm các trường mới: `subtotal`, `discount_amount`, `tax_amount`, `customer_name`, `customer_phone`, `customer_email`
- Tính toán: `total_amount = subtotal + shipping_fee - discount_amount + tax_amount`

### 3. Product Creation
- **Bắt buộc** thêm trường `sku` (unique)
- Có thể thêm `brand`, `view_count`, `sold_count`

### 4. Category Creation
- **Bắt buộc** thêm trường `slug` (unique, SEO-friendly)
- Có thể thêm `parent_id` cho danh mục con, `display_order` để sắp xếp

### 5. ProductVariant Creation
- **Bắt buộc** thêm trường `sku` (unique cho từng variant)
- Có thể thêm `image_url`, `is_active`

### 6. Soft Delete
- Tất cả các bảng có `deleted_at` nên sử dụng soft delete
- Query nên thêm điều kiện `WHERE deleted_at IS NULL`

### 7. Type Safety
- Tất cả models đã được cập nhật với đúng types
- Sử dụng TypeScript để đảm bảo type safety khi làm việc với database

## Files đã được cập nhật

1. `Backend/src/connections/db/models/user.model.ts`
2. `Backend/src/connections/db/models/product.model.ts`
3. `Backend/src/connections/db/models/order.model.ts`
4. `Backend/src/connections/db/models/category.model.ts`
5. `Backend/src/connections/db/models/product-variant.model.ts`
6. `Backend/src/connections/db/models/cart-item.model.ts`
7. `Backend/src/connections/db/models/order-item.model.ts`
8. (đã loại bỏ) `Backend/src/connections/db/models/review.model.ts`
9. `Backend/src/connections/db/models/user-address.model.ts`
10. `Backend/src/connections/db/models/verification-code.model.ts`
11. `Backend/src/connections/db/models/stock-history.model.ts`
12. (đã loại bỏ) `Backend/src/connections/db/models/refund.model.ts`
13. `Backend/src/connections/db/models/order-status-history.model.ts`
14. `Backend/src/connections/db/models/shipping.model.ts`
15. `Backend/src/connections/db/models/wishlist.model.ts`
16. `Backend/src/connections/db/models/daily-statistics.model.ts`
17. `Backend/src/constants/order.constants.ts`
18. `Backend/src/constants/user.constants.ts`

## Bước tiếp theo

1. ✅ Models đã được refactor hoàn tất
2. ✅ Constants đã được cập nhật
3. ⚠️ **Cần kiểm tra và cập nhật controllers** để sử dụng các models mới:
   - Đảm bảo tất cả queries sử dụng đúng types
   - Thêm các trường mới vào create/update operations
   - Xử lý soft delete đúng cách
   - Cập nhật order creation để tính toán subtotal, discount, tax

## Testing Checklist

- [ ] Test user registration/login với UUID
- [ ] Test product creation với SKU
- [ ] Test category creation với slug
- [ ] Test order creation với các trường mới
- [ ] Test soft delete cho products, categories, variants
- [ ] Verify tất cả user_id references sử dụng UUID

