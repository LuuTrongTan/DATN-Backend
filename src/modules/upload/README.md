# Upload Module

Module xử lý upload file với hỗ trợ Cloudflare CDN và Local Storage.

## Luồng hoạt động

### Storage Strategy - Tách riêng 2 luồng

Hệ thống hỗ trợ 3 chế độ storage:

1. **`cloudflare`** - Chỉ upload lên Cloudflare CDN
   - File được upload lên Cloudflare Images API
   - Trả về public URL từ Cloudflare CDN
   - Nếu Cloudflare fail → throw error

2. **`local`** - Chỉ lưu vào Local Storage
   - File được lưu vào thư mục `uploads/` trên server
   - Tự động tạo subdirectories: `uploads/images/` và `uploads/videos/`
   - Trả về public URL từ server: `http://localhost:3004/uploads/images/filename.jpg`
   - Nếu Local fail → throw error

3. **`both`** - Lưu vào cả 2 (mặc định)
   - Upload lên Cloudflare (primary)
   - Lưu vào Local Storage (backup)
   - Ưu tiên trả về Cloudflare URL
   - Nếu Cloudflare fail, vẫn có Local URL
   - Nếu cả 2 đều fail → throw error

### Response Format

```json
{
  "success": true,
  "data": {
    "url": "https://imagedelivery.net/...", // Primary URL (Cloudflare nếu có, nếu không thì Local)
    "cloudflareUrl": "https://imagedelivery.net/...", // null nếu không dùng Cloudflare
    "localUrl": "http://localhost:3004/uploads/images/...", // null nếu không dùng Local
    "fileName": "image.jpg",
    "mimeType": "image/jpeg"
  }
}
```

## Cấu hình

### Environment Variables

Thêm vào `.env`:

```env
# Storage Type: 'cloudflare', 'local', hoặc 'both' (mặc định: 'both')
STORAGE_TYPE=both

# Cloudflare (chỉ cần nếu STORAGE_TYPE là 'cloudflare' hoặc 'both')
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token

# Local Storage (chỉ cần nếu STORAGE_TYPE là 'local' hoặc 'both')
UPLOAD_DIR=./uploads
BASE_URL=http://localhost:3004
```

### Ví dụ cấu hình

**Chỉ dùng Cloudflare:**
```env
STORAGE_TYPE=cloudflare
CLOUDFLARE_ACCOUNT_ID=abc123
CLOUDFLARE_API_TOKEN=xyz789
```

**Chỉ dùng Local Storage:**
```env
STORAGE_TYPE=local
UPLOAD_DIR=./uploads
BASE_URL=http://localhost:3004
```

**Dùng cả 2 (Cloudflare primary, Local backup):**
```env
STORAGE_TYPE=both
CLOUDFLARE_ACCOUNT_ID=abc123
CLOUDFLARE_API_TOKEN=xyz789
UPLOAD_DIR=./uploads
BASE_URL=http://localhost:3004
```

### Thư mục

File sẽ được lưu vào:
- `UPLOAD_DIR/images/` - Cho hình ảnh
- `UPLOAD_DIR/videos/` - Cho video

Thư mục sẽ tự động được tạo nếu chưa tồn tại.

## API Endpoints

### Upload Single File

```
POST /api/upload/single
Content-Type: multipart/form-data
Authorization: Bearer {token}

Body:
  file: File

Response:
{
  "success": true,
  "data": {
    "url": "https://imagedelivery.net/...",
    "cloudflareUrl": "https://imagedelivery.net/...",
    "localUrl": "http://localhost:3004/uploads/images/...",
    "fileName": "image.jpg",
    "mimeType": "image/jpeg"
  }
}
```

### Upload Multiple Files

```
POST /api/upload/multiple
Content-Type: multipart/form-data
Authorization: Bearer {token}

Body:
  files: File[] (max 10 files)

Response:
{
  "success": true,
  "data": {
    "urls": ["url1", "url2", ...],
    "cloudflareUrls": ["url1", "url2", ...],
    "localUrls": ["url1", "url2", ...],
    "count": 2
  }
}
```

## Serve Static Files

File local được serve qua endpoint:

```
GET /uploads/images/{filename}
GET /uploads/videos/{filename}
```

## Lợi ích

1. **Backup**: File luôn được lưu local, không mất dữ liệu nếu Cloudflare có vấn đề
2. **Flexibility**: Có thể tắt Cloudflare bất cứ lúc nào, chỉ dùng local storage
3. **Migration**: Dễ dàng migrate sang storage khác trong tương lai
4. **Development**: Không cần Cloudflare config khi develop local

## Chuyển đổi giữa các Storage Type

### Từ Cloudflare sang Local:
```env
STORAGE_TYPE=local
# Xóa hoặc comment CLOUDFLARE_ACCOUNT_ID và CLOUDFLARE_API_TOKEN
```

### Từ Local sang Cloudflare:
```env
STORAGE_TYPE=cloudflare
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
```

### Dùng cả 2:
```env
STORAGE_TYPE=both
# Cấu hình cả Cloudflare và Local
```

**Lưu ý:** Sau khi thay đổi `STORAGE_TYPE`, cần restart Backend server.

## Xóa file

Có thể xóa file từ local storage:

```typescript
import { deleteFileFromLocal } from './localStorage.service';

await deleteFileFromLocal('http://localhost:3004/uploads/images/filename.jpg');
```

