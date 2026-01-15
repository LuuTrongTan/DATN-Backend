# Tóm tắt Luồng Xử Lý Thanh Toán VNPay

## ✅ Hệ thống đã xử lý đầy đủ các bước sau:

### 1. **Tạo URL Thanh Toán** (`/api/payment/vnpay/create`)
- ✅ Validate đơn hàng và người dùng
- ✅ Kiểm tra đơn hàng chưa được thanh toán
- ✅ Tạo URL thanh toán VNPay với đầy đủ tham số
- ✅ Tính toán checksum (SHA512 HMAC)
- ✅ Trả về URL để frontend redirect

### 2. **IPN URL - Xử Lý Callback từ VNPay** (`/api/payment/vnpay/ipn`)
Đây là phần **QUAN TRỌNG NHẤT** để cập nhật trạng thái thanh toán:

#### 2.1. Kiểm tra và Xác thực
- ✅ Log chi tiết khi IPN được gọi
- ✅ Verify checksum (vnp_SecureHash)
- ✅ Kiểm tra order number tồn tại
- ✅ Tìm đơn hàng trong database
- ✅ Lock đơn hàng để tránh race condition (FOR UPDATE)

#### 2.2. Kiểm tra Điều Kiện Thanh Toán Thành Công
- ✅ Kiểm tra đơn hàng chưa được thanh toán (idempotent)
- ✅ Kiểm tra `vnp_ResponseCode = '00'` (thanh toán thành công)
- ✅ Kiểm tra số tiền khớp (chênh lệch ≤ 0.01 VND)

#### 2.3. Cập Nhật Database (Khi Thanh Toán Thành Công)
- ✅ Cập nhật `payment_status = PAID`
- ✅ Cập nhật `order_status = CONFIRMED` (nếu đang PENDING)
- ✅ Cập nhật `updated_at = NOW()`
- ✅ Lưu vào `payment_transactions`:
  - `order_id`
  - `transaction_id` (mã giao dịch từ VNPay)
  - `payment_gateway = 'vnpay'`
  - `amount`
  - `status = 'success'`
- ✅ Commit transaction

#### 2.4. Thông Báo và Email (Sau Khi Commit)
- ✅ Tạo notification cho user:
  - Type: `payment_success`
  - Title: "Thanh toán thành công"
  - Message: Thông báo đơn hàng đã được xác nhận
- ✅ Gửi email xác nhận đơn hàng:
  - Mã đơn hàng
  - Thông tin khách hàng
  - Danh sách sản phẩm
  - Tổng tiền
  - Địa chỉ giao hàng
  - Phương thức thanh toán: "Thanh toán online (VNPay)"
- ✅ Gửi email cập nhật trạng thái:
  - Thông báo đơn hàng đã được xác nhận

#### 2.5. Xử Lý Thanh Toán Thất Bại
- ✅ Hoàn lại số lượng sản phẩm vào kho
- ✅ Cập nhật `payment_status = FAILED`
- ✅ Cập nhật `order_status = CANCELLED` (nếu đang PENDING)
- ✅ Tạo notification thất bại
- ✅ Gửi email thông báo thất bại

### 3. **ReturnURL - Redirect Khách Hàng** (`/api/payment/vnpay/return`)
- ✅ Nhận callback từ VNPay
- ✅ Log thông tin để debug
- ✅ Trả về response tối thiểu
- ⚠️ **Lưu ý**: ReturnURL không cập nhật database, chỉ để redirect

### 4. **API Kiểm Tra Trạng Thái** (`/api/payment/status/:order_id`)
- ✅ Lấy trạng thái thanh toán của đơn hàng
- ✅ Kiểm tra quyền truy cập (user phải là chủ đơn hàng)

## 📋 Checklist Xử Lý Khi Thanh Toán Thành Công

Khi `vnp_ResponseCode = '00'` và các điều kiện khác đều đúng:

- [x] **Database được cập nhật**
  - [x] `payment_status = PAID`
  - [x] `order_status = CONFIRMED` (nếu đang PENDING)
  - [x] `updated_at` được cập nhật

- [x] **Lưu thông tin giao dịch**
  - [x] Insert vào `payment_transactions`
  - [x] Lưu mã giao dịch từ VNPay

- [x] **Thông báo cho người dùng**
  - [x] Tạo notification trong hệ thống
  - [x] Gửi email xác nhận đơn hàng
  - [x] Gửi email cập nhật trạng thái

- [x] **Logging đầy đủ**
  - [x] Log khi IPN được gọi
  - [x] Log kết quả verification
  - [x] Log khi cập nhật database
  - [x] Log khi commit transaction
  - [x] Log lỗi nếu có

- [x] **Xử lý lỗi**
  - [x] Transaction rollback nếu có lỗi
  - [x] Log lỗi chi tiết
  - [x] Không làm fail transaction nếu email/notification lỗi

## 🔍 Cách Kiểm Tra Hệ Thống Đã Xử Lý

### 1. Kiểm tra Log
```bash
# Xem log IPN
grep "VNPay IPN" Backend/logs/combined-*.log

# Xem log thanh toán thành công
grep "VNPay payment successful" Backend/logs/combined-*.log

# Xem log cập nhật database
grep "Order status updated successfully" Backend/logs/combined-*.log
```

### 2. Kiểm tra Database
```sql
-- Kiểm tra đơn hàng đã được cập nhật chưa
SELECT id, order_number, payment_status, order_status, updated_at
FROM orders
WHERE order_number = 'ORDER_NUMBER_HERE';

-- Kiểm tra payment_transactions
SELECT * FROM payment_transactions
WHERE order_id = ORDER_ID_HERE;

-- Kiểm tra notifications
SELECT * FROM notifications
WHERE user_id = USER_ID_HERE
ORDER BY created_at DESC
LIMIT 5;
```

### 3. Kiểm tra Response từ IPN
IPN phải trả về:
```json
{
  "RspCode": "00",
  "Message": "Success"
}
```

## ⚠️ Lưu Ý Quan Trọng

1. **IPN URL phải public**: VNPay cần gọi được IPN URL từ internet
2. **Response phải nhanh**: IPN phải trả về response trong vòng 5 giây
3. **Idempotent**: IPN có thể được gọi nhiều lần, code đã xử lý được
4. **Transaction**: Sử dụng database transaction để đảm bảo tính nhất quán
5. **Error handling**: Email/notification lỗi không làm fail transaction

## 🎯 Kết Luận

**Hệ thống đã xử lý đầy đủ** các bước cần thiết khi thanh toán thành công:
- ✅ Cập nhật database
- ✅ Lưu thông tin giao dịch
- ✅ Thông báo cho người dùng
- ✅ Gửi email xác nhận
- ✅ Logging đầy đủ
- ✅ Xử lý lỗi tốt

Nếu database chưa được cập nhật, có thể do:
1. IPN URL chưa được gọi từ VNPay (kiểm tra log)
2. Checksum verification fail (kiểm tra VNPAY_HASH_SECRET)
3. IPN URL không public (nếu test local, cần dùng ngrok)
