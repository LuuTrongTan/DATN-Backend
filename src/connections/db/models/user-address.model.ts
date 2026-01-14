// UserAddress Model - Based on database_schema.dbml

export interface UserAddress {
  id: number;
  user_id: string; // UUID
  province: string; // not null
  district: string; // not null
  ward: string; // not null
  province_code: number; // GHN ProvinceID - not null
  district_code: number; // GHN DistrictID - not null
  ward_code: string; // GHN WardCode - not null
  street_address: string; // text - not null
  is_default: boolean; // default: false
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null; // Soft delete - địa chỉ bị xóa
}

export interface CreateUserAddressInput {
  user_id: string; // UUID
  province: string; // REQUIRED
  district: string; // REQUIRED
  ward: string; // REQUIRED
  province_code: number; // REQUIRED - GHN ProvinceID
  district_code: number; // REQUIRED - GHN DistrictID
  ward_code: string; // REQUIRED - GHN WardCode
  street_address: string; // REQUIRED
  is_default?: boolean; // default: false
}

export interface UpdateUserAddressInput {
  province?: string;
  district?: string;
  ward?: string;
  province_code?: number;
  district_code?: number;
  ward_code?: string;
  street_address?: string;
  is_default?: boolean;
}


