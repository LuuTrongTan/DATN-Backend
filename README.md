# Backend - Hệ Thống Cửa Hàng Trực Tuyến

## Cài đặt

```bash
npm install
```

## Cấu hình

1. Copy file `env.example` thành `.env`:
```bash
cp env.example .env
```

2. Điền thông tin vào file `.env`

## Database Setup

### 1. Tạo database

```bash
# PostgreSQL
createdb datn_db
```

### 2. Chạy migrations

```bash
# Chạy migrations
npm run migrate:up

# Rollback migrations
npm run migrate:down
```

## Chạy ứng dụng

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

## Docker

Tất cả file Docker nằm trong thư mục `docker/`

### Chạy với Docker Compose (Production)

```bash
cd docker

# Build và chạy tất cả services (Backend + PostgreSQL + Redis)
docker-compose up -d

# Xem logs
docker-compose logs -f app

# Dừng services
docker-compose down

# Dừng và xóa volumes
docker-compose down -v
```

### Chạy chỉ Database và Redis (Development)

```bash
cd docker

# Chạy chỉ PostgreSQL và Redis (không chạy app)
docker-compose up -d db redis

# Xem logs
docker-compose logs -f db redis

# Dừng
docker-compose down
```

### Build Docker image

```bash
cd docker

# Build image
docker build -f Dockerfile -t datn-backend ..

# Chạy container
docker run -p 3000:3000 --env-file ../.env datn-backend
```

## Cấu trúc dự án

```
Backend/src/
├── config/              # Cấu hình ứng dụng
├── connections/         # Kết nối database, redis
│   ├── config/          # Config cho connections
│   ├── db/              # Database
│   │   ├── migrations/  # TypeScript migrations
│   │   ├── models/      # Database models
│   │   └── ...
│   └── redis/           # Redis connection
├── middlewares/         # Middleware functions
├── modules/             # Business logic modules
│   ├── admin/
│   ├── auth/
│   ├── cart/
│   ├── orders/
│   ├── products/
│   └── reviews/
├── routes/              # Route definitions
├── utils/               # Utility functions
├── app.ts               # Express app setup
└── index.ts             # Entry point
```

## API Documentation

Xem các endpoints trong từng module:
- `/api/auth` - Authentication
- `/api/products` - Products
- `/api/cart` - Cart
- `/api/orders` - Orders
- `/api/reviews` - Reviews
- `/api/admin` - Admin functions

## Health Check

```bash
curl http://localhost:3000/health
```
# DATN-Backend
