import { logger } from '../../utils/logging';
import { ShippingStatus } from '../../connections/db/models/shipping.model';
import { 
  calculateGoshipFee, 
  createGoshipOrder,
  trackGoshipOrder,
  GoshipCalculateFeeRequest,
  GoshipCreateOrderRequest,
  GoshipTrackingResponse
} from './goship.service';

export interface ShippingFeeRequest {
  province: string;
  district: string;
  ward?: string;
  weight: number; // in kg
  value: number; // order value in VND
  from_province?: string; // Shop location province
  from_district?: string; // Shop location district
  from_ward?: string; // Shop location ward
}

export interface ShippingFeeResponse {
  fee: number;
  estimated_days: number;
  provider?: string;
  service_type?: string;
}

/**
 * Calculate shipping fee using Goship API
 * Falls back to simple calculation if API is not configured
 */
export const calculateShippingFee = async (request: ShippingFeeRequest): Promise<ShippingFeeResponse> => {
  // Get shop location from environment or use default
  const shopProvince = request.from_province || process.env.SHOP_PROVINCE || 'Thành phố Hồ Chí Minh';
  const shopDistrict = request.from_district || process.env.SHOP_DISTRICT || 'Quận 1';
  const shopWard = request.from_ward || process.env.SHOP_WARD;

  // Use Goship API
  const goshipRequest: GoshipCalculateFeeRequest = {
    from_province: shopProvince,
    from_district: shopDistrict,
    from_ward: shopWard,
    to_province: request.province,
    to_district: request.district,
    to_ward: request.ward,
    weight: request.weight,
    value: request.value,
    service_type: 'standard',
  };

  const result = await calculateGoshipFee(goshipRequest);

  logger.info('Shipping fee calculated', { 
    province: request.province, 
    district: request.district,
    weight: request.weight, 
    fee: result.fee,
    provider: result.provider
  });

  return result;
};

/**
 * Create shipping order using Goship API
 */
export const createShippingOrder = async (
  request: {
    order_id: number;
    order_number: string;
    from_name: string;
    from_phone: string;
    from_address: string;
    from_province: string;
    from_district: string;
    from_ward?: string;
    to_name: string;
    to_phone: string;
    to_address: string;
    to_province: string;
    to_district: string;
    to_ward?: string;
    weight: number;
    value: number;
    cod?: number;
    note?: string;
  }
): Promise<{ success: boolean; tracking_number?: string; fee?: number; error?: string }> => {
  const goshipRequest: GoshipCreateOrderRequest = {
    order_id: request.order_id,
    order_number: request.order_number,
    from_name: request.from_name,
    from_phone: request.from_phone,
    from_address: request.from_address,
    from_province: request.from_province,
    from_district: request.from_district,
    from_ward: request.from_ward,
    to_name: request.to_name,
    to_phone: request.to_phone,
    to_address: request.to_address,
    to_province: request.to_province,
    to_district: request.to_district,
    to_ward: request.to_ward,
    weight: request.weight,
    value: request.value,
    cod: request.cod,
    note: request.note,
  };

  return await createGoshipOrder(goshipRequest);
};

/**
 * Track shipping order
 */
export const trackShippingOrder = async (
  trackingNumber: string
): Promise<GoshipTrackingResponse | null> => {
  return await trackGoshipOrder(trackingNumber);
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
      request.shipping_provider || 'Goship',
      request.tracking_number || null,
      request.shipping_fee,
      estimatedDate,
      'pending' as ShippingStatus, // Default status
    ]
  );

  return result.rows[0].id;
};


