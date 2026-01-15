# Database Module

Cấu trúc database với PostgreSQL và hệ thống migration.

## Cấu trúc

```
db/
├── config/
│   └── config.ts          # Cấu hình database
├── migrations/             # Các file migration SQL
│   ├── 001_create_users_table.sql
│   ├── 002_create_verification_codes_table.sql
│   └── ...
├── models/                 # Database models (tùy chọn)
│   └── index.ts
├── connection.ts           # PostgreSQL connection pool
├── migrate.ts              # Script chạy migrations
└── index.ts                # Exports
```

## Sử dụng

### Kết nối database

```typescript
import { pool } from './connections/db';

// Sử dụng pool để query
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
```

### Chạy migrations

```bash
# Chạy tất cả migrations chưa được thực thi
npm run migrate:up

# Rollback migrations
npm run migrate:down
```

Migrations sẽ được chạy tự động theo thứ tự số (001, 002, 003...). Mỗi migration chỉ chạy một lần và được lưu vào bảng `migrations`.

### Tạo migration mới

1. Tạo file SQL trong thư mục `migrations/` với format: `XXX_description.sql`
2. Số thứ tự phải lớn hơn migration cuối cùng
3. Chạy `npm run migrate:up` để thực thi

### Migration Files

- `20251120_000001_create_users_table` - Bảng users
- `20251120_000002_create_verification_codes_table` - Bảng mã xác thực
- `20251120_000003_create_categories_table` - Bảng danh mục
- `20251120_000004_create_products_table` - Bảng sản phẩm
- `20251120_000005_create_product_variants_table` - Bảng biến thể sản phẩm
- `20251120_000006_create_cart_items_table` - Bảng giỏ hàng
- `20251120_000007_create_orders_table` - Bảng đơn hàng
- `20251120_000008_create_order_items_table` - Bảng chi tiết đơn hàng
- `20251120_000010_create_user_addresses_table` - Bảng địa chỉ người dùng
- `20251120_000011_create_wishlist_table` - Bảng wishlist
- `20251120_000012_create_shipping_table` - Bảng vận chuyển
- `20251120_000015_enable_vector_search` - Bật vector search
- `20251120_000016_create_payment_transactions_table` - Giao dịch thanh toán
- `20251120_000017_create_notifications_table` - Thông báo
- `20251120_000018_create_product_tags_table` - Tags sản phẩm
- `20251120_000019_create_audit_logs_table` - Audit logs
- `20251120_000020_create_product_media_table` - Media sản phẩm/biến thể

## Cấu hình

Cấu hình database trong file `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=datn_db
DB_USER=postgres
DB_PASSWORD=your_password
```

