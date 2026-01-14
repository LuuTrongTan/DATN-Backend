import { logger } from '../../utils/logging';
import { ShippingStatus } from '../../connections/db/models/shipping.model';
import { 
  calculateGHNFee, 
  createGHNOrder,
  trackGHNOrder,
  GHNCalculateFeeRequest,
  GHNCreateOrderRequest
} from './ghn.service';
import { getGHNProvinces, getGHNDistricts, getGHNWards } from '../provinces/ghn.service';

export interface ShippingFeeRequest {
  province: string | number; // Province name or ID (khuyến nghị: GHN ProvinceID)
  district: string | number; // District name or ID (khuyến nghị: GHN DistrictID)
  ward?: string; // Ward code or name (khuyến nghị: GHN WardCode)
  weight: number; // in kg (will be converted to gram for GHN)
  value: number; // order value in VND
  from_province?: string | number; // Shop location province name or ID
  from_district?: string | number; // Shop location district name or ID
  from_ward?: string; // Shop location ward code or name
}

export interface ShippingFeeResponse {
  fee: number;
  estimated_days: number;
  provider?: string;
  service_type?: string;
}

/**
 * Helper function to lookup province/district/ward IDs from names
 */
const lookupLocationIds = async (
  province: string | number,
  district: string | number,
  ward?: string
): Promise<{ provinceId: number; districtId: number; wardCode: string }> => {
  // Nếu đã truyền sẵn mã GHN (number cho province/district, ward là code) thì dùng luôn
  if (typeof province === 'number' && typeof district === 'number') {
    const wardCode = ward || '';
    return { provinceId: province, districtId: district, wardCode };
  }

  // Lookup province ID
  const provinces = await getGHNProvinces();
  const provinceObj = provinces.find(p => 
    p.ProvinceID === Number(province) || 
    p.ProvinceName === province ||
    p.Code === province
  );
  
  if (!provinceObj) {
    throw new Error(`Không tìm thấy tỉnh/thành phố: ${province}`);
  }

  const provinceId = provinceObj.ProvinceID;

  // Lookup district ID
  const districts = await getGHNDistricts(provinceId);
  const districtObj = districts.find(d => 
    d.DistrictID === Number(district) ||
    d.DistrictName === district ||
    d.Code === district
  );

  if (!districtObj) {
    throw new Error(`Không tìm thấy quận/huyện: ${district}`);
  }

  const districtId = districtObj.DistrictID;

  // Lookup ward code
  let wardCode = ward || '';
  if (ward && !ward.match(/^\d+$/)) {
    // If ward is a name, lookup the code
    const wards = await getGHNWards(districtId);
    const wardObj = wards.find(w => 
      w.WardCode === ward ||
      w.WardName === ward
    );
    if (wardObj) {
      wardCode = wardObj.WardCode;
    }
  }

  return { provinceId, districtId, wardCode };
};

/**
 * Calculate shipping fee using GHN API
 * Falls back to simple calculation if API is not configured
 */
export const calculateShippingFee = async (request: ShippingFeeRequest): Promise<ShippingFeeResponse> => {
  try {
  // Get shop location from environment or use default
  const shopProvince = request.from_province || process.env.SHOP_PROVINCE || 'Thành phố Hồ Chí Minh';
  const shopDistrict = request.from_district || process.env.SHOP_DISTRICT || 'Quận 1';
    const shopWard = request.from_ward || process.env.SHOP_WARD || '';

    // Lookup location IDs
    const fromLocation = await lookupLocationIds(shopProvince, shopDistrict, shopWard);
    const toLocation = await lookupLocationIds(request.province, request.district, request.ward);

    // Use GHN API
    const ghnRequest: GHNCalculateFeeRequest = {
      from_district_id: fromLocation.districtId,
      from_ward_code: fromLocation.wardCode,
      to_district_id: toLocation.districtId,
      to_ward_code: toLocation.wardCode,
      weight: request.weight * 1000, // Convert kg to gram
      value: request.value,
      service_type_id: 2, // Standard service
  };

    const result = await calculateGHNFee(ghnRequest);

  logger.info('Shipping fee calculated', { 
    province: request.province, 
    district: request.district,
    weight: request.weight, 
    fee: result.fee,
    provider: result.provider
  });

  return result;
  } catch (error: any) {
    logger.error('Error calculating shipping fee', {
      error: error.message,
      stack: error.stack,
    });
    // Return fallback fee
    return {
      fee: 30000,
      estimated_days: 3,
      provider: 'GHN (fallback)',
      service_type: 'standard',
    };
  }
};

/**
 * Create shipping order using GHN API
 */
export const createShippingOrder = async (
  request: {
    order_id: number;
    order_number: string;
    from_name: string;
    from_phone: string;
    from_address: string;
    from_province: string | number;
    from_district: string | number;
    from_ward?: string;
    to_name: string;
    to_phone: string;
    to_address: string;
    to_province: string | number;
    to_district: string | number;
    to_ward?: string;
    weight: number; // in kg
    value: number;
    cod?: number;
    note?: string;
  }
): Promise<{ success: boolean; tracking_number?: string; fee?: number; error?: string }> => {
  try {
    // Lookup location IDs
    const fromLocation = await lookupLocationIds(request.from_province, request.from_district, request.from_ward);
    const toLocation = await lookupLocationIds(request.to_province, request.to_district, request.to_ward);

    // Get province ID for to_province
    const provinces = await getGHNProvinces();
    const toProvinceObj = provinces.find(p => 
      p.ProvinceID === Number(request.to_province) || 
      p.ProvinceName === request.to_province ||
      p.Code === request.to_province
    );
    
    if (!toProvinceObj) {
      return {
        success: false,
        error: `Không tìm thấy tỉnh/thành phố đích: ${request.to_province}`,
      };
    }

    const ghnRequest: GHNCreateOrderRequest = {
    to_name: request.to_name,
    to_phone: request.to_phone,
    to_address: request.to_address,
      to_ward_code: toLocation.wardCode,
      to_district_id: toLocation.districtId,
      to_province_id: toProvinceObj.ProvinceID,
      client_order_code: request.order_number,
      cod_amount: request.cod || 0,
      content: request.note || `Đơn hàng #${request.order_number}`,
      weight: request.weight * 1000, // Convert kg to gram
      length: 20,
      width: 20,
      height: 20,
      service_type_id: 2, // Standard service
      payment_type_id: 2, // Buyer pay
    note: request.note,
      required_note: 'CHOTHUHANG', // Cho thu hàng
  };

    const result = await createGHNOrder(ghnRequest);

    if (result.success) {
      return {
        success: true,
        tracking_number: result.tracking_number,
        fee: result.fee,
      };
    }

    return result;
  } catch (error: any) {
    logger.error('Error creating shipping order', {
      error: error.message,
      stack: error.stack,
    });
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Track shipping order
 */
export const trackShippingOrder = async (
  trackingNumber: string
): Promise<{ status: string; tracking_number: string; current_location?: string; estimated_delivery_date?: string; history?: Array<{ status: string; time: string; location?: string }> } | null> => {
  return await trackGHNOrder(trackingNumber);
};

// Create shipping record
export interface CreateShippingRequest {
  order_id: number;
  shipping_provider?: string;
  tracking_number?: string;
  shipping_fee: number;
  estimated_delivery_date?: string;
}

// This will be used by shipping controller
export const createShippingRecord = async (
  pool: any,
  request: CreateShippingRequest
): Promise<number> => {
  const estimatedDate = request.estimated_delivery_date 
    ? new Date(request.estimated_delivery_date)
    : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // Default 3 days

  const result = await pool.query(
    `INSERT INTO shipping (order_id, shipping_provider, tracking_number, shipping_fee, estimated_delivery_date, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      request.order_id,
      request.shipping_provider || 'GHN',
      request.tracking_number || null,
      request.shipping_fee,
      estimatedDate,
      'pending' as ShippingStatus, // Default status
    ]
  );

  return result.rows[0].id;
};


