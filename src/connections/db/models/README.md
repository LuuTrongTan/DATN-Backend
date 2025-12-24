# Database Models

Các TypeScript models được tạo dựa trên database migrations. Mỗi model tương ứng với một bảng trong database.

## Cấu trúc Models

Mỗi model file chứa:
- **Interface chính**: Đại diện cho một row trong database
- **CreateInput interface**: Dữ liệu cần thiết để tạo mới
- **UpdateInput interface**: Dữ liệu có thể cập nhật (tất cả fields optional)

## Danh sách Models

### 1. User Model (`user.model.ts`)
- **Bảng**: `users`
- **Migration**: `001_create_users_table`
- **Fields**: id, email, phone, password_hash, full_name, is_verified, is_active, is_banned, role, created_at, updated_at
- **Types**: `UserRole = 'customer' | 'staff' | 'admin'`

### 2. VerificationCode Model (`verification-code.model.ts`)
- **Bảng**: `verification_codes`
- **Migration**: `002_create_verification_codes_table`
- **Fields**: id, user_id, code, type, expires_at, is_used, created_at
- **Types**: `VerificationCodeType = 'email_verification' | 'password_reset' | 'otp'`

### 3. Category Model (`category.model.ts`)
- **Bảng**: `categories`
- **Migration**: `003_create_categories_table`
- **Fields**: id, name, image_url, description, is_active, created_at, updated_at

### 4. Product Model (`product.model.ts`)
- **Bảng**: `products`
- **Migration**: `004_create_products_table`
- **Fields**: id, category_id, name, description, price, stock_quantity, image_urls, video_url, is_active, created_at, updated_at

### 5. ProductVariant Model (`product-variant.model.ts`)
- **Bảng**: `product_variants`
- **Migration**: `005_create_product_variants_table`
- **Fields**: id, product_id, variant_type, variant_value, price_adjustment, stock_quantity, created_at

### 6. CartItem Model (`cart-item.model.ts`)
- **Bảng**: `cart_items`
- **Migration**: `006_create_cart_items_table`
- **Fields**: id, user_id, product_id, variant_id, quantity, created_at, updated_at

### 7. Order Model (`order.model.ts`)
- **Bảng**: `orders`
- **Migration**: `007_create_orders_table`
- **Fields**: id, user_id, order_number, total_amount, shipping_address, payment_method, payment_status, order_status, shipping_fee, notes, created_at, updated_at
- **Types**: 
  - `PaymentMethod = 'online' | 'cod'`
  - `PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'`
  - `OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipping' | 'delivered' | 'cancelled'`

### 8. OrderItem Model (`order-item.model.ts`)
- **Bảng**: `order_items`
- **Migration**: `008_create_order_items_table`
- **Fields**: id, order_id, product_id, variant_id, quantity, price, created_at

### 9. Review Model (`review.model.ts`)
- **Bảng**: `reviews`
- **Migration**: `010_create_reviews_table`
- **Fields**: id, user_id, product_id, order_id, rating, comment, image_urls, video_url, is_approved, created_at, updated_at

## Cách sử dụng

```typescript
import { User, CreateUserInput, UpdateUserInput } from './models';
import { Product, CreateProductInput } from './models';
import { Order, OrderStatus, PaymentMethod } from './models';

// Sử dụng types
const user: User = {
  id: 1,
  email: 'user@example.com',
  // ... other fields
};

const newUser: CreateUserInput = {
  email: 'new@example.com',
  password_hash: 'hashed_password',
  role: 'customer',
};

const orderStatus: OrderStatus = 'pending';
const paymentMethod: PaymentMethod = 'online';
```

## Lưu ý

- Tất cả models đều khớp 100% với schema trong migrations
- DECIMAL fields được map thành `number` trong TypeScript
- TIMESTAMP fields được map thành `Date`
- TEXT[] arrays được map thành `string[] | null`
- Foreign keys được map thành `number | null` nếu nullable

