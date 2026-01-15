# Hướng dẫn Debug Lỗi "Sai chữ ký" (Code 70) VNPay

## 🔍 Cách Tra cứu và Debug

### Bước 1: Chạy Script Debug

Chạy script debug để kiểm tra checksum:

```bash
cd Backend
node scripts/debug-vnpay-checksum.js
```

Script này sẽ:
- ✅ Kiểm tra cấu hình `.env`
- ✅ Tạo các tham số mẫu
- ✅ Tính checksum theo cách hiện tại
- ✅ Hiển thị chi tiết để so sánh
- ✅ Cảnh báo các vấn đề thường gặp

### Bước 2: Kiểm tra Log Backend

Khi tạo URL thanh toán, backend sẽ log chi tiết. Kiểm tra log:

```bash
# Xem log real-time
tail -f Backend/logs/combined-*.log

# Hoặc xem log error
tail -f Backend/logs/error-*.log
```

Tìm log có message: `VNPay payment URL created`

### Bước 3: So sánh với Code Demo VNPay

1. **Download code demo từ VNPay:**
   - Truy cập: https://sandbox.vnpayment.vn/apis/downloads/
   - Download code demo Node.js
   - So sánh cách tính checksum

2. **Kiểm tra các điểm quan trọng:**
   - ✅ Cách sắp xếp tham số (theo alphabet)
   - ✅ Cách tạo signData (không encode)
   - ✅ Cách tính SHA512 hash
   - ✅ Cách thêm checksum vào URL

### Bước 4: Kiểm tra Cấu hình

#### 4.1. Kiểm tra file `.env`

```env
VNPAY_TMN_CODE=your_tmn_code_here
VNPAY_HASH_SECRET=your_hash_secret_here
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=http://your-backend-url/api/payment/vnpay/return
VNPAY_IPN_URL=http://your-backend-url/api/payment/vnpay/ipn
```

**Lưu ý quan trọng:**
- ⚠️ `VNPAY_HASH_SECRET` **KHÔNG ĐƯỢC** có khoảng trắng ở đầu/cuối
- ⚠️ Copy chính xác từ VNPay dashboard (không thêm/bớt ký tự)
- ⚠️ `VNPAY_TMN_CODE` phải đúng với tài khoản của bạn

#### 4.2. Kiểm tra Hash Secret có khoảng trắng thừa

```bash
# Chạy script debug sẽ tự động kiểm tra
node scripts/debug-vnpay-checksum.js
```

Hoặc kiểm tra thủ công trong code:

```javascript
const hashSecret = process.env.VNPAY_HASH_SECRET;
console.log('Hash Secret gốc:', JSON.stringify(hashSecret));
console.log('Hash Secret sau trim:', JSON.stringify(hashSecret.trim()));
console.log('Có khác nhau không?', hashSecret !== hashSecret.trim());
```

### Bước 5: Kiểm tra SignData

SignData phải có format:
```
vnp_Amount=1000000&vnp_Command=pay&vnp_CreateDate=20260115183121&vnp_CurrCode=VND&vnp_ExpireDate=20260115184621&vnp_IpAddr=127.0.0.1&vnp_Locale=vn&vnp_OrderInfo=Thanh toan don hang&vnp_OrderType=other&vnp_ReturnUrl=http://...&vnp_TmnCode=YOUR_TMN_CODE&vnp_TxnRef=ORD-...&vnp_Version=2.1.0
```

**Kiểm tra:**
- ✅ Các tham số được sắp xếp theo alphabet
- ✅ Format: `key=value&key=value` (không encode)
- ✅ **KHÔNG** có `vnp_SecureHash` trong signData khi tính checksum
- ✅ **KHÔNG** có `vnp_SecureHashType` trong signData

### Bước 6: Kiểm tra ReturnURL và IPN URL

**Yêu cầu:**
- ✅ Phải là URL công khai (không phải localhost khi deploy)
- ✅ Phải có thể truy cập được từ internet
- ✅ Phải là URL hợp lệ (có protocol http/https)

**Test:**
```bash
# Test ReturnURL
curl http://your-backend-url/api/payment/vnpay/return

# Test IPN URL
curl http://your-backend-url/api/payment/vnpay/ipn
```

### Bước 7: So sánh Checksum

Nếu có code demo VNPay, so sánh:

1. **Lấy signData từ log backend**
2. **Tính checksum bằng code demo VNPay**
3. **So sánh với checksum từ code của bạn**

Nếu khác nhau → Tìm điểm khác biệt trong cách tính.

## 🐛 Các Lỗi Thường Gặp và Cách Sửa

### Lỗi 1: Hash Secret có khoảng trắng thừa

**Triệu chứng:**
- Checksum không đúng
- Lỗi "Sai chữ ký"

**Cách sửa:**
```javascript
// Trong vnpay.service.ts, thêm trim()
const hashSecret = (process.env.VNPAY_HASH_SECRET || '').trim();
```

### Lỗi 2: SignData có encode

**Triệu chứng:**
- Checksum không đúng
- URL có ký tự đặc biệt bị encode

**Cách sửa:**
- Đảm bảo dùng `stringifyWithoutEncode()` khi tính checksum
- Chỉ encode khi tạo URL cuối cùng

### Lỗi 3: Tham số không được sắp xếp đúng

**Triệu chứng:**
- Checksum không đúng
- Thứ tự tham số sai

**Cách sửa:**
- Đảm bảo dùng `sortObject()` để sắp xếp theo alphabet
- Kiểm tra log để xem thứ tự tham số

### Lỗi 4: ReturnURL không công khai

**Triệu chứng:**
- VNPay không thể redirect về
- Lỗi khi test

**Cách sửa:**
- Dùng ngrok/localhost.run để expose localhost
- Hoặc deploy backend lên server

## 📋 Checklist Debug

- [ ] Đã chạy script debug: `node scripts/debug-vnpay-checksum.js`
- [ ] Đã kiểm tra log backend khi tạo URL
- [ ] Đã so sánh với code demo VNPay
- [ ] Đã kiểm tra Hash Secret không có khoảng trắng thừa
- [ ] Đã kiểm tra SignData format đúng
- [ ] Đã kiểm tra ReturnURL và IPN URL công khai
- [ ] Đã kiểm tra các tham số đúng format
- [ ] Đã test với URL thật từ backend

## 🔗 Tài liệu Tham khảo

- **VNPay API Docs**: https://sandbox.vnpayment.vn/apis/docs/
- **Code Demo**: https://sandbox.vnpayment.vn/apis/downloads/
- **Dashboard**: https://sandbox.vnpayment.vn/vnpaygw-sit-testing/

## 💡 Tips

1. **Bật debug mode:**
   ```env
   DEBUG_VNPAY=true
   ```
   Sẽ log đầy đủ URL và checksum

2. **So sánh với Postman:**
   - Tạo request trong Postman với các tham số từ log
   - So sánh checksum

3. **Dùng VNPay Dashboard:**
   - Xem giao dịch trong dashboard
   - Kiểm tra thông tin giao dịch
   - So sánh với log backend
