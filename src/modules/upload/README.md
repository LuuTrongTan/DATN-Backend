# Upload Module

Module xử lý upload file qua server (local storage).

## Luồng hoạt động

File được upload và lưu trữ trực tiếp trên server:
- File được lưu vào thư mục `uploads/` trên server
- Tự động tạo subdirectories: `uploads/images/` và `uploads/videos/`
- Trả về public URL từ server: `http://localhost:3004/uploads/images/filename.jpg`

### Response Format

```json
{
  "success": true,
  "data": {
    "url": "http://localhost:3004/uploads/images/filename.jpg",
    "localUrl": "http://localhost:3004/uploads/images/filename.jpg",
    "fileName": "image.jpg",
    "mimeType": "image/jpeg"
  }
}
```

## Cấu hình

### Environment Variables

Thêm vào `.env`:

```env
# Thư mục lưu file local (mặc định: ./uploads)
UPLOAD_DIR=./uploads

# Base URL để tạo public URL cho file local (mặc định: http://localhost:3004)
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
    "url": "http://localhost:3004/uploads/images/filename.jpg",
    "localUrl": "http://localhost:3004/uploads/images/filename.jpg",
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

1. **Đơn giản**: Không cần cấu hình dịch vụ bên ngoài
2. **Kiểm soát**: Toàn quyền kiểm soát file trên server
3. **Chi phí**: Không tốn chi phí dịch vụ CDN
4. **Development**: Dễ dàng phát triển và test local

## Xóa file

Có thể xóa file từ local storage:

```typescript
import { deleteFileFromLocal } from './localStorage.service';

await deleteFileFromLocal('http://localhost:3004/uploads/images/filename.jpg');
```

