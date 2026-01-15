# Hướng dẫn Test VNPay Sandbox (SIT Testing) - Theo Tài liệu Chính thức

## 📋 Tổng quan

VNPay Sandbox cung cấp hệ thống **SIT Testing** để test tích hợp thanh toán mà không cần thẻ thật. Hệ thống này cho phép:
- Tạo giao dịch test từ website/App của bạn
- Kiểm tra và test các test case từ dashboard VNPay
- Xem kết quả test và báo cáo

## 🔗 Truy cập Dashboard

- **URL Dashboard**: https://sandbox.vnpayment.vn/vnpaygw-sit-testing/user/login
- **URL Hướng dẫn**: https://sandbox.vnpayment.vn/vnpaygw-sit-testing/order/instruction

## 📝 Các bước Test theo Tài liệu Chính thức

### Bước 1: Tạo giao dịch từ Website/App

1. **Truy cập website/App** kết nối cổng thanh toán VNPay
2. **Tạo mới giao dịch** với thanh toán online
3. **Chọn thẻ ATM -> NCB** trên trang VNPay
4. **Nhập thông tin thẻ TEST**:
   - Số thẻ: `9704198526191432198`
   - Tên: `NGUYEN VAN A`
   - Ngày hết hạn: `07/15`
   - OTP: `123456`
5. **Dừng lại ở bước OTP** và **tắt trình duyệt đi** (KHÔNG hoàn tất thanh toán)

⚠️ **Lưu ý quan trọng**: 
- Cần tạo mới **2 giao dịch** tới bước OTP thì dừng lại
- Điều này để có dữ liệu tạo test case

### Bước 2: Đăng nhập Dashboard VNPay

1. Truy cập: https://sandbox.vnpayment.vn/vnpaygw-sit-testing/user/login
2. Nhập **Tên đăng nhập** và **Mật khẩu**
3. Nhấn **Đăng nhập**
4. Sau khi đăng nhập thành công, hệ thống hiển thị màn hình danh sách

### Bước 3: Chọn Terminal

1. Chọn vào **ô hình chữ nhật chứa biểu tượng con người** (góc phải trên cùng của trang web)
2. Hệ thống hiển thị **danh sách terminal**
3. **Chọn terminal** cần thao tác (ví dụ: terminal "Thế Sơn")
4. Sau khi chọn terminal, hệ thống chuyển tới màn hình danh sách các giao dịch tương ứng

### Bước 4: Xem Danh sách Giao dịch

Ở bên trái màn hình có cột danh sách lựa chọn:

- **Danh sách giao dịch**: Hiển thị những giao dịch trong ngày (mặc định sau khi chọn terminal)
- **DS GD đã test**: Hiển thị những giao dịch đã test
- **Tìm kiếm giao dịch**: Tìm kiếm giao dịch theo điều kiện

### Bước 5: Kiểm tra Giao dịch

1. **Trong màn hình danh sách giao dịch**, nhấn chọn **Chi tiết** để hiển thị chi tiết giao dịch
2. **Ở màn hình chi tiết giao dịch**, để hiển thị thông tin tương ứng với mỗi test case:
   - Chọn biểu tượng hình tròn bên trong có chữ **'i'**
   - Màn hình hiển thị thông tin tương ứng với mỗi test case
3. **Chọn Số hóa đơn cho Test case "Giao dịch không thành công"**:
   - Chọn nút **Chọn số hóa đơn** ở trong bảng của Test case "Giao dịch không thành công"
   - Màn hình hiển thị danh sách Số hóa đơn
   - Chọn Số hóa đơn mà bạn muốn chọn
4. **Chọn Tiến hành kiểm tra**
5. **Màn hình hiển thị kết quả Test** tương ứng với mỗi test case
6. **Kết quả file báo cáo**: VNPAY sẽ in và gửi đơn vị kết nối kiểm tra thông tin khi quá trình test case hoàn tất

## ⚙️ Cấu hình IPN URL

### Bước 1: Truy cập trang Cấu hình IPN URL

1. Từ menu bên trái, chọn **Cấu hình IPN URL**
2. Hoặc truy cập trực tiếp: https://sandbox.vnpayment.vn/vnpaygw-sit-testing/ipn

### Bước 2: Cấu hình IPN URL cho Terminal

1. Tìm **Terminal Code** của bạn (ví dụ: `67L4GPCO`)
2. Nhập **IPN URL** của bạn vào ô textbox
   - Ví dụ: `https://your-backend-url/api/payment/vnpay/ipn`
   - ⚠️ **Lưu ý**: IPN URL phải là URL công khai (public URL), không thể dùng `localhost`
3. Nhấn **Cập nhật** để lưu cấu hình

### Các cách để có Public URL cho Development

#### Cách 1: Dùng ngrok (Khuyến nghị)

```bash
# Cài đặt ngrok
# Windows: Download từ https://ngrok.com/download
# Hoặc: choco install ngrok

# Chạy ngrok để expose backend
ngrok http 3004

# Lấy URL công khai (ví dụ: https://abc123.ngrok-free.app)
# Cấu hình IPN URL: https://abc123.ngrok-free.app/api/payment/vnpay/ipn
```

#### Cách 2: Dùng localhost.run

```bash
# Chạy SSH tunnel
ssh -R 80:localhost:3004 serveo.net

# Lấy URL công khai và cấu hình tương tự
```

#### Cách 3: Deploy Backend lên Server

Deploy backend lên server với domain thật và cấu hình IPN URL tương ứng.

## 🔄 Luồng Test Hoàn chỉnh

### 1. Chuẩn bị

- ✅ Backend đã được expose ra internet (ngrok/localhost.run/deployed server)
- ✅ IPN URL đã được cấu hình trong dashboard VNPay
- ✅ Return URL đã được cấu hình trong `.env`

### 2. Tạo Giao dịch Test

1. Từ frontend, tạo đơn hàng và chọn thanh toán online
2. Backend tạo URL thanh toán VNPay và redirect user
3. User chọn thẻ ATM -> NCB
4. Nhập thông tin thẻ TEST
5. **Dừng lại ở bước OTP** và tắt trình duyệt
6. Lặp lại để có **2 giao dịch**

### 3. Test từ Dashboard VNPay

1. Đăng nhập dashboard VNPay
2. Chọn terminal của bạn
3. Xem danh sách giao dịch
4. Chọn **Chi tiết** giao dịch cần test
5. Xem thông tin test case (click icon 'i')
6. Chọn số hóa đơn cho test case "Giao dịch không thành công"
7. Nhấn **Tiến hành kiểm tra**
8. Xem kết quả test

### 4. Kiểm tra Kết quả

- ✅ Backend nhận được IPN callback từ VNPay
- ✅ Đơn hàng được cập nhật trạng thái đúng
- ✅ Notification được gửi cho user
- ✅ Return URL redirect user về frontend đúng

## 📊 Các Test Case

VNPay Sandbox hỗ trợ các test case sau:

1. **Giao dịch thành công**: Test flow thanh toán thành công
2. **Giao dịch không thành công**: Test flow thanh toán thất bại
3. **Các test case khác**: Xem chi tiết trong dashboard

## ⚠️ Lưu ý Quan trọng

### Về IPN URL

- ✅ IPN URL **PHẢI** là URL công khai (public URL)
- ❌ **KHÔNG THỂ** dùng `localhost` hoặc `127.0.0.1`
- ✅ IPN URL phải có thể truy cập được từ internet
- ✅ IPN URL không cần authentication (public endpoint)
- ✅ Backend phải trả về JSON với format: `{ RspCode: string, Message: string }`

### Về Return URL

- ✅ Return URL cũng nên là URL công khai
- ✅ Return URL chỉ để hiển thị kết quả cho user
- ✅ **KHÔNG** cập nhật trạng thái đơn hàng tại Return URL
- ✅ Cập nhật trạng thái đơn hàng chỉ thực hiện tại IPN URL

### Về Test Giao dịch

- ✅ Cần tạo **2 giao dịch** đến bước OTP để có dữ liệu test
- ✅ Không hoàn tất thanh toán khi tạo giao dịch test
- ✅ Test các test case từ dashboard VNPay
- ✅ Kiểm tra log backend để debug

## 🐛 Troubleshooting

### Vấn đề: IPN không được gọi

**Nguyên nhân:**
- IPN URL không thể truy cập được từ internet
- IPN URL chưa được cấu hình trong dashboard
- Server block request từ VNPay

**Cách sửa:**
1. Kiểm tra IPN URL có thể truy cập được không (mở trong browser)
2. Kiểm tra IPN URL đã được cấu hình trong dashboard chưa
3. Kiểm tra server logs để xem có request từ VNPay không
4. Đảm bảo server không block request từ VNPay IPs

### Vấn đề: Test case không chạy được

**Nguyên nhân:**
- Chưa có đủ giao dịch test (cần 2 giao dịch)
- Giao dịch đã được hoàn tất (không thể test)

**Cách sửa:**
1. Tạo lại 2 giao dịch mới đến bước OTP
2. Đảm bảo không hoàn tất thanh toán
3. Thử lại test case

### Vấn đề: Checksum failed

**Nguyên nhân:**
- Hash Secret không đúng
- Tham số không hợp lệ

**Cách sửa:**
1. Kiểm tra `VNPAY_HASH_SECRET` trong `.env`
2. Kiểm tra log backend để xem các tham số được gửi
3. Đảm bảo tính toán checksum đúng

## 📚 Tài liệu Tham khảo

- **VNPay Sandbox Dashboard**: https://sandbox.vnpayment.vn/vnpaygw-sit-testing/
- **Hướng dẫn SIT Testing**: https://sandbox.vnpayment.vn/vnpaygw-sit-testing/order/instruction
- **VNPay API Documentation**: https://sandbox.vnpayment.vn/apis/docs/
- **Code Demo**: https://sandbox.vnpayment.vn/apis/downloads/

## ✅ Checklist Test

- [ ] Backend đã được expose ra internet (ngrok/localhost.run/deployed)
- [ ] IPN URL đã được cấu hình trong dashboard VNPay
- [ ] Return URL đã được cấu hình trong `.env`
- [ ] Đã tạo 2 giao dịch test đến bước OTP
- [ ] Đã đăng nhập dashboard VNPay
- [ ] Đã chọn terminal đúng
- [ ] Đã xem danh sách giao dịch
- [ ] Đã test các test case từ dashboard
- [ ] Backend nhận được IPN callback
- [ ] Đơn hàng được cập nhật trạng thái đúng
- [ ] Notification được gửi cho user
- [ ] Return URL redirect user về frontend đúng
