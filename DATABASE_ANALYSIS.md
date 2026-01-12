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

### Bảng `reviews`
- **Thiết kế:** Tốt, hỗ trợ đa phương tiện và phản hồi từ cửa hàng.
- **Vấn đề & Đề xuất:**
  - **Toàn vẹn dữ liệu (Ưu tiên cao):**
    - Thêm `ON DELETE SET NULL` cho `product_id` và `order_id`
    - Thêm ràng buộc để đảm bảo `order_id` phải thuộc về `user_id`
  - **Trải nghiệm (Ưu tiên trung bình):**
    - Thêm trạng thái xác minh mua hàng (verified_purchase)
    - Thêm khả năng đánh dấu đánh giá hữu ích
  - **Bảo mật (Ưu tiên trung bình):**
    - Kiểm tra xem người dùng đã mua sản phẩm chưa trước khi đánh giá
    - Giới hạn số lần đánh giá cho mỗi đơn hàng

## 5. Các Vấn Đề Ưu Tiên Cần Giải Quyết

### Ưu Tiên Cao (Ảnh hưởng đến tính toàn vẹn dữ liệu và bảo mật):
1. **Toàn vẹn dữ liệu:**
   - Thêm `ON DELETE SET NULL` cho tất cả các khóa ngoại
   - Thêm các trường snapshot cho dữ liệu lịch sử
   - Đồng nhất kiểu dữ liệu tiền tệ

2. **Bảo mật:**
   - Xác thực quyền sở hữu đơn hàng trước khi đánh giá
   - Kiểm tra xác minh mua hàng

### Ưu Tiên Trung Bình (Ảnh hưởng đến trải nghiệm người dùng):
1. **Tính năng đánh giá:**
   - Thêm xác minh đã mua hàng
   - Thêm tính năng báo cáo đánh giá không phù hợp
   - Phân trang và lọc đánh giá

2. **Quản lý nội dung:**
   - Kiểm duyệt đánh giá trước khi hiển thị
   - Chống spam đánh giá

### Ưu Tiên Thấp (Có thể cải thiện sau):
1. **Tương tác xã hội:**
   - Thích và phản hồi đánh giá
   - Đánh dấu đánh giá hữu ích

2. **Phân tích:**
   - Thống kê đánh giá theo sao
   - Phân tích cảm xúc đánh giá

## 6. Kết Luận

Hệ thống đánh giá hiện tại có thiết kế khá đầy đủ nhưng cần được củng cố thêm về mặt bảo mật và toàn vẹn dữ liệu. Các cải tiến về trải nghiệm người dùng và quản lý nội dung cũng cần được xem xét để nâng cao chất lượng đánh giá và độ tin cậy của hệ thống.