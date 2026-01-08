# GHN API - Triển Khai Đầy Đủ

## Tổng Quan

Tài liệu này liệt kê tất cả các API endpoint của GHN và trạng thái triển khai trong hệ thống.

## Đã Triển Khai ✅

### Address (Địa chỉ)
- ✅ Get Province - Lấy danh sách tỉnh/thành phố
- ✅ Get District - Lấy danh sách quận/huyện
- ✅ Get Ward - Lấy danh sách phường/xã

### Calculate Fee (Tính phí)
- ✅ Calculate Fee - Tính phí vận chuyển
- ❌ Get Service - Lấy danh sách dịch vụ (Nhanh, Chuẩn, Tiết kiệm)
- ❌ Fee of Order Info - Lấy chi tiết phí của đơn hàng

### Order (Đơn hàng)
- ✅ Create Order - Tạo đơn hàng
- ✅ Order Info - Lấy thông tin đơn hàng (track)
- ❌ Calculate Expected Delivery Time - Tính thời gian giao hàng dự kiến
- ❌ Get Station - Lấy danh sách bưu cục
- ❌ Update COD - Cập nhật COD của đơn hàng
- ❌ Delivery Again - Giao lại đơn hàng
- ❌ Print Order - In thông tin đơn hàng
- ❌ Return Order - Trả lại hàng
- ❌ Cancel Order - Hủy đơn hàng
- ❌ Update Order - Cập nhật thông tin đơn hàng
- ❌ Preview Order - Xem thông tin trả về trước khi tạo
- ❌ Pick Shift - Lấy danh sách ca lấy
- ❌ Order Info by Client_Order_Code - Lấy thông tin đơn hàng bằng mã đơn hàng

### Store (Cửa hàng)
- ❌ Create Store - Tạo cửa hàng
- ❌ Get Store - Lấy thông tin cửa hàng

### Ticket (Yêu cầu)
- ❌ Get Ticket List - Lấy danh sách ticket
- ❌ Get Ticket - Lấy chi tiết ticket
- ❌ Create Ticket - Tạo ticket
- ❌ Create Feedback of Ticket - Tạo phản hồi ticket

### Webhook
- ❌ Callback order status - Nhận callback về trạng thái đơn hàng
- ❌ Callback of Ticket - Nhận callback về ticket

## Cần Triển Khai (Ưu Tiên)

### 1. Get Service (Cao)
**Mục đích:** Lấy danh sách dịch vụ vận chuyển (Nhanh, Chuẩn, Tiết kiệm) để user chọn

**Endpoint:** `POST /shipping-order/available-services`

**Request:**
```json
{
  "shop_id": 885,
  "from_district": 1447,
  "to_district": 1442
}
```

**Response:**
```json
{
  "code": 200,
  "message": "Success",
  "data": [
    {
      "service_id": 53319,
      "short_name": "Nhanh",
      "service_type_id": 1
    },
    {
      "service_id": 53320,
      "short_name": "Chuẩn",
      "service_type_id": 2
    },
    {
      "service_id": 53321,
      "short_name": "Tiết kiệm",
      "service_type_id": 3
    }
  ]
}
```

### 2. Calculate Expected Delivery Time (Cao)
**Mục đích:** Tính thời gian giao hàng dự kiến

**Endpoint:** `POST /shipping-order/leadtime`

### 3. Cancel Order (Cao)
**Mục đích:** Hủy đơn hàng đã tạo

**Endpoint:** `POST /shipping-order/cancel`

### 4. Update COD (Trung bình)
**Mục đích:** Cập nhật số tiền COD của đơn hàng

**Endpoint:** `POST /shipping-order/update-cod`

### 5. Update Order (Trung bình)
**Mục đích:** Cập nhật thông tin đơn hàng (địa chỉ, người nhận, v.v.)

**Endpoint:** `POST /shipping-order/update`

### 6. Get Station (Trung bình)
**Mục đích:** Lấy danh sách bưu cục để chọn điểm lấy/giao hàng

**Endpoint:** `GET /shipping-order/station`

### 7. Return Order (Thấp)
**Mục đích:** Tạo đơn trả hàng

**Endpoint:** `POST /shipping-order/return`

### 8. Delivery Again (Thấp)
**Mục đích:** Yêu cầu giao lại đơn hàng

**Endpoint:** `POST /shipping-order/delivery-again`

### 9. Webhook (Cao - cho production)
**Mục đích:** Nhận callback từ GHN về trạng thái đơn hàng

**Endpoint:** `POST /webhook/ghn/order-status`

## Kế Hoạch Triển Khai

### Phase 1: Core Features (Ưu tiên cao)
1. Get Service - Cho phép user chọn loại dịch vụ
2. Calculate Expected Delivery Time - Hiển thị thời gian giao hàng
3. Cancel Order - Hủy đơn hàng

### Phase 2: Order Management (Ưu tiên trung bình)
4. Update COD - Cập nhật COD
5. Update Order - Cập nhật thông tin đơn hàng
6. Get Station - Chọn bưu cục

### Phase 3: Advanced Features (Ưu tiên thấp)
7. Return Order - Trả hàng
8. Delivery Again - Giao lại
9. Webhook - Nhận callback
