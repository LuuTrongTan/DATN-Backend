export interface UserAddress {
  id: number;
  user_id: number;
  full_name: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  street_address: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserAddressInput {
  full_name: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  street_address: string;
  is_default?: boolean;
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


