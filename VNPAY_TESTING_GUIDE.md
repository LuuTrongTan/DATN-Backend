# Hướng dẫn Test VNPay

## 1. Kiểm tra cấu hình biến môi trường

Đảm bảo file `.env` có đầy đủ các biến sau:

```env
# VNPay Configuration (BẮT BUỘC)
VNPAY_TMN_CODE=DEMOV210  # Thay bằng mã của bạn
VNPAY_HASH_SECRET=YPVB9TR4TYGVTOA5OOP255UOF148E8JM  # Thay bằng secret của bạn

# URLs (Tùy chọn - có giá trị mặc định)
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://localhost:3004/api/payment/vnpay/return
VNPAY_IPN_URL=http://localhost:3004/api/payment/vnpay/ipn

# Base URLs
BASE_URL=http://localhost:3004
FRONTEND_URL=http://localhost:5173
```

## 2. Khởi động Backend và Frontend

### Backend:
```bash
cd Backend
npm run dev
# Hoặc
npm run dev:tsx
```

Backend sẽ chạy tại: `http://localhost:3004` (hoặc port bạn đã cấu hình)

### Frontend:
```bash
cd Frontend
npm run dev
```

Frontend sẽ chạy tại: `http://localhost:5173` (hoặc port Vite của bạn)

## 3. Test qua Frontend (Cách đơn giản nhất)

### Bước 1: Đăng nhập vào hệ thống
- Truy cập: `http://localhost:5173`
- Đăng nhập với tài khoản của bạn

### Bước 2: Tạo đơn hàng test
1. Thêm sản phẩm vào giỏ hàng
2. Vào trang checkout (`/checkout` hoặc `/place-order`)
3. Chọn địa chỉ giao hàng
4. **Chọn phương thức thanh toán: "Thanh toán online qua VNPay"**
5. Nhấn "Đặt hàng"

### Bước 3: Kiểm tra luồng thanh toán
1. Hệ thống sẽ tự động redirect bạn đến cổng VNPay Sandbox
2. Trên trang VNPay, bạn sẽ thấy form thanh toán
3. **Để test thành công**: Nhập thông tin thẻ test (VNPay sẽ cung cấp trong email)
4. **Để test thất bại**: Hủy giao dịch hoặc nhập sai thông tin

### Bước 4: Kiểm tra kết quả
- Sau khi thanh toán, VNPay sẽ redirect về ReturnURL
- Bạn sẽ được chuyển về trang đơn hàng với thông báo kết quả
- Kiểm tra trong database xem trạng thái đơn hàng đã được cập nhật chưa

## 4. Test trực tiếp qua API (Postman/Thunder Client)

### Bước 1: Lấy JWT Token
```http
POST http://localhost:3004/api/auth/login
Content-Type: application/json

{
  "email": "your_email@example.com",
  "password": "your_password"
}
```

Copy `token` từ response.

### Bước 2: Tạo đơn hàng test
```http
POST http://localhost:3004/api/orders
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "shipping_address": "123 Đường ABC, Phường XYZ, Quận 1, TP.HCM",
  "payment_method": "online",
  "shipping_fee": 30000,
  "notes": "Test VNPay"
}
```

Copy `id` của đơn hàng từ response.

### Bước 3: Tạo URL thanh toán VNPay
```http
POST http://localhost:3004/api/payment/vnpay/create
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "order_id": ORDER_ID_FROM_STEP_2
}
```

Response sẽ trả về:
```json
{
  "success": true,
  "data": {
    "payment_url": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?..."
  },
  "message": "Tạo URL thanh toán VNPay thành công"
}
```

### Bước 4: Test thanh toán
1. Copy `payment_url` từ response
2. Mở URL đó trong trình duyệt
3. Thực hiện thanh toán trên VNPay Sandbox
4. Kiểm tra ReturnURL và IPN URL đã nhận được callback chưa

## 5. Kiểm tra Logs

### Backend Logs:
Kiểm tra file logs trong `Backend/logs/` hoặc console để xem:
- URL thanh toán đã được tạo thành công
- IPN callback đã được nhận và xử lý
- ReturnURL đã được xử lý

### Các log quan trọng:
- `VNPay payment URL created` - URL đã được tạo
- `VNPay payment successful` - Thanh toán thành công qua IPN
- `VNPay payment failed` - Thanh toán thất bại
- `VNPay callback checksum mismatch` - Lỗi checksum (cần kiểm tra lại secret key)

## 6. Test IPN URL trực tiếp

Để test IPN URL, bạn có thể dùng curl hoặc Postman:

```bash
curl -X GET "http://localhost:3004/api/payment/vnpay/ipn?vnp_Amount=1000000&vnp_BankCode=NCB&vnp_CardType=ATM&vnp_OrderInfo=Thanh+toan+don+hang&vnp_PayDate=20240101120000&vnp_ResponseCode=00&vnp_TmnCode=DEMOV210&vnp_TransactionNo=12345678&vnp_TransactionStatus=00&vnp_TxnRef=ORDER123&vnp_SecureHash=YOUR_HASH_HERE"
```

**Lưu ý**: Bạn cần tính toán `vnp_SecureHash` đúng theo thuật toán SHA512.

## 7. Kiểm tra Database

Sau khi thanh toán thành công, kiểm tra:

```sql
-- Kiểm tra trạng thái đơn hàng
SELECT id, order_number, payment_status, order_status, total_amount 
FROM orders 
WHERE order_number = 'ORDER_NUMBER_HERE';

-- Kiểm tra giao dịch thanh toán (nếu có bảng payment_transactions)
SELECT * FROM payment_transactions 
WHERE order_id = ORDER_ID_HERE;
```

## 8. Xử lý lỗi thường gặp

### Lỗi: "VNPay chưa được cấu hình"
- Kiểm tra `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET` đã được set trong `.env`
- Đảm bảo không có khoảng trắng thừa trong giá trị

### Lỗi: "Checksum failed"
- Kiểm tra `VNPAY_HASH_SECRET` đã đúng chưa
- Đảm bảo ReturnURL và IPN URL đã được cấu hình đúng trong VNPay Merchant Portal

### Lỗi: "Order not found"
- Kiểm tra `order_number` trong callback có khớp với đơn hàng trong database không
- Kiểm tra `vnp_TxnRef` trong URL thanh toán đã được set đúng là `order_number`

## 9. Thông tin thẻ test VNPay Sandbox

VNPay sẽ cung cấp thông tin thẻ test trong email sau khi đăng ký sandbox. Thường sẽ có:
- Số thẻ test
- Ngày hết hạn
- CVV
- OTP (nếu cần)

## 10. Cấu hình ReturnURL và IPN URL trong VNPay Portal

1. Đăng nhập vào VNPay Merchant Portal (sandbox)
2. Vào phần cấu hình
3. Thiết lập:
   - **ReturnURL**: `http://localhost:3004/api/payment/vnpay/return` (hoặc URL production của bạn)
   - **IPN URL**: `http://localhost:3004/api/payment/vnpay/ipn` (hoặc URL production của bạn)

**Lưu ý**: Nếu test local, bạn có thể dùng ngrok để expose localhost ra internet:
```bash
ngrok http 3004
```
Sau đó dùng URL ngrok để cấu hình trong VNPay Portal.
