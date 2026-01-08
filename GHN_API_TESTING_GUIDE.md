# Hướng Dẫn Test GHN API

## 1. Cấu Hình Môi Trường

### Bước 1: Lấy GHN Credentials

1. Đăng ký tài khoản tại: https://api.ghn.vn/
2. Đăng nhập vào GHN Dashboard
3. Tạo cửa hàng (Store) nếu chưa có
4. Lấy các thông tin sau:
   - **Token**: Token API từ GHN Dashboard
   - **Shop ID**: ID cửa hàng của bạn
   - **API URL**: 
     - Development: `https://dev-online-gateway.ghn.vn/shiip/public-api/v2`
     - Production: `https://online-gateway.ghn.vn/shiip/public-api/v2`

### Bước 2: Cấu Hình .env

Thêm vào file `.env`:

```env
# GHN API Configuration
GHN_API_TOKEN=your_ghn_token_here
GHN_SHOP_ID=your_shop_id_here
GHN_API_URL=https://dev-online-gateway.ghn.vn/shiip/public-api/v2

# Shop Location (for shipping calculation)
SHOP_PROVINCE=Thành phố Hồ Chí Minh
SHOP_DISTRICT=Quận 1
SHOP_WARD=Phường Bến Nghé
```

### Bước 3: Khởi Động Server

```bash
cd Backend
npm install
npm run dev
```

## 2. Test Provinces API

### 2.1. Lấy Danh Sách Tỉnh/Thành Phố

**Endpoint:** `GET /api/provinces`

**Request:**
```bash
curl -X GET http://localhost:3004/api/provinces
```

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách tỉnh/thành phố thành công",
  "data": [
    {
      "code": 202,
      "name": "Thành phố Hà Nội",
      "codename": "ha_noi",
      "division_type": "",
      "phone_code": 0
    },
    {
      "code": 201,
      "name": "Tỉnh Hà Giang",
      "codename": "ha_giang",
      "division_type": "",
      "phone_code": 0
    }
  ]
}
```

**Test với search:**
```bash
curl -X GET "http://localhost:3004/api/provinces?search=Hà Nội"
```

### 2.2. Lấy Thông Tin Tỉnh/Thành Phố Theo Code

**Endpoint:** `GET /api/provinces/:code`

**Request:**
```bash
curl -X GET http://localhost:3004/api/provinces/202
```

**Response:**
```json
{
  "success": true,
  "message": "Lấy thông tin tỉnh/thành phố thành công",
  "data": {
    "code": 202,
    "name": "Thành phố Hà Nội",
    "codename": "ha_noi",
    "division_type": "",
    "phone_code": 0
  }
}
```

### 2.3. Lấy Danh Sách Quận/Huyện Theo Tỉnh

**Endpoint:** `GET /api/provinces/:provinceCode/districts`

**Request:**
```bash
curl -X GET http://localhost:3004/api/provinces/202/districts
```

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách quận/huyện thành công",
  "data": [
    {
      "code": 1442,
      "name": "Quận Ba Đình",
      "codename": "quan_ba_dinh",
      "division_type": "",
      "province_code": 202
    },
    {
      "code": 1443,
      "name": "Quận Hoàn Kiếm",
      "codename": "quan_hoan_kiem",
      "division_type": "",
      "province_code": 202
    }
  ]
}
```

### 2.4. Lấy Danh Sách Phường/Xã Theo Quận/Huyện

**Endpoint:** `GET /api/provinces/districts/:districtCode/wards`

**Request:**
```bash
curl -X GET http://localhost:3004/api/provinces/districts/1442/wards
```

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách phường/xã thành công",
  "data": [
    {
      "code": 1000001,
      "name": "Phường Cống Vị",
      "codename": "phuong_cong_vi",
      "division_type": "",
      "district_code": 1442
    },
    {
      "code": 1000002,
      "name": "Phường Điện Biên",
      "codename": "phuong_dien_bien",
      "division_type": "",
      "district_code": 1442
    }
  ]
}
```

### 2.5. Tìm Kiếm Địa Chỉ

**Endpoint:** `GET /api/provinces/search?q=keyword`

**Request:**
```bash
curl -X GET "http://localhost:3004/api/provinces/search?q=Ba Đình"
```

**Response:**
```json
{
  "success": true,
  "message": "Tìm kiếm thành công",
  "data": [
    {
      "code": 1442,
      "name": "Quận Ba Đình",
      "codename": "quan_ba_dinh",
      "division_type": "",
      "province_code": 202,
      "type": "district"
    }
  ]
}
```

## 3. Test Shipping API

### 3.1. Tính Phí Vận Chuyển

**Endpoint:** `POST /api/shipping/calculate`

**Request:**
```bash
curl -X POST http://localhost:3004/api/shipping/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "province": "Thành phố Hồ Chí Minh",
    "district": "Quận 1",
    "ward": "Phường Bến Nghé",
    "weight": 1,
    "value": 100000
  }'
```

**Hoặc dùng ID:**
```bash
curl -X POST http://localhost:3004/api/shipping/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "province": 202,
    "district": 1442,
    "ward": "1000001",
    "weight": 1,
    "value": 100000
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Tính phí vận chuyển thành công",
  "data": {
    "fee": 30000,
    "estimated_days": 3,
    "provider": "GHN",
    "service_type": "standard"
  }
}
```

### 3.2. Tạo Đơn Vận Chuyển (Admin/Staff)

**Endpoint:** `POST /api/shipping/order`

**Request:**
```bash
curl -X POST http://localhost:3004/api/shipping/order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -d '{
    "order_id": 1,
    "to_name": "Nguyễn Văn A",
    "to_phone": "0123456789",
    "to_address": "123 Đường ABC",
    "to_province": "Thành phố Hồ Chí Minh",
    "to_district": "Quận 1",
    "to_ward": "Phường Bến Nghé",
    "weight": 1,
    "value": 100000,
    "cod": 0,
    "note": "Giao hàng trong giờ hành chính"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Tạo đơn vận chuyển thành công",
  "data": {
    "shipping_id": 1,
    "tracking_number": "GHN123456789",
    "fee": 30000
  }
}
```

### 3.3. Lấy Thông Tin Vận Chuyển

**Endpoint:** `GET /api/shipping/order/:order_id`

**Request:**
```bash
curl -X GET http://localhost:3004/api/shipping/order/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Lấy thông tin vận chuyển thành công",
  "data": {
    "id": 1,
    "order_id": 1,
    "shipping_fee": 30000,
    "shipping_provider": "GHN",
    "tracking_number": "GHN123456789",
    "status": "pending",
    "notes": null,
    "created_at": "2024-01-08T10:00:00.000Z",
    "updated_at": "2024-01-08T10:00:00.000Z"
  }
}
```

### 3.4. Tra Cứu Vận Đơn

**Endpoint:** `GET /api/shipping/track/:tracking_number`

**Request:**
```bash
curl -X GET http://localhost:3004/api/shipping/track/GHN123456789 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Lấy thông tin vận đơn thành công",
  "data": {
    "status": "delivered",
    "tracking_number": "GHN123456789",
    "current_location": "123 Đường ABC",
    "estimated_delivery_date": "2024-01-10",
    "history": [
      {
        "status": "pending",
        "time": "2024-01-08T10:00:00.000Z",
        "location": "Kho hàng"
      },
      {
        "status": "in_transit",
        "time": "2024-01-09T08:00:00.000Z",
        "location": "Đang vận chuyển"
      },
      {
        "status": "delivered",
        "time": "2024-01-10T14:00:00.000Z",
        "location": "123 Đường ABC"
      }
    ]
  }
}
```

## 4. Test Với Postman

### 4.1. Import Collection

1. Tạo collection mới trong Postman
2. Thêm các request sau:

#### Provinces Collection

- **Get All Provinces**
  - Method: `GET`
  - URL: `{{baseUrl}}/api/provinces`
  
- **Get Province By Code**
  - Method: `GET`
  - URL: `{{baseUrl}}/api/provinces/202`
  
- **Get Districts**
  - Method: `GET`
  - URL: `{{baseUrl}}/api/provinces/202/districts`
  
- **Get Wards**
  - Method: `GET`
  - URL: `{{baseUrl}}/api/provinces/districts/1442/wards`
  
- **Search**
  - Method: `GET`
  - URL: `{{baseUrl}}/api/provinces/search?q=Ba Đình`

#### Shipping Collection

- **Calculate Fee**
  - Method: `POST`
  - URL: `{{baseUrl}}/api/shipping/calculate`
  - Headers: `Authorization: Bearer {{token}}`
  - Body (JSON):
    ```json
    {
      "province": "Thành phố Hồ Chí Minh",
      "district": "Quận 1",
      "ward": "Phường Bến Nghé",
      "weight": 1,
      "value": 100000
    }
    ```

- **Create Order**
  - Method: `POST`
  - URL: `{{baseUrl}}/api/shipping/order`
  - Headers: `Authorization: Bearer {{adminToken}}`
  - Body (JSON): Xem ví dụ ở trên

- **Get Shipping Info**
  - Method: `GET`
  - URL: `{{baseUrl}}/api/shipping/order/1`
  - Headers: `Authorization: Bearer {{token}}`

- **Track Order**
  - Method: `GET`
  - URL: `{{baseUrl}}/api/shipping/track/GHN123456789`
  - Headers: `Authorization: Bearer {{token}}`

### 4.2. Environment Variables

Tạo environment trong Postman với các biến:

- `baseUrl`: `http://localhost:3004`
- `token`: JWT token của user thường
- `adminToken`: JWT token của admin/staff

## 5. Test Với Frontend

### 5.1. Test Provinces Service

```typescript
// Frontend/src/shares/services/provincesService.ts
import { provincesService } from './provincesService';

// Test get provinces
const testProvinces = async () => {
  const response = await provincesService.getProvinces();
  console.log('Provinces:', response.data);
};

// Test get districts
const testDistricts = async () => {
  const response = await provincesService.getDistricts(202); // Hà Nội
  console.log('Districts:', response.data);
};

// Test get wards
const testWards = async () => {
  const response = await provincesService.getWards(1442); // Quận Ba Đình
  console.log('Wards:', response.data);
};
```

### 5.2. Test Shipping Service

```typescript
// Frontend/src/shares/services/shippingService.ts
import { shippingService } from './shippingService';

// Test calculate fee
const testCalculateFee = async () => {
  const response = await shippingService.calculateFee({
    province: "Thành phố Hồ Chí Minh",
    district: "Quận 1",
    weight: 1,
    value: 100000
  });
  console.log('Shipping fee:', response.data);
};
```

## 6. Kiểm Tra Logs

### 6.1. Backend Logs

Kiểm tra console logs để xem các thông tin:

```bash
# Logs khi gọi GHN API
[GHN API] 🌐 Fetching from GHN API { cacheKey: 'ghn_provinces' }
[GHN API] ✅ Fetched and cached data { cacheKey: 'ghn_provinces', dataSize: 12345 }

# Logs khi tính phí vận chuyển
[GHN API] ✅ Shipping fee calculated { fee: 30000, provider: 'GHN' }
```

### 6.2. Error Logs

Nếu có lỗi, kiểm tra:

```bash
[GHN API] ❌ Error fetching data { error: 'GHN API token not configured' }
```

## 7. Troubleshooting

### Lỗi: "GHN API token not configured"

**Nguyên nhân:** Chưa cấu hình `GHN_API_TOKEN` trong `.env`

**Giải pháp:**
1. Kiểm tra file `.env` có `GHN_API_TOKEN` chưa
2. Đảm bảo token hợp lệ từ GHN Dashboard
3. Restart server sau khi cập nhật `.env`

### Lỗi: "GHN API error: 401"

**Nguyên nhân:** Token không hợp lệ hoặc đã hết hạn

**Giải pháp:**
1. Kiểm tra token trong GHN Dashboard
2. Tạo token mới nếu cần
3. Cập nhật `GHN_API_TOKEN` trong `.env`

### Lỗi: "Không tìm thấy tỉnh/thành phố"

**Nguyên nhân:** Province code không đúng hoặc không tồn tại trong GHN

**Giải pháp:**
1. Sử dụng `GET /api/provinces` để lấy danh sách provinces
2. Sử dụng đúng `code` từ response
3. Hoặc sử dụng tên province thay vì code

### Lỗi: "Không tìm thấy quận/huyện"

**Nguyên nhân:** District code không đúng hoặc không thuộc province đó

**Giải pháp:**
1. Sử dụng `GET /api/provinces/:provinceCode/districts` để lấy danh sách districts
2. Đảm bảo district thuộc đúng province
3. Sử dụng đúng `code` từ response

## 8. Test Cases Checklist

### Provinces API
- [ ] Get all provinces thành công
- [ ] Get province by code thành công
- [ ] Get districts by province thành công
- [ ] Get wards by district thành công
- [ ] Search provinces/districts/wards thành công
- [ ] Cache hoạt động đúng (gọi lần 2 nhanh hơn)
- [ ] Error handling khi không tìm thấy

### Shipping API
- [ ] Calculate fee với province/district/ward name thành công
- [ ] Calculate fee với province/district/ward ID thành công
- [ ] Create order thành công
- [ ] Get shipping info thành công
- [ ] Track order thành công
- [ ] Error handling khi thiếu thông tin
- [ ] Error handling khi GHN API lỗi

## 9. Performance Testing

### Test Cache

```bash
# Lần 1: Gọi API (sẽ fetch từ GHN)
time curl -X GET http://localhost:3004/api/provinces

# Lần 2: Gọi lại (sẽ dùng cache, nhanh hơn)
time curl -X GET http://localhost:3004/api/provinces
```

### Test Concurrent Requests

```bash
# Gửi 10 requests đồng thời
for i in {1..10}; do
  curl -X GET http://localhost:3004/api/provinces &
done
wait
```

## 10. Notes

- **Cache Duration:** 24 giờ cho provinces/districts/wards, 1 giờ cho search
- **Weight Unit:** Shipping API nhận weight (kg) và tự convert sang gram cho GHN
- **Location Format:** Hỗ trợ cả tên và ID, tự động lookup nếu cần
- **Error Fallback:** Nếu GHN API lỗi, shipping fee sẽ dùng fallback calculation
