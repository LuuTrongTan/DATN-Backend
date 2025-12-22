// UserAddress Model - Based on database_schema.dbml

export interface UserAddress {
  id: number;
  user_id: string; // UUID
  full_name: string; // not null
  phone: string; // not null - Số điện thoại Việt Nam (10 số)
  province: string; // not null
  district: string; // not null
  ward: string; // not null
  street_address: string; // text - not null
  is_default: boolean; // default: false
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null; // Soft delete - địa chỉ bị xóa
}

export interface CreateUserAddressInput {
  user_id: string; // UUID
  full_name: string; // REQUIRED
  phone: string; // REQUIRED - 10 số
  province: string; // REQUIRED
  district: string; // REQUIRED
  ward: string; // REQUIRED
  street_address: string; // REQUIRED
  is_default?: boolean; // default: false
}

export interface UpdateUserAddressInput {
  full_name?: string;
  phone?: string;
  province?: string;
  district?: string;
  ward?: string;
  street_address?: string;
  is_default?: boolean;
}


