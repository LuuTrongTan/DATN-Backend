# ⚠️ Các Vấn Đề Còn Lại Cần Sửa

## 🔴 CRITICAL - Security Issues

### 1. auth.middleware.ts - Vẫn dùng res.status().json()
**File:** `Backend/src/middlewares/auth.middleware.ts`
**Vấn đề:** Middleware vẫn dùng `res.status().json()` thay vì `ResponseHandler`
**Lines:** 42, 49, 78, 82

**Tác động:** Response format không nhất quán từ middleware

---

### 2. Hardcoded Default Passwords (SECURITY RISK)
**Files:**
- `Backend/src/modules/admin/admin.controller.ts` - Line 231: `'Staff@123'`
- `Backend/src/connections/db/migrations/20251120_000001_create_users_table.ts` - Line 47: `'12345678'`

**Vấn đề:** 
- Default password được hardcode và trả về trong response
- Migration tạo admin với password mặc định và log ra console

**Tác động:** 
- Security risk nếu không đổi password
- Password có thể bị leak qua logs

**Giải pháp:**
- Không trả về default password trong response
- Generate random password và gửi qua email
- Migration chỉ tạo admin trong development, không log password

---

## 🟡 MEDIUM - Code Quality

### 3. Missing Authorization Check trong getOrderById
**File:** `Backend/src/modules/orders/orders.controller.ts`
**Line:** ~305

**Vấn đề:** Cần kiểm tra xem có check `user_id` trong query không

**Cần kiểm tra:** Query có `AND o.user_id = $2` để đảm bảo user chỉ xem được order của mình

---

### 4. Error Stack Trace Exposure
**File:** `Backend/src/utils/response.ts`
**Line:** 60

**Vấn đề:** 
```typescript
details: appConfig.nodeEnv === 'development' ? err.stack : undefined,
```

**Tác động:** 
- Trong development, stack trace được trả về - OK
- Nhưng cần đảm bảo production không expose stack trace

**Status:** ✅ Đã đúng - chỉ expose trong development

---

## 🟢 LOW - Best Practices

### 5. Hardcoded Values
**Files:**
- `Backend/src/modules/orders/orders.controller.ts` - Line 59: `shippingFee = 30000`
- `Backend/src/modules/admin/admin.controller.ts` - Line 231: `'Staff@123'`

**Giải pháp:** Di chuyển vào config

---

## 📋 Tổng Kết

### Cần Sửa Ngay (CRITICAL):
1. ✅ auth.middleware.ts - ResponseHandler
2. ⚠️ Hardcoded passwords - Security risk

### Cần Kiểm Tra:
3. ⚠️ getOrderById authorization check

### Đã Đúng:
4. ✅ Error stack trace chỉ expose trong development

---

## 🎯 Priority

1. **HIGH:** Sửa auth.middleware.ts
2. **HIGH:** Fix hardcoded passwords
3. **MEDIUM:** Verify getOrderById authorization

