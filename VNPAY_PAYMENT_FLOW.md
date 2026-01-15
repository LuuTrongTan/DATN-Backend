# Hướng dẫn Flow Thanh toán VNPay

## Tổng quan

Flow thanh toán VNPay hoạt động theo các bước sau:

1. **User chọn thanh toán online** và nhấn "Đặt hàng"
2. **Backend tạo đơn hàng** với trạng thái `pending` và `payment_status = pending`
3. **Backend tạo URL thanh toán VNPay** với các tham số:
   - `vnp_TxnRef`: Mã đơn hàng (order_number)
   - `vnp_Amount`: Số tiền (đã nhân 100)
   - `vnp_OrderInfo`: Mô tả đơn hàng
   - `vnp_ReturnUrl`: URL để VNPay redirect về sau khi thanh toán
   - `vnp_SecureHash`: Chữ ký SHA512 để xác thực
4. **Frontend redirect user** đến trang VNPay sandbox (`https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`)
5. **User thanh toán** trên trang VNPay (nhập thông tin thẻ, OTP, v.v.)
6. **VNPay xử lý thanh toán** và gửi callback về:
   - **ReturnURL**: Redirect user về sau khi thanh toán (GET request)
   - **IPN URL**: Gửi thông báo kết quả thanh toán (POST/GET request)
7. **Backend xử lý callback**:
   - Xác thực chữ ký (checksum)
   - Cập nhật trạng thái đơn hàng và thanh toán
   - Gửi notification cho user
8. **Backend redirect user** về frontend với kết quả thanh toán

## User cần làm gì?

Khi user chọn thanh toán online và đặt hàng:

1. **Chọn phương thức thanh toán**: Chọn "Thanh toán online qua VNPay"
2. **Nhấn "Đặt hàng"**: Hệ thống sẽ tự động redirect đến trang VNPay
3. **Thanh toán trên trang VNPay**:
   - Nhập thông tin thẻ ngân hàng
   - Nhập OTP nếu được yêu cầu
   - Xác nhận thanh toán
4. **Chờ redirect về**: Sau khi thanh toán, VNPay sẽ tự động redirect về trang web
5. **Xem kết quả**: Trang web sẽ hiển thị kết quả thanh toán (thành công/thất bại)

## Các lỗi thường gặp

### 1. Lỗi Code=70 từ VNPay

**Nguyên nhân:**
- Checksum không đúng (hash secret không khớp)
- Tham số không hợp lệ hoặc thiếu tham số bắt buộc
- Order number quá dài hoặc chứa ký tự đặc biệt không được phép

**Cách xử lý:**
- Kiểm tra `VNPAY_HASH_SECRET` trong file `.env` có đúng không
- Kiểm tra `VNPAY_TMN_CODE` có đúng không
- Kiểm tra log để xem các tham số được gửi đi
- Đảm bảo ReturnURL và IPN URL đều là URL hợp lệ và có thể truy cập được

### 2. Lỗi CSP (Content-Security-Policy) từ trang VNPay

**Nguyên nhân:**
- Trang VNPay sandbox có cấu hình CSP không đúng
- Đây là lỗi từ phía VNPay, không phải từ code của bạn

**Cách xử lý:**
- **Bỏ qua các lỗi này** - chúng không ảnh hưởng đến chức năng thanh toán
- Các lỗi CSP và JavaScript từ trang VNPay sandbox là bình thường và không ảnh hưởng đến quá trình thanh toán

### 3. Lỗi JavaScript từ trang VNPay

**Nguyên nhân:**
- Trang VNPay sandbox có lỗi JavaScript (ví dụ: `timer is not defined`)
- Đây là lỗi từ phía VNPay, không phải từ code của bạn

**Cách xử lý:**
- **Bỏ qua các lỗi này** - chúng không ảnh hưởng đến chức năng thanh toán
- Nếu thanh toán vẫn hoạt động bình thường, bạn có thể bỏ qua các cảnh báo này

## Debug và Troubleshooting

### Kiểm tra log backend

Khi có vấn đề, kiểm tra log backend để xem:

1. **URL thanh toán có được tạo thành công không:**
   ```
   VNPay payment URL created
   ```

2. **Các tham số được gửi đi:**
   - `orderId`: ID đơn hàng
   - `orderNumber`: Mã đơn hàng
   - `amount`: Số tiền (đã nhân 100)
   - `vnpTxnRef`: Mã tham chiếu giao dịch
   - `returnUrl`: URL callback

3. **Callback từ VNPay:**
   - `VNPay return URL verification failed`: Checksum không đúng
   - `VNPay callback checksum mismatch`: Chữ ký không khớp

### Kiểm tra cấu hình

Đảm bảo các biến môi trường sau được cấu hình đúng:

```env
VNPAY_TMN_CODE=your_tmn_code
VNPAY_HASH_SECRET=your_hash_secret
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://your-backend-url/api/payment/vnpay/return
VNPAY_IPN_URL=http://your-backend-url/api/payment/vnpay/ipn
BASE_URL=http://your-backend-url
FRONTEND_URL=http://your-frontend-url
```

### Kiểm tra URL callback

Đảm bảo:
- ReturnURL và IPN URL đều là URL công khai (không phải localhost) khi deploy production
- Các URL này có thể truy cập được từ internet (VNPay cần gọi về)
- Các URL này không yêu cầu authentication (public endpoints)

## Lưu ý quan trọng

1. **Sandbox vs Production:**
   - Sandbox: Dùng để test, không cần thẻ thật
   - Production: Cần đăng ký với VNPay và dùng URL production

2. **Checksum:**
   - Luôn phải tính đúng checksum SHA512
   - Hash secret phải khớp giữa backend và VNPay

3. **Order Number:**
   - Tối đa 100 ký tự
   - Chỉ chấp nhận chữ số, chữ cái và dấu gạch ngang
   - Phải unique cho mỗi giao dịch

4. **Amount:**
   - Phải nhân 100 trước khi gửi (ví dụ: 10,000 VND -> 1000000)
   - Không có phần thập phân

5. **Timeout:**
   - URL thanh toán có thời gian hết hạn (15 phút)
   - User phải thanh toán trong thời gian này

## Tài liệu tham khảo

- [VNPay Integration Guide](https://sandbox.vnpayment.vn/apis/)
- [VNPay API Documentation](https://sandbox.vnpayment.vn/apis/docs/)
