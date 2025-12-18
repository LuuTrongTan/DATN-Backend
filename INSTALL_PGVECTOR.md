# 📦 Hướng Dẫn Cài Đặt pgvector Extension

## 🎯 Tổng Quan

`pgvector` là PostgreSQL extension cho phép lưu trữ và tìm kiếm vector embeddings (cho semantic search). Migration sẽ tự động bỏ qua phần vector nếu extension chưa được cài đặt, nhưng full-text search vẫn hoạt động bình thường.

---

## 🔧 Cài Đặt pgvector

### **Option 1: Windows (PostgreSQL từ Installer)** ⭐ **Khuyến nghị cho Windows**

#### **Cách 1: Sử dụng Pre-built Binary (Dễ nhất)**

1. **Tải file DLL từ GitHub Releases:**
   - Truy cập: https://github.com/pgvector/pgvector/releases
   - Tải file phù hợp với PostgreSQL version của bạn:
     - PostgreSQL 17: `vector-v0.5.1-pg17-windows-x64.zip`
     - PostgreSQL 16: `vector-v0.5.1-pg16-windows-x64.zip`
     - PostgreSQL 15: `vector-v0.5.1-pg15-windows-x64.zip`

2. **Giải nén và copy files:**
   ```powershell
   # Giải nén file zip
   # Copy các file vào thư mục PostgreSQL:
   
   # vector.dll → C:\Program Files\PostgreSQL\17\lib\
   # vector.control → C:\Program Files\PostgreSQL\17\share\extension\
   # vector--*.sql → C:\Program Files\PostgreSQL\17\share\extension\
   ```

3. **Kích hoạt extension:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

#### **Cách 2: Build từ Source (Nếu không có pre-built)**

**Yêu cầu:**
- Visual Studio 2019+ hoặc Build Tools
- Git
- PostgreSQL development headers

**Các bước:**
```powershell
# 1. Clone repository
git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git
cd pgvector

# 2. Build với Visual Studio
# Mở "x64 Native Tools Command Prompt for VS"
nmake /F Makefile.windows

# 3. Install (cần quyền admin)
nmake /F Makefile.windows install PG_CONFIG="C:\Program Files\PostgreSQL\17\bin\pg_config.exe"
```

### **Option 2: Cài đặt qua Package Manager (Ubuntu/Debian/Linux)**

```bash
# Xác định phiên bản PostgreSQL
psql --version

# Cài đặt pgvector (thay XX bằng phiên bản PostgreSQL, ví dụ: 14, 15, 16)
sudo apt-get update
sudo apt-get install postgresql-XX-pgvector

# Hoặc với PostgreSQL 16
sudo apt-get install postgresql-16-pgvector
```

### **Option 3: Cài đặt từ Source (Linux/Mac)**

```bash
# Clone repository
git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git
cd pgvector

# Build và cài đặt
make
sudo make install

# Hoặc với PostgreSQL cụ thể
make PG_CONFIG=/usr/lib/postgresql/16/bin/pg_config
sudo make install PG_CONFIG=/usr/lib/postgresql/16/bin/pg_config
```

### **Option 4: Docker (Nếu dùng Docker)**

```dockerfile
# Trong Dockerfile hoặc docker-compose.yml
FROM pgvector/pgvector:pg16

# Hoặc build từ image PostgreSQL chính thức
FROM postgres:16
RUN apt-get update && apt-get install -y postgresql-16-pgvector
```

---

## ✅ Kích Hoạt Extension

Sau khi cài đặt, kích hoạt extension trong database:

```sql
-- Kết nối với database (cần quyền superuser)
psql -U postgres -d your_database_name

-- Hoặc nếu dùng user khác
psql -U your_user -d your_database_name

-- Kích hoạt extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Kiểm tra extension đã được cài đặt
\dx vector
```

---

## 🔍 Kiểm Tra Extension

```sql
-- Kiểm tra extension có tồn tại không
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Kiểm tra version
SELECT extversion FROM pg_extension WHERE extname = 'vector';
```

---

## 🚀 Sau Khi Cài Đặt

1. **Chạy lại migration** (nếu đã chạy trước đó):
   ```bash
   npm run migrate:up
   ```

2. **Hoặc thêm column và index thủ công**:
   ```sql
   -- Thêm column embedding
   ALTER TABLE products 
   ADD COLUMN IF NOT EXISTS embedding vector(1536);

   -- Tạo index
   CREATE INDEX IF NOT EXISTS idx_products_embedding 
   ON products USING hnsw (embedding vector_cosine_ops)
   WITH (m = 16, ef_construction = 64);
   ```

---

## ⚠️ Lưu Ý

1. **Quyền Superuser**: `CREATE EXTENSION` cần quyền superuser hoặc database owner
2. **Transaction**: `CREATE EXTENSION` không thể chạy trong transaction
3. **Version Compatibility**: Đảm bảo pgvector version tương thích với PostgreSQL version

---

## 📚 Tài Liệu Tham Khảo

- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [pgvector Documentation](https://github.com/pgvector/pgvector#installation)

---

## 🎯 Kết Luận

Nếu không cài pgvector, hệ thống vẫn hoạt động bình thường với **full-text search**. Vector search là tính năng **optional** để cải thiện chất lượng tìm kiếm semantic.

