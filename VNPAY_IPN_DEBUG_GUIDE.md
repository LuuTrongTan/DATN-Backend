# Hướng dẫn Debug VNPay IPN - Kiểm tra tại sao không cập nhật database

## Các nguyên nhân có thể

### 1. IPN URL không được gọi từ VNPay

**Kiểm tra:**
- Xem log file để tìm dòng `VNPay IPN called`
- Nếu không thấy log này → IPN URL không được gọi

**Nguyên nhân:**
- IPN URL không được cấu hình trong VNPay merchant portal
- IPN URL không thể truy cập được từ internet (nếu đang test local)
- VNPay chưa gửi IPN (có thể delay vài phút)

**Giải pháp:**
- Kiểm tra cấu hình IPN URL trong VNPay merchant portal
- Sử dụng ngrok hoặc expose URL để test local
- Đợi vài phút sau khi thanh toán thành công

### 2. Checksum verification failed

**Kiểm tra:**
- Xem log file để tìm dòng `VNPay IPN verification failed`
- Kiểm tra `RspCode: '97'` trong response

**Nguyên nhân:**
- Hash Secret không đúng
- Hash Secret có khoảng trắng thừa
- Tham số không khớp với khi tạo URL thanh toán

**Giải pháp:**
- Kiểm tra `VNPAY_HASH_SECRET` trong file `.env`
- Đảm bảo không có khoảng trắng thừa
- So sánh checksum với code demo chuẩn

### 3. Order không tìm thấy

**Kiểm tra:**
- Xem log file để tìm dòng `VNPay IPN order not found`
- Kiểm tra `order_number` trong database có khớp với `vnp_TxnRef` không

**Nguyên nhân:**
- `order_number` không khớp với `vnp_TxnRef` từ VNPay
- Đơn hàng đã bị xóa (`deleted_at IS NOT NULL`)

**Giải pháp:**
- Kiểm tra `order_number` trong database
- So sánh với `vnp_TxnRef` từ VNPay callback
- Đảm bảo đơn hàng chưa bị xóa

### 4. Amount mismatch

**Kiểm tra:**
- Xem log file để tìm dòng `VNPay IPN amount mismatch`
- So sánh `callbackAmount` và `orderAmount`

**Nguyên nhân:**
- Số tiền từ VNPay không khớp với số tiền trong database
- VNPay trả về số tiền đã nhân 100, nhưng code không chia lại đúng

**Giải pháp:**
- Kiểm tra logic tính toán amount trong `verifyVNPayCallback`
- Đảm bảo số tiền được chia 100 đúng cách

### 5. Transaction rollback do lỗi

**Kiểm tra:**
- Xem log file để tìm dòng `VNPay IPN: Transaction rolled back due to error`
- Kiểm tra lỗi cụ thể trong log

**Nguyên nhân:**
- Lỗi khi insert vào `payment_transactions`
- Lỗi khi tạo notification
- Lỗi khi gửi email

**Giải pháp:**
- Kiểm tra bảng `payment_transactions` có tồn tại không
- Kiểm tra các bảng liên quan (notifications, users, etc.)
- Xem chi tiết lỗi trong log

### 6. Đơn hàng đã được thanh toán rồi (idempotent)

**Kiểm tra:**
- Xem log file để tìm dòng `VNPay IPN: Order already paid, skipping update`
- Kiểm tra `payment_status` trong database

**Nguyên nhân:**
- IPN được gọi nhiều lần (bình thường)
- Đơn hàng đã được cập nhật từ lần IPN trước

**Giải pháp:**
- Đây là hành vi bình thường, không cần xử lý gì

## Cách kiểm tra log

### 1. Xem log real-time
```bash
# Xem log hệ thống
tail -f logs/combined-*.log

# Xem log lỗi
tail -f logs/error-*.log
```

### 2. Tìm log liên quan đến IPN
```bash
# Tìm tất cả log IPN
grep "VNPay IPN" logs/combined-*.log

# Tìm log của một đơn hàng cụ thể
grep "ORDER_NUMBER_HERE" logs/combined-*.log
```

### 3. Kiểm tra response từ IPN
- IPN phải trả về `{ RspCode: '00', Message: 'Success' }` nếu thành công
- Nếu không, xem `RspCode` để biết lỗi cụ thể:
  - `97`: Checksum failed
  - `99`: Missing order number / Unknown error
  - `01`: Order not found
  - `04`: Amount mismatch
  - `02`: Order already updated

## Test IPN URL manually

### 1. Tạo script test
```javascript
// test-ipn-manual.js
const querystring = require('qs');
const crypto = require('crypto');

// Thông tin từ VNPay callback
const params = {
  vnp_Amount: '1000000',
  vnp_BankCode: 'NCB',
  vnp_CardType: 'ATM',
  vnp_OrderInfo: 'Thanh toan don hang ORDER123',
  vnp_PayDate: '20240115120000',
  vnp_ResponseCode: '00',
  vnp_TmnCode: 'YOUR_TMN_CODE',
  vnp_TransactionNo: '12345678',
  vnp_TransactionStatus: '00',
  vnp_TxnRef: 'ORDER123',
  vnp_SecureHash: 'YOUR_HASH_HERE'
};

// Test checksum
const secretKey = 'YOUR_SECRET_KEY';
const secureHash = params['vnp_SecureHash'];
delete params['vnp_SecureHash'];
delete params['vnp_SecureHashType'];

const sortedParams = sortObject(params);
const signData = querystring.stringify(sortedParams, { encode: false });
const hmac = crypto.createHmac('sha512', secretKey);
const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

console.log('Calculated hash:', signed);
console.log('Received hash:', secureHash);
console.log('Match:', signed === secureHash);
```

### 2. Test với curl
```bash
curl -X GET "http://localhost:3000/api/payment/vnpay/ipn?vnp_Amount=1000000&vnp_TxnRef=ORDER123&vnp_ResponseCode=00&vnp_SecureHash=..."
```

## Checklist để debug

- [ ] IPN URL được cấu hình đúng trong VNPay merchant portal
- [ ] IPN URL có thể truy cập được từ internet (nếu test local, dùng ngrok)
- [ ] `VNPAY_HASH_SECRET` trong `.env` đúng và không có khoảng trắng thừa
- [ ] `VNPAY_TMN_CODE` trong `.env` đúng
- [ ] Log file có ghi nhận IPN được gọi
- [ ] Checksum verification thành công
- [ ] Order number khớp với database
- [ ] Amount khớp với database
- [ ] Transaction commit thành công (không rollback)
- [ ] Database được cập nhật (kiểm tra bằng SQL query)

## SQL để kiểm tra

```sql
-- Kiểm tra đơn hàng
SELECT id, order_number, payment_status, order_status, total_amount, updated_at
FROM orders
WHERE order_number = 'ORDER_NUMBER_HERE';

-- Kiểm tra payment transactions
SELECT * FROM payment_transactions
WHERE order_id = ORDER_ID_HERE;

-- Kiểm tra notifications
SELECT * FROM notifications
WHERE user_id = USER_ID_HERE
ORDER BY created_at DESC
LIMIT 10;
```

## Lưu ý quan trọng

1. **IPN URL phải public**: VNPay cần gọi được IPN URL từ internet
2. **Response phải nhanh**: IPN phải trả về response trong vòng 5 giây
3. **Idempotent**: IPN có thể được gọi nhiều lần, code phải xử lý được
4. **Checksum là bắt buộc**: Luôn verify checksum trước khi xử lý
5. **Transaction**: Sử dụng database transaction để đảm bảo tính nhất quán
