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

- `001_create_users_table.sql` - Bảng users
- `002_create_verification_codes_table.sql` - Bảng mã xác thực
- `003_create_categories_table.sql` - Bảng danh mục
- `004_create_products_table.sql` - Bảng sản phẩm
- `005_create_product_variants_table.sql` - Bảng biến thể sản phẩm
- `006_create_cart_items_table.sql` - Bảng giỏ hàng
- `007_create_orders_table.sql` - Bảng đơn hàng
- `008_create_order_items_table.sql` - Bảng chi tiết đơn hàng
- `009_create_order_status_history_table.sql` - Bảng lịch sử trạng thái đơn hàng
- `010_create_reviews_table.sql` - Bảng đánh giá
- `011_create_daily_statistics_table.sql` - Bảng thống kê

## Cấu hình

Cấu hình database trong file `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=datn_db
DB_USER=postgres
DB_PASSWORD=your_password
```

