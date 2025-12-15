import { z } from 'zod';

export const createAddressSchema = z.object({
  full_name: z.string().min(1, 'Họ và tên không được để trống'),
  phone: z.string().regex(/^[0-9]{10,11}$/, 'Số điện thoại không hợp lệ'),
  province: z.string().min(1, 'Tỉnh/Thành phố không được để trống'),
  district: z.string().min(1, 'Quận/Huyện không được để trống'),
  ward: z.string().min(1, 'Phường/Xã không được để trống'),
  street_address: z.string().min(1, 'Địa chỉ cụ thể không được để trống'),
  is_default: z.boolean().optional().default(false),
});

export const updateAddressSchema = createAddressSchema.partial();


