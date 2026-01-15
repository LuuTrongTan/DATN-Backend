# Hướng dẫn Test VNPay Local Không Cần Expose

## ⚠️ Vấn đề

VNPay sandbox **KHÔNG THỂ** gọi về `localhost` trực tiếp vì:
- VNPay server không thể truy cập máy tính local của bạn
- ReturnURL và IPN URL phải là URL công khai (public URL)

## ✅ Giải pháp: Test Thủ Công với VNPay Thật

Bạn có thể test VNPay thật bằng cách **test thủ công callback** mà không cần expose:

### Cách 1: Test Thủ Công ReturnURL (Khuyến nghị)

**Flow:**
1. Tạo đơn hàng và lấy URL thanh toán VNPay
2. Mở URL trong browser và thanh toán trên VNPay
3. Sau khi thanh toán, VNPay sẽ redirect về ReturnURL
4. **Vì ReturnURL là localhost, bạn sẽ không được redirect tự động**
5. **Nhưng bạn có thể copy callback URL từ VNPay và test thủ công**

**Các bước:**

1. **Cấu hình `.env` với localhost:**
   ```env
   BASE_URL=http://localhost:3004
   VNPAY_RETURN_URL=http://localhost:3004/api/payment/vnpay/return
   VNPAY_IPN_URL=http://localhost:3004/api/payment/vnpay/ipn
   VNPAY_TMN_CODE=your_tmn_code
   VNPAY_HASH_SECRET=your_hash_secret
   ```

2. **Tạo đơn hàng và lấy URL thanh toán:**
   - Frontend sẽ gọi API tạo URL thanh toán
   - Backend trả về URL VNPay
   - Copy URL này

3. **Thanh toán trên VNPay:**
   - Mở URL VNPay trong browser
   - Thanh toán với test card:
     - Số thẻ: `9704198526191432198`
     - Tên: `NGUYEN VAN A`
     - Ngày hết hạn: `07/15`
     - OTP: `123456`

4. **Sau khi thanh toán thành công:**
   - VNPay sẽ hiển thị trang kết quả
   - Trang này sẽ có link "Quay về website" hoặc hiển thị ReturnURL
   - **Copy URL callback từ VNPay** (sẽ có dạng: `http://localhost:3004/api/payment/vnpay/return?vnp_Amount=...&vnp_SecureHash=...`)

5. **Test callback thủ công:**
   - Mở URL callback đã copy trong browser
   - Backend sẽ xử lý callback và redirect về frontend
   - Kiểm tra kết quả

### Cách 2: Test IPN Thủ Công

IPN (Instant Payment Notification) là callback tự động từ VNPay. Vì không thể expose, bạn có thể:

1. **Tạo test endpoint để simulate IPN:**
   ```bash
   # Tạo file test script hoặc dùng Postman
   POST http://localhost:3004/api/payment/vnpay/ipn
   # Với body chứa các tham số từ VNPay
   ```

2. **Hoặc dùng curl:**
   ```bash
   curl -X POST "http://localhost:3004/api/payment/vnpay/ipn" \
     -d "vnp_Amount=1000000&vnp_BankCode=NCB&vnp_CardType=ATM&vnp_OrderInfo=Thanh+toan+don+hang&vnp_ResponseCode=00&vnp_TmnCode=YOUR_TMN_CODE&vnp_TransactionNo=12345678&vnp_TransactionStatus=00&vnp_TxnRef=ORD-123&vnp_SecureHash=..."
   ```

### Cách 3: Dùng localhost.run (Đơn giản hơn ngrok)

**localhost.run** là một dịch vụ miễn phí để expose localhost:

1. **Cài đặt SSH client** (Windows có sẵn OpenSSH)

2. **Chạy lệnh:**
   ```bash
   ssh -R 80:localhost:3004 serveo.net
   ```

3. **Lấy URL công khai:**
   ```
   Forwarding HTTP traffic from https://abc123.serveo.net -> localhost:3004
   ```

4. **Cấu hình `.env`:**
   ```env
   BASE_URL=https://abc123.serveo.net
   VNPAY_RETURN_URL=https://abc123.serveo.net/api/payment/vnpay/return
   VNPAY_IPN_URL=https://abc123.serveo.net/api/payment/vnpay/ipn
   ```

**Ưu điểm:**
- Không cần đăng ký tài khoản
- Không cần cài đặt tool
- Chỉ cần SSH (có sẵn trên Windows 10+)

### Cách 4: Dùng Cloudflare Tunnel (Miễn phí, URL cố định)

1. **Cài đặt cloudflared:**
   ```bash
   # Windows: Download từ https://github.com/cloudflare/cloudflared/releases
   # Hoặc: choco install cloudflared
   ```

2. **Chạy tunnel:**
   ```bash
   cloudflared tunnel --url http://localhost:3004
   ```

3. **Lấy URL và cấu hình tương tự**

## 📝 Tạo Test Script để Test Callback

Tạo file `Backend/scripts/test-vnpay-callback.ts`:

```typescript
import { createMockVNPayCallback } from '../src/modules/payment/vnpay.mock.service';

// Test callback với order number và amount
const orderNumber = 'ORD-1234567890';
const amount = 100000; // 1,000,000 VND

// Tạo callback data giống VNPay
const callbackData = createMockVNPayCallback(orderNumber, amount, true);

// Log để copy và test
console.log('Test VNPay Callback URL:');
console.log(`http://localhost:3004/api/payment/vnpay/return?${new URLSearchParams(callbackData).toString()}`);
```

## 🎯 Khuyến nghị

**Cho Development:**
- ✅ **Cách tốt nhất:** Dùng **localhost.run** (đơn giản, không cần đăng ký)
- ✅ **Cách thay thế:** Test thủ công ReturnURL (không cần tool gì)

**Cho Production:**
- ✅ Deploy backend lên server với domain thật

## ⚠️ Lưu ý

1. **ReturnURL test thủ công:**
   - VNPay sẽ không redirect tự động về localhost
   - Bạn phải copy URL callback và test thủ công
   - Vẫn test được flow xử lý callback

2. **IPN không thể test tự động:**
   - IPN là callback tự động từ VNPay
   - Không expose thì VNPay không thể gọi về
   - Phải test thủ công bằng cách gọi API trực tiếp

3. **Test với VNPay sandbox:**
   - Vẫn dùng VNPay sandbox thật
   - Chỉ không có callback tự động
   - Vẫn test được toàn bộ flow thanh toán

## 📋 Checklist Test

- [ ] Cấu hình VNPay credentials trong `.env`
- [ ] Tạo đơn hàng với thanh toán online
- [ ] Lấy URL thanh toán VNPay
- [ ] Thanh toán trên VNPay sandbox với test card
- [ ] Copy callback URL từ VNPay
- [ ] Test callback thủ công trong browser
- [ ] Kiểm tra đơn hàng đã được cập nhật trạng thái
- [ ] Kiểm tra notification đã được tạo

## 🔗 Tài liệu tham khảo

- VNPay Sandbox: https://sandbox.vnpayment.vn/
- localhost.run: https://localhost.run/
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
