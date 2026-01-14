import { z } from 'zod';

export const createAddressSchema = z.object({
  province: z.string().min(1, 'Tỉnh/Thành phố không được để trống'),
  district: z.string().min(1, 'Quận/Huyện không được để trống'),
  ward: z.string().min(1, 'Phường/Xã không được để trống'),
  province_code: z.number().int().positive('Mã tỉnh/thành phố không hợp lệ'),
  district_code: z.number().int().positive('Mã quận/huyện không hợp lệ'),
  ward_code: z.string().min(1, 'Mã phường/xã không được để trống'),
  street_address: z.string().min(1, 'Địa chỉ cụ thể không được để trống'),
  is_default: z.boolean().optional().default(false),
});

export const updateAddressSchema = createAddressSchema.partial();


