# Hướng dẫn Debug Lỗi VNPay Code=70

## Nguyên nhân Code=70

Code=70 từ VNPay thường có nghĩa là:
- **Checksum không đúng** (hash secret không khớp)
- **Tham số không hợp lệ** hoặc thiếu tham số bắt buộc
- **Format URL không đúng**

## Các bước kiểm tra và sửa lỗi

### 1. Kiểm tra cấu hình VNPay trong `.env`

Đảm bảo các biến sau được cấu hình đúng:

```env
VNPAY_TMN_CODE=your_tmn_code_here
VNPAY_HASH_SECRET=your_hash_secret_here
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://your-backend-url/api/payment/vnpay/return
VNPAY_IPN_URL=http://your-backend-url/api/payment/vnpay/ipn
BASE_URL=http://your-backend-url
```

**Lưu ý quan trọng:**
- `VNPAY_HASH_SECRET` phải **chính xác** và **không có khoảng trắng** ở đầu/cuối
- `VNPAY_TMN_CODE` phải đúng với tài khoản VNPay của bạn
- `VNPAY_RETURN_URL` và `VNPAY_IPN_URL` phải là URL **công khai** (không phải localhost khi deploy production)

### 2. Kiểm tra log backend

Khi tạo URL thanh toán, kiểm tra log để xem:

```json
{
  "orderId": 7,
  "orderNumber": "ORD-...",
  "sanitizedOrderNumber": "ORD...",
  "amount": 47200000,
  "vnpTxnRef": "ORD...",
  "vnpCreateDate": "20260115183121",
  "vnpExpireDate": "20260115184621",
  "returnUrl": "http://...",
  "hasHashSecret": true,
  "hashSecretLength": 32,
  "secureHash": "abc123...",
  "signDataPreview": "vnp_Amount=47200000&vnp_Command=pay&..."
}
```

**Kiểm tra:**
- `hasHashSecret`: Phải là `true`
- `hashSecretLength`: Phải > 0
- `signDataPreview`: Xem các tham số có đúng không
- `secureHash`: Xem hash có được tạo không

### 3. Kiểm tra signData

Log sẽ hiển thị `signData` để tính checksum. Format phải là:
```
vnp_Amount=47200000&vnp_Command=pay&vnp_CreateDate=20260115183121&vnp_CurrCode=VND&vnp_ExpireDate=20260115184621&vnp_IpAddr=127.0.0.1&vnp_Locale=vn&vnp_OrderInfo=Thanh toan don hang&vnp_OrderType=other&vnp_ReturnUrl=http://...&vnp_TmnCode=YOUR_TMN_CODE&vnp_TxnRef=ORD-...&vnp_Version=2.1.0
```

**Lưu ý:**
- Các tham số phải được sắp xếp theo thứ tự alphabet
- Không có `vnp_SecureHash` trong signData khi tính checksum
- Format: `key=value&key=value` (không encode)

### 4. Kiểm tra ReturnUrl và IPN URL

**Yêu cầu:**
- Phải là URL **công khai** (không phải localhost khi deploy)
- Phải có thể truy cập được từ internet
- Phải là URL hợp lệ (có protocol http/https)

**Test localhost:**
- Nếu đang test localhost, có thể dùng ngrok hoặc localtunnel để tạo URL công khai
- Hoặc đảm bảo VNPay sandbox có thể truy cập được localhost của bạn

### 5. Kiểm tra các tham số

**vnp_TxnRef (Order Number):**
- Tối đa 100 ký tự
- Chỉ chấp nhận: chữ số, chữ cái, dấu gạch ngang
- Phải unique cho mỗi giao dịch

**vnp_Amount:**
- Phải nhân 100 (ví dụ: 10,000 VND -> 1000000)
- Không có phần thập phân
- Phải là số nguyên dương

**vnp_OrderInfo:**
- Chỉ chấp nhận ký tự ASCII printable (32-126)
- Không có ký tự đặc biệt HTML: `< > " ' &`
- Tối đa 255 ký tự

**vnp_CreateDate và vnp_ExpireDate:**
- Format: `yyyyMMddHHmmss` (GMT+7)
- Ví dụ: `20260115183121` = 2026-01-15 18:31:21

### 6. Kiểm tra checksum calculation

Code tính checksum:
```typescript
const signData = querystring.stringify(sortedParams, { encode: false });
const hmac = crypto.createHmac('sha512', config.hashSecret);
const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
```

**Đảm bảo:**
- Dùng `sha512` (không phải sha256)
- `encode: false` khi tạo signData
- Hash secret phải đúng và không có khoảng trắng

### 7. Test với VNPay Sandbox

**Tài khoản test:**
- Tạo tài khoản tại: https://sandbox.vnpayment.vn/
- Lấy TMN Code và Hash Secret từ dashboard

**Test card:**
- Số thẻ: `9704198526191432198`
- Tên chủ thẻ: `NGUYEN VAN A`
- Ngày hết hạn: `07/15`
- Mã OTP: `123456`

## Các lỗi thường gặp và cách sửa

### Lỗi: "Checksum failed"

**Nguyên nhân:** Hash secret không đúng hoặc cách tính checksum sai

**Cách sửa:**
1. Kiểm tra lại `VNPAY_HASH_SECRET` trong `.env`
2. Đảm bảo không có khoảng trắng ở đầu/cuối
3. Kiểm tra log `signData` để xem format có đúng không
4. So sánh với code demo của VNPay

### Lỗi: "Invalid parameters"

**Nguyên nhân:** Tham số không hợp lệ hoặc thiếu tham số

**Cách sửa:**
1. Kiểm tra log để xem các tham số được gửi đi
2. Đảm bảo tất cả tham số bắt buộc đều có
3. Kiểm tra format của từng tham số

### Lỗi: "ReturnUrl not accessible"

**Nguyên nhân:** VNPay không thể truy cập ReturnURL

**Cách sửa:**
1. Đảm bảo ReturnURL là URL công khai
2. Test URL bằng cách mở trong browser
3. Nếu localhost, dùng ngrok hoặc localtunnel

## Debug với Postman/curl

Bạn có thể test trực tiếp với VNPay bằng cách tạo URL và mở trong browser:

1. Lấy URL từ log backend
2. Copy URL đầy đủ
3. Mở trong browser
4. Xem response từ VNPay

## Liên hệ hỗ trợ

Nếu vẫn gặp vấn đề:
1. Kiểm tra tài liệu VNPay: https://sandbox.vnpayment.vn/apis/docs/
2. Liên hệ VNPay support
3. Kiểm tra code demo của VNPay để so sánh

## Lưu ý về các lỗi CSP và JavaScript

**Các lỗi này KHÔNG ảnh hưởng đến chức năng thanh toán:**
- `Content-Security-Policy directive 'default-src' contains 'style-src'`
- `timer is not defined`
- Các lỗi JavaScript từ trang VNPay sandbox

Đây là lỗi từ phía VNPay sandbox, không phải từ code của bạn. Bạn có thể **bỏ qua** các lỗi này.
