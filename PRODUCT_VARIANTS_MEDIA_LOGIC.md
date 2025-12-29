# Logic Xử Lý 3 Bảng: products, product_variants, product_media

## Tổng Quan

Hệ thống xử lý 3 bảng này theo cách:
- **products**: Bảng chính, lưu thông tin cơ bản
- **product_variants**: Biến thể (Size, Color...) - quan hệ 1-N với products
- **product_media**: Hình ảnh/video - quan hệ 1-N với products

---

## BACKEND LOGIC

### 1. CREATE PRODUCT (Tạo Sản Phẩm)

#### Flow:
```
1. Validate input (category_id, name, sku, price, stock_quantity)
2. Check category exists
3. Check SKU unique
4. INSERT vào products table
5. Xử lý images:
   - Nhận image_urls (array URLs đã upload)
   - Nhận image_files (multer files)
   - Upload files → lấy URLs
   - INSERT vào product_media với type='image'
6. Xử lý video:
   - Nhận video_url hoặc video_file
   - Upload file nếu có
   - INSERT vào product_media với type='video'
7. Query lại product với images và video
```

#### Code Backend:
```typescript
// products.controller.ts - createProduct()

// 1. Insert product
const result = await pool.query(
  `INSERT INTO products (category_id, sku, name, description, price, stock_quantity, brand, view_count, sold_count, is_active)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
   RETURNING id, ...`,
  [category_id, sku, name, description, price, stock_quantity, ...]
);

const product = result.rows[0];

// 2. Xử lý images
const imageUrls = Array.isArray(body.image_urls) ? body.image_urls : [];
let uploadedImageUrls: string[] = [];

if (files?.image_files && files.image_files.length > 0) {
  uploadedImageUrls = await uploadMultipleFiles(
    files.image_files.map(file => ({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
    }))
  );
}

const allImageUrls = [...imageUrls, ...uploadedImageUrls];

// 3. Lưu vào product_media
if (allImageUrls.length > 0) {
  for (let i = 0; i < allImageUrls.length; i++) {
    await pool.query(
      `INSERT INTO product_media (product_id, type, image_url, display_order, is_primary)
       VALUES ($1, 'image', $2, $3, $4)`,
      [product.id, allImageUrls[i], i, i === 0] // Ảnh đầu tiên là primary
    );
  }
}

// 4. Xử lý video
if (videoUrl) {
  await pool.query(
    `INSERT INTO product_media (product_id, type, image_url, display_order, is_primary)
     VALUES ($1, 'video', $2, 0, FALSE)`,
    [product.id, videoUrl]
  );
}

// 5. Query lại với images và video
const finalResult = await pool.query(
  `SELECT p.*,
          c.name as category_name,
          (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
           FROM product_media pm
           WHERE pm.product_id = p.id AND pm.type = 'image') AS image_urls,
          (SELECT pm.image_url
           FROM product_media pm
           WHERE pm.product_id = p.id AND pm.type = 'video'
           ORDER BY pm.display_order, pm.id
           LIMIT 1) AS video_url
   FROM products p
   LEFT JOIN categories c ON p.category_id = c.id
   WHERE p.id = $1`,
  [product.id]
);
```

---

### 2. UPDATE PRODUCT (Cập Nhật Sản Phẩm)

#### Flow:
```
1. Validate product exists
2. Update products table (các field được phép)
3. Nếu có image_urls:
   - DELETE tất cả images cũ (type='image')
   - INSERT images mới
4. Nếu có video_url:
   - DELETE video cũ (type='video')
   - INSERT video mới (nếu có)
5. Query lại với images và video
```

#### Code Backend:
```typescript
// products.controller.ts - updateProduct()

// 1. Update products table
const result = await pool.query(
  `UPDATE products SET ${updateFields.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL
   RETURNING id, ...`,
  values
);

// 2. Xử lý images
if (updates.image_urls !== undefined) {
  // Xóa tất cả images cũ
  await pool.query(
    `DELETE FROM product_media WHERE product_id = $1 AND type = 'image'`,
    [id]
  );

  // Thêm images mới
  const imageUrls = Array.isArray(updates.image_urls) ? updates.image_urls : [];
  if (imageUrls.length > 0) {
    for (let i = 0; i < imageUrls.length; i++) {
      await pool.query(
        `INSERT INTO product_media (product_id, type, image_url, display_order, is_primary)
         VALUES ($1, 'image', $2, $3, $4)`,
        [id, imageUrls[i], i, i === 0]
      );
    }
  }
}

// 3. Xử lý video
if (updates.video_url !== undefined) {
  await pool.query(
    `DELETE FROM product_media WHERE product_id = $1 AND type = 'video'`,
    [id]
  );
  
  if (updates.video_url) {
    await pool.query(
      `INSERT INTO product_media (product_id, type, image_url, display_order, is_primary)
       VALUES ($1, 'video', $2, 0, FALSE)`,
      [id, updates.video_url]
    );
  }
}

// 4. Query lại
const finalResult = await pool.query(/* same query as create */);
```

---

### 3. GET PRODUCTS (Lấy Danh Sách)

#### Query Pattern:
```sql
SELECT p.*,
       c.name as category_name,
       -- Tất cả ảnh (array)
       (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
        FROM product_media pm
        WHERE pm.product_id = p.id AND pm.type = 'image') AS image_urls,
       -- Video đầu tiên
       (SELECT pm.image_url
        FROM product_media pm
        WHERE pm.product_id = p.id AND pm.type = 'video'
        ORDER BY pm.display_order, pm.id
        LIMIT 1) AS video_url
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.is_active = TRUE AND p.deleted_at IS NULL
```

#### Response Format:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Áo thun",
      "price": 200000,
      "image_urls": ["url1.jpg", "url2.jpg"],  // Array từ product_media
      "video_url": "video.mp4",                 // Từ product_media
      "category_name": "Áo"
    }
  ]
}
```

---

### 4. GET PRODUCT BY ID (Chi Tiết)

#### Query Pattern:
```sql
SELECT p.*,
       c.name as category_name,
       -- Images
       (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
        FROM product_media pm
        WHERE pm.product_id = p.id AND pm.type = 'image') AS image_urls,
       -- Video
       (SELECT pm.image_url
        FROM product_media pm
        WHERE pm.product_id = p.id AND pm.type = 'video'
        ORDER BY pm.display_order, pm.id
        LIMIT 1) AS video_url,
       -- Variants (JSON array)
       (SELECT json_agg(json_build_object(
         'id', pv.id,
         'variant_type', pv.variant_type,
         'variant_value', pv.variant_value,
         'price_adjustment', pv.price_adjustment,
         'stock_quantity', pv.stock_quantity
       )) FROM product_variants pv 
       WHERE pv.product_id = p.id AND pv.deleted_at IS NULL) as variants
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.id = $1 AND p.deleted_at IS NULL
```

#### Response Format:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Áo thun",
    "price": 200000,
    "image_urls": ["url1.jpg", "url2.jpg"],
    "video_url": "video.mp4",
    "variants": [
      {
        "id": 1,
        "variant_type": "Size",
        "variant_value": "M",
        "price_adjustment": 0,
        "stock_quantity": 10
      },
      {
        "id": 2,
        "variant_type": "Size",
        "variant_value": "L",
        "price_adjustment": 20000,
        "stock_quantity": 5
      }
    ]
  }
}
```

---

### 5. DELETE PRODUCT (Xóa)

#### Flow:
```
1. Soft delete product (SET deleted_at = NOW())
2. Soft delete tất cả variants (ON DELETE CASCADE tự động xóa)
3. product_media tự động xóa (ON DELETE CASCADE)
```

#### Code:
```typescript
// Soft delete product
await pool.query(
  `UPDATE products 
   SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
   WHERE id = $1 AND deleted_at IS NULL`,
  [id]
);

// Soft delete variants
await pool.query(
  `UPDATE product_variants 
   SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
   WHERE product_id = $1 AND deleted_at IS NULL`,
  [id]
);

// product_media tự động xóa do ON DELETE CASCADE
```

---

### 6. PRODUCT VARIANTS (Biến Thể)

#### CREATE VARIANT:
```typescript
// product-variants.controller.ts - createVariant()

// 1. Check product exists
// 2. Check unique (product_id, variant_type, variant_value)
// 3. INSERT variant
await pool.query(
  `INSERT INTO product_variants (product_id, variant_type, variant_value, price_adjustment, stock_quantity)
   VALUES ($1, $2, $3, $4, $5)
   RETURNING id, ...`,
  [product_id, variant_type, variant_value, price_adjustment || 0, stock_quantity || 0]
);
```

#### GET VARIANTS BY PRODUCT:
```typescript
// Lấy tất cả variants của sản phẩm
await pool.query(
  `SELECT id, product_id, variant_type, variant_value, price_adjustment, stock_quantity, created_at, updated_at 
   FROM product_variants 
   WHERE product_id = $1 AND deleted_at IS NULL
   ORDER BY variant_type, variant_value`,
  [product_id]
);
```

#### UPDATE VARIANT:
```typescript
// Update các field được phép
await pool.query(
  `UPDATE product_variants 
   SET variant_type = $1, variant_value = $2, price_adjustment = $3, stock_quantity = $4
   WHERE id = $5`,
  [variant_type, variant_value, price_adjustment, stock_quantity, id]
);
```

#### DELETE VARIANT:
```typescript
// Soft delete
await pool.query(
  `UPDATE product_variants 
   SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
   WHERE id = $1 AND deleted_at IS NULL`,
  [id]
);
```

---

## FRONTEND LOGIC

### 1. CREATE PRODUCT FORM

#### Flow:
```
1. User nhập thông tin sản phẩm
2. User upload images (files hoặc URLs)
3. User upload video (file hoặc URL)
4. User thêm variants (draft trong state)
5. Submit:
   a. Upload image files → lấy URLs
   b. Upload video file → lấy URL
   c. Gửi product data + image_urls + video_url
   d. Sau khi có product.id → tạo variants
```

#### Code Frontend:
```typescript
// ProductForm.tsx - handleSubmit()

const handleSubmit = async (values: any) => {
  // 1. Tách images: URLs và Files
  const imageUrlsFromItems = imageItems
    .filter(item => item.type === 'url' && item.url?.trim())
    .map(item => item.url!);
  
  const imageFiles = imageItems
    .filter(item => item.type === 'file' && item.file)
    .map(item => item.file!);

  // 2. Upload files trước
  const uploadedImageUrls = imageFiles.length
    ? await uploadMultipleFiles(imageFiles)
    : [];

  const finalVideoUrl = videoFile 
    ? await uploadFile(videoFile) 
    : videoUrl || undefined;

  // 3. Kết hợp tất cả image URLs
  const allImageUrls = [...imageUrlsFromItems, ...uploadedImageUrls];

  // 4. Tạo product
  const createPayload = {
    ...values,
    image_urls: allImageUrls.length > 0 ? allImageUrls : undefined,
    video_url: finalVideoUrl,
    stock_quantity: stockToUse,
  };

  const createResponse = await productService.createProduct(createPayload);
  const createdProductId = createResponse.data.id;

  // 5. Tạo variants sau khi có product ID
  if (createdProductId && variantDrafts.length > 0) {
    for (const v of variantDrafts) {
      await variantService.createVariant(createdProductId, {
        variant_type: v.variant_type,
        variant_value: v.variant_value,
        price_adjustment: v.price_adjustment || 0,
        stock_quantity: v.stock_quantity || 0,
      });
    }
  }
};
```

---

### 2. UPDATE PRODUCT FORM

#### Flow:
```
1. Load product data:
   - Load product info
   - Load image_urls → setImageItems
   - Load video_url → setVideoUrl
   - Load variants → setVariants
2. User chỉnh sửa
3. Submit:
   a. Upload files mới → lấy URLs
   b. Kết hợp URLs cũ + URLs mới
   c. Gửi update với image_urls và video_url
   d. Backend sẽ xóa cũ và thêm mới
```

#### Code Frontend:
```typescript
// ProductForm.tsx - fetchProduct()

const fetchProduct = async () => {
  const response = await productService.getProductById(Number(id));
  const product = response.data;
  
  // Set form values
  form.setFieldsValue({
    category_id: product.category_id,
    name: product.name,
    description: product.description,
    price: product.price,
    stock_quantity: product.stock_quantity,
  });
  
  // Load images từ image_urls
  if (product.image_urls && product.image_urls.length > 0) {
    setImageItems(product.image_urls.map(url => ({ type: 'url' as const, url })));
  }
  
  // Load video
  if (product.video_url) {
    setVideoUrl(product.video_url);
  }
};

// Submit update
const handleSubmit = async (values: any) => {
  // Upload files mới
  let uploadedImageUrls: string[] = [];
  if (imageFiles.length > 0) {
    uploadedImageUrls = await uploadMultipleFiles(imageFiles);
  }
  
  let finalVideoUrl = videoUrl;
  if (videoFile) {
    finalVideoUrl = await uploadFile(videoFile);
  }
  
  // Kết hợp URLs cũ + mới
  const allImageUrls = [...imageUrlsFromItems, ...uploadedImageUrls];
  
  // Update product
  await productService.updateProduct(Number(id), {
    ...values,
    image_urls: allImageUrls.length > 0 ? allImageUrls : undefined,
    video_url: finalVideoUrl || undefined,
    stock_quantity: stockToUse,
  });
};
```

---

### 3. DISPLAY PRODUCTS

#### Hiển Thị Danh Sách:
```typescript
// ProductList.tsx, AdminProductManagement.tsx

// Backend trả về image_urls là array
const product = {
  id: 1,
  name: "Áo thun",
  image_urls: ["url1.jpg", "url2.jpg"],  // Từ product_media
  // ...
};

// Hiển thị ảnh đầu tiên
<Image src={product.image_urls?.[0] || '/placeholder.png'} />

// Hoặc fallback
<Image src={product.image_url || product.image_urls?.[0] || '/placeholder.png'} />
```

#### Hiển Thị Chi Tiết:
```typescript
// ProductDetail.tsx

// Load product với variants
const product = await productService.getProductById(id);

// Hiển thị images
{product.image_urls?.map((url, index) => (
  <Image key={index} src={url} />
))}

// Hiển thị variants
{product.variants?.map(variant => (
  <div key={variant.id}>
    {variant.variant_type}: {variant.variant_value}
    Giá: {product.price + variant.price_adjustment} VNĐ
    Tồn kho: {variant.stock_quantity}
  </div>
))}
```

---

## QUAN HỆ GIỮA CÁC BẢNG

```
products (1) ──< (N) product_variants
  │
  └──< (N) product_media
```

### Constraints:
- `product_variants.product_id` → `products.id` (ON DELETE CASCADE)
- `product_media.product_id` → `products.id` (ON DELETE CASCADE)
- `product_variants`: UNIQUE(product_id, variant_type, variant_value)

### Logic Quan Trọng:

1. **Images không lưu trong products table**
   - Luôn query từ `product_media`
   - Trả về dưới dạng array `image_urls`

2. **Variants độc lập với media**
   - Variants có thể có `image_url` riêng (trong variant)
   - Nhưng product media là chung cho tất cả variants

3. **Soft Delete**
   - Xóa product → soft delete variants
   - product_media tự động xóa (CASCADE)

4. **Price Calculation**
   ```typescript
   // Giá variant = giá gốc + điều chỉnh
   const variantPrice = product.price + variant.price_adjustment;
   ```

5. **Stock Management**
   - Product có `stock_quantity` tổng
   - Variant có `stock_quantity` riêng
   - Khi mua variant: trừ cả 2 stocks

---

## BEST PRACTICES

1. **Luôn query image_urls từ product_media**
   - Không lưu trong products table
   - Sử dụng subquery với array_agg

2. **Upload files trước khi tạo product**
   - Frontend upload → lấy URLs
   - Gửi URLs lên backend
   - Backend lưu vào product_media

3. **Update images: Xóa cũ, thêm mới**
   - DELETE tất cả images cũ
   - INSERT images mới
   - Đảm bảo display_order đúng

4. **Variants tạo sau khi có product ID**
   - Tạo product trước
   - Lấy product.id
   - Tạo variants với product_id

5. **Sắp xếp images theo display_order**
   - ORDER BY display_order, id
   - Ảnh đầu tiên (display_order=0) là primary

---

## VẤN ĐỀ CẦN LƯU Ý

1. **Image URLs Format**
   - Backend trả về array PostgreSQL
   - Frontend cần xử lý array đúng cách
   - Fallback nếu không có images

2. **Variant Image**
   - Variant có thể có `image_url` riêng
   - Nhưng product media vẫn là chung
   - Cần logic hiển thị variant image nếu có

3. **Stock Sync**
   - Product stock và variant stock độc lập
   - Cần logic đồng bộ khi cần

4. **CASCADE Delete**
   - Xóa product → tự động xóa media
   - Cần backup nếu cần giữ media

