# Phân Tích Toàn Diện Hệ Thống Database

## 4. Phân Tích Tiếp Theo: Giỏ Hàng và Đơn Hàng

### Bảng `order_items`
- **Thiết kế:** Cơ bản, nhưng cần cải thiện để đảm bảo tính toàn vẹn lịch sử.
- **Vấn đề & Đề xuất:**
  - **Toàn vẹn dữ liệu (Ưu tiên cao):**
    - Thêm `ON DELETE SET NULL` cho `product_id` và `variant_id`
    - Thêm các trường snapshot (product_name, variant_sku, variant_attributes_snapshot)
  - **Chuẩn hóa dữ liệu (Ưu tiên trung bình):**
    - Đồng nhất kiểu dữ liệu tiền tệ: đổi `price` từ `INTEGER` sang `DECIMAL(10, 2)`
  - **Kinh doanh (Ưu tiên thấp):**
    - Thêm `discount_amount` nếu có giảm giá riêng cho từng sản phẩm

## 5. Các Vấn Đề Ưu Tiên Cần Giải Quyết

### Ưu Tiên Cao (Ảnh hưởng đến tính toàn vẹn dữ liệu và bảo mật):
1. **Toàn vẹn dữ liệu:**
   - Thêm `ON DELETE SET NULL` cho các khóa ngoại còn thiếu
   - Thêm các trường snapshot cho dữ liệu lịch sử
   - Đồng nhất kiểu dữ liệu tiền tệ giữa các bảng liên quan đến đơn hàng

### Ưu Tiên Trung Bình (Ảnh hưởng đến trải nghiệm người dùng):
- Cải thiện khả năng truy vết lịch sử trạng thái đơn hàng
- Bổ sung thêm các chỉ số thống kê phục vụ dashboard

### Ưu Tiên Thấp (Có thể cải thiện sau):
- Tối ưu thêm index cho các truy vấn thống kê phức tạp

## 6. Kết Luận

Hệ thống database hiện tại đã bao phủ đầy đủ các luồng chính về sản phẩm, giỏ hàng, đơn hàng, thanh toán và vận chuyển, nhưng vẫn cần được củng cố thêm về toàn vẹn dữ liệu và hiệu năng truy vấn, đặc biệt ở nhóm bảng đơn hàng và thống kê.