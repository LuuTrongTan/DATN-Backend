# Implementation: Variant Images Support

## Tổng Quan

Đã thêm hỗ trợ để variant có thể có nhiều ảnh, tương tự như product.

## Thay Đổi Database

### Migration: `20251222_000001_add_variant_id_to_product_media.ts`

- Thêm cột `variant_id` (nullable) vào `product_media`
- Foreign key: `variant_id → product_variants(id) ON DELETE CASCADE`
- Indexes:
  - `idx_product_media_variant` (variant_id)
  - `idx_product_media_product_variant` (product_id, variant_id)

### Logic:
- `variant_id = NULL`: Ảnh của product
- `variant_id != NULL`: Ảnh của variant cụ thể

## Backend Changes

### 1. Product Variants Controller

#### CREATE VARIANT:
```typescript
// Nhận image_urls trong body
const variantImageUrls = Array.isArray(validated.image_urls) 
  ? validated.image_urls 
  : typeof validated.image_urls === 'string' 
    ? [validated.image_urls] 
    : [];

// Lưu vào product_media với variant_id
if (variantImageUrls.length > 0) {
  for (let i = 0; i < variantImageUrls.length; i++) {
    await pool.query(
      `INSERT INTO product_media (product_id, variant_id, type, image_url, display_order, is_primary)
       VALUES ($1, $2, 'image', $3, $4, $5)`,
      [product_id, variant.id, variantImageUrls[i], i, i === 0]
    );
  }
}

// Query lại với images
const variantWithImages = await pool.query(
  `SELECT pv.*,
          (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
           FROM product_media pm
           WHERE pm.variant_id = pv.id AND pm.type = 'image') AS image_urls
   FROM product_variants pv
   WHERE pv.id = $1`,
  [variant.id]
);
```

#### UPDATE VARIANT:
```typescript
// Xóa images cũ
await pool.query(
  `DELETE FROM product_media WHERE variant_id = $1 AND type = 'image'`,
  [id]
);

// Thêm images mới
const imageUrls = Array.isArray(validated.image_urls) ? validated.image_urls : [];
if (imageUrls.length > 0) {
  for (let i = 0; i < imageUrls.length; i++) {
    await pool.query(
      `INSERT INTO product_media (product_id, variant_id, type, image_url, display_order, is_primary)
       VALUES ($1, $2, 'image', $3, $4, $5)`,
      [variant.product_id, id, imageUrls[i], i, i === 0]
    );
  }
}
```

#### GET VARIANTS:
```typescript
// Query variants với images
SELECT pv.*,
       (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
        FROM product_media pm
        WHERE pm.variant_id = pv.id AND pm.type = 'image') AS image_urls
FROM product_variants pv
WHERE pv.product_id = $1
```

### 2. Products Controller

#### GET PRODUCT BY ID:
```typescript
// Variants với images
(SELECT json_agg(json_build_object(
  'id', pv.id,
  'variant_type', pv.variant_type,
  'variant_value', pv.variant_value,
  'price_adjustment', pv.price_adjustment,
  'stock_quantity', pv.stock_quantity,
  'image_urls', (SELECT COALESCE(array_agg(pm.image_url ORDER BY pm.display_order, pm.id), ARRAY[]::text[])
                 FROM product_media pm
                 WHERE pm.variant_id = pv.id AND pm.type = 'image')
)) FROM product_variants pv WHERE pv.product_id = p.id AND pv.deleted_at IS NULL) as variants
```

### 3. Validation Schema

```typescript
// product-variants.validation.ts
export const createVariantSchema = z.object({
  variant_type: z.string().min(1),
  variant_value: z.string().min(1),
  price_adjustment: z.number().int().optional(),
  stock_quantity: z.number().int().nonnegative().optional(),
  image_urls: z.union([z.array(z.string()), z.string()]).optional(), // NEW
});

export const updateVariantSchema = z.object({
  // ... same fields
  image_urls: z.union([z.array(z.string()), z.string()]).optional(), // NEW
});
```

## Frontend Changes (TODO)

### 1. State Management

```typescript
// Thêm state cho variant images
const [variantImageItems, setVariantImageItems] = useState<ImageItem[]>([]);
```

### 2. Variant Modal Form

Cần thêm upload images vào variant modal (tương tự product images):
- Upload files
- Nhập URLs
- Preview images
- Remove images

### 3. Save Variant

```typescript
const saveVariant = async (values: any) => {
  // Upload variant image files
  const variantImageFiles = variantImageItems
    .filter(item => item.type === 'file' && item.file)
    .map(item => item.file!);
  
  const uploadedVariantImageUrls = variantImageFiles.length
    ? await uploadMultipleFiles(variantImageFiles)
    : [];

  const variantImageUrls = variantImageItems
    .filter(item => item.type === 'url' && item.url?.trim())
    .map(item => item.url!);

  const allVariantImageUrls = [...variantImageUrls, ...uploadedVariantImageUrls];

  // Gửi với image_urls
  await variantService.createVariant(Number(id), {
    ...values,
    image_urls: allVariantImageUrls.length > 0 ? allVariantImageUrls : undefined,
  });
};
```

### 4. Load Variant Images

```typescript
const openEditVariantModal = (v: ProductVariant) => {
  variantForm.setFieldsValue({
    variant_type: v.variant_type,
    variant_value: v.variant_value,
    price_adjustment: v.price_adjustment || 0,
    stock_quantity: v.stock_quantity || 0,
  });
  
  // Load variant images
  if (v.image_urls && v.image_urls.length > 0) {
    setVariantImageItems(v.image_urls.map(url => ({ type: 'url' as const, url })));
  } else {
    setVariantImageItems([]);
  }
  
  setVariantEditing(v);
  setVariantModalOpen(true);
};
```

## Query Patterns

### Lấy Product Images (variant_id = NULL):
```sql
SELECT array_agg(image_url ORDER BY display_order, id)
FROM product_media
WHERE product_id = ? AND variant_id IS NULL AND type = 'image'
```

### Lấy Variant Images:
```sql
SELECT array_agg(image_url ORDER BY display_order, id)
FROM product_media
WHERE variant_id = ? AND type = 'image'
```

### Lấy Tất Cả Images (Product + Variants):
```sql
SELECT 
  pm.variant_id,
  array_agg(pm.image_url ORDER BY pm.display_order, pm.id) as image_urls
FROM product_media pm
WHERE pm.product_id = ? AND pm.type = 'image'
GROUP BY pm.variant_id
```

## Response Format

### Variant với Images:
```json
{
  "id": 1,
  "product_id": 1,
  "variant_type": "Color",
  "variant_value": "Đỏ",
  "price_adjustment": 0,
  "stock_quantity": 10,
  "image_urls": ["url1.jpg", "url2.jpg"]  // NEW
}
```

### Product với Variants:
```json
{
  "id": 1,
  "name": "Áo thun",
  "image_urls": ["product1.jpg", "product2.jpg"],  // Product images
  "variants": [
    {
      "id": 1,
      "variant_type": "Color",
      "variant_value": "Đỏ",
      "image_urls": ["red1.jpg", "red2.jpg"]  // Variant images
    },
    {
      "id": 2,
      "variant_type": "Color",
      "variant_value": "Xanh",
      "image_urls": ["blue1.jpg", "blue2.jpg"]  // Variant images
    }
  ]
}
```

## Next Steps

1. ✅ Migration created
2. ✅ Backend controllers updated
3. ✅ Validation schema updated
4. ⏳ Frontend: Add variant image upload UI
5. ⏳ Frontend: Update variant form to handle images
6. ⏳ Frontend: Display variant images in product detail
7. ⏳ Test: Create variant with images
8. ⏳ Test: Update variant images
9. ⏳ Test: Display variant images correctly

