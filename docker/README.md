# Docker Setup

Các file Docker cho Backend application.

## Cấu trúc

- `Dockerfile` - Docker image cho Backend
- `docker-compose.yml` - Full stack (Backend + PostgreSQL + Redis)
- `docker-compose.dev.yml` - Chỉ Database và Redis (cho development)

## Sử dụng

### Production (Full Stack)

```bash
# Từ thư mục docker/
docker-compose up -d

# Xem logs
docker-compose logs -f backend

# Dừng
docker-compose down
```

### Development (Chỉ DB)

```bash
# Từ thư mục docker/
docker-compose -f docker-compose.dev.yml up -d

# Dừng
docker-compose -f docker-compose.dev.yml down
```

### Build Image

```bash
# Từ thư mục docker/
docker build -f Dockerfile -t ecommerce-backend ..
```

## Lưu ý

- Build context là thư mục `Backend/` (parent directory)
- File `.env` cần được tạo ở thư mục `Backend/`
- Migrations sẽ tự động chạy khi container start

