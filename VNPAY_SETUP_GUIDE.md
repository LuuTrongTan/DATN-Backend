# Hướng dẫn Setup VNPay cho Development và Production

## ⚠️ QUAN TRỌNG: VNPay cần URL công khai

VNPay **BẮT BUỘC** phải có thể gọi về ReturnURL và IPN URL từ internet. Điều này có nghĩa:

- ❌ **KHÔNG THỂ** dùng `http://localhost:3004` trực tiếp
- ✅ **PHẢI** có URL công khai (public URL) để VNPay có thể truy cập

## Có 2 cách để test VNPay:

### Cách 1: Dùng ngrok/localtunnel (Khuyến nghị cho Development)

**Ưu điểm:**
- Không cần deploy
- Test nhanh trên localhost
- Miễn phí

**Nhược điểm:**
- URL thay đổi mỗi lần chạy (trừ khi dùng ngrok với tài khoản trả phí)
- Cần chạy thêm tool ngrok/localtunnel

#### Setup với ngrok:

1. **Cài đặt ngrok:**
   ```bash
   # Windows: Download từ https://ngrok.com/download
   # Hoặc dùng chocolatey:
   choco install ngrok
   
   # Mac:
   brew install ngrok
   
   # Linux:
   wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz
   tar -xzf ngrok-v3-stable-linux-amd64.tgz
   sudo mv ngrok /usr/local/bin
   ```

2. **Đăng ký tài khoản ngrok (miễn phí):**
   - Vào https://ngrok.com/ và đăng ký
   - Lấy authtoken từ dashboard

3. **Cấu hình ngrok:**
   ```bash
   ngrok config add-authtoken YOUR_NGROK_TOKEN
   ```

4. **Chạy ngrok để expose backend:**
   ```bash
   # Expose port 3004 (hoặc port backend của bạn)
   ngrok http 3004
   ```

5. **Lấy URL công khai từ ngrok:**
   ```
   Forwarding: https://abc123.ngrok-free.app -> http://localhost:3004
   ```

6. **Cấu hình trong `.env`:**
   ```env
   BASE_URL=https://abc123.ngrok-free.app
   VNPAY_RETURN_URL=https://abc123.ngrok-free.app/api/payment/vnpay/return
   VNPAY_IPN_URL=https://abc123.ngrok-free.app/api/payment/vnpay/ipn
   FRONTEND_URL=http://localhost:5173
   ```

7. **Restart backend server** để load lại biến môi trường

#### Setup với localtunnel (Alternative):

1. **Cài đặt localtunnel:**
   ```bash
   npm install -g localtunnel
   ```

2. **Chạy localtunnel:**
   ```bash
   lt --port 3004 --subdomain your-subdomain
   ```

3. **Lấy URL và cấu hình tương tự ngrok**

### Cách 2: Deploy Backend lên Server (Cho Production)

**Ưu điểm:**
- URL cố định
- Ổn định hơn
- Phù hợp cho production

**Nhược điểm:**
- Cần server và domain
- Mất thời gian setup

#### Các bước deploy:

1. **Deploy backend lên server** (VPS, Heroku, Railway, Render, v.v.)

2. **Cấu hình domain** trỏ về server:
   ```
   api.yourdomain.com -> your-server-ip
   ```

3. **Cấu hình trong `.env` trên server:**
   ```env
   BASE_URL=https://api.yourdomain.com
   VNPAY_RETURN_URL=https://api.yourdomain.com/api/payment/vnpay/return
   VNPAY_IPN_URL=https://api.yourdomain.com/api/payment/vnpay/ipn
   FRONTEND_URL=https://yourdomain.com
   ```

4. **Đảm bảo HTTPS:**
   - VNPay yêu cầu HTTPS cho production
   - Có thể dùng Let's Encrypt hoặc Cloudflare

## Cấu hình VNPay trong Dashboard

Sau khi có URL công khai, cần cấu hình trong VNPay Dashboard:

1. **Đăng nhập VNPay Dashboard:** https://sandbox.vnpayment.vn/

2. **Vào phần cấu hình:**
   - Return URL: `https://your-backend-url/api/payment/vnpay/return`
   - IPN URL: `https://your-backend-url/api/payment/vnpay/ipn`

3. **Lấy thông tin:**
   - TMN Code
   - Hash Secret

4. **Cấu hình trong `.env`:**
   ```env
   VNPAY_TMN_CODE=your_tmn_code
   VNPAY_HASH_SECRET=your_hash_secret
   VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
   ```

## Test Flow

1. **Start backend với URL công khai** (ngrok hoặc deployed server)

2. **Start frontend** (có thể chạy localhost)

3. **Tạo đơn hàng với thanh toán online**

4. **Kiểm tra:**
   - Backend tạo URL thanh toán thành công
   - Redirect đến VNPay thành công
   - Thanh toán trên VNPay
   - VNPay redirect về ReturnURL
   - Backend xử lý callback và redirect về frontend

## Lưu ý quan trọng

### Development (Localhost):
- ✅ Dùng ngrok/localtunnel để expose localhost
- ✅ Frontend có thể chạy localhost
- ✅ Backend phải có URL công khai

### Production:
- ✅ Deploy backend lên server với domain
- ✅ Deploy frontend lên server/CDN
- ✅ Dùng HTTPS cho cả backend và frontend
- ✅ Cấu hình VNPay production (không phải sandbox)

### Security:
- ⚠️ ReturnURL và IPN URL là **public endpoints** (không cần auth)
- ⚠️ Backend sẽ verify checksum từ VNPay để đảm bảo an toàn
- ⚠️ Không expose sensitive data trong URL

## Troubleshooting

### Vấn đề: VNPay không redirect về

**Nguyên nhân:**
- ReturnURL không thể truy cập được từ internet
- URL không đúng format

**Cách sửa:**
1. Test ReturnURL bằng cách mở trong browser
2. Đảm bảo URL là HTTPS (cho production) hoặc HTTP (cho sandbox)
3. Kiểm tra firewall không block request từ VNPay

### Vấn đề: IPN không được gọi

**Nguyên nhân:**
- IPN URL không thể truy cập được
- VNPay không thể gọi về server

**Cách sửa:**
1. Test IPN URL bằng cách mở trong browser (sẽ trả về error nhưng phải accessible)
2. Kiểm tra server logs để xem có request từ VNPay không
3. Đảm bảo server không block request từ VNPay IPs

### Vấn đề: Code=70

**Nguyên nhân:**
- Checksum không đúng
- ReturnURL/IPN URL không đúng

**Cách sửa:**
1. Kiểm tra Hash Secret có đúng không
2. Kiểm tra ReturnURL và IPN URL có thể truy cập được không
3. Xem log backend để debug

## Tóm tắt

| Môi trường | Backend URL | Frontend URL | Cần Deploy? |
|------------|-------------|--------------|-------------|
| **Development** | ngrok/localtunnel URL | localhost | ❌ Không (dùng ngrok) |
| **Production** | Deployed server URL | Deployed server URL | ✅ Có |

**Kết luận:** 
- **Development:** Không cần deploy, nhưng **PHẢI** dùng ngrok/localtunnel để expose backend
- **Production:** **PHẢI** deploy cả backend và frontend lên server
