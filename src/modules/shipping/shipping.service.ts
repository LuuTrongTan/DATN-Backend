import { logger } from '../../utils/logging';

// Simplified shipping fee calculation
// In production, this should integrate with shipping providers like GHTK, Vietnam Post, etc.

export interface ShippingFeeRequest {
  province: string;
  district: string;
  weight: number; // in kg
  value: number; // order value in VND
}

export interface ShippingFeeResponse {
  fee: number;
  estimated_days: number;
  provider?: string;
}

// Calculate shipping fee based on province and weight
export const calculateShippingFee = (request: ShippingFeeRequest): ShippingFeeResponse => {
  // Simplified calculation
  // In production, integrate with GHTK API or Vietnam Post API
  
  const baseFee = 30000; // Base fee 30k
  const weightFee = request.weight * 5000; // 5k per kg
  const distanceMultiplier = getDistanceMultiplier(request.province);
  
  const fee = Math.round((baseFee + weightFee) * distanceMultiplier);
  
  // Estimate delivery days
  const estimatedDays = getEstimatedDays(request.province);

  logger.info('Shipping fee calculated', { 
    province: request.province, 
    weight: request.weight, 
    fee 
  });

  return {
    fee,
    estimated_days: estimatedDays,
    provider: 'GHTK', // Default provider
  };
};

// Get distance multiplier based on province
function getDistanceMultiplier(province: string): number {
  const provinceLower = province.toLowerCase();
  
  // HCM, Hanoi - same city
  if (provinceLower.includes('hồ chí minh') || provinceLower.includes('hà nội')) {
    return 1.0;
  }
  
  // Nearby provinces
  if (provinceLower.includes('đồng nai') || 
      provinceLower.includes('bình dương') ||
      provinceLower.includes('long an')) {
    return 1.2;
  }
  
  // Other provinces
  return 1.5;
}

// Get estimated delivery days
function getEstimatedDays(province: string): number {
  const provinceLower = province.toLowerCase();
  
  if (provinceLower.includes('hồ chí minh') || provinceLower.includes('hà nội')) {
    return 1;
  }
  
  if (provinceLower.includes('đồng nai') || 
      provinceLower.includes('bình dương') ||
      provinceLower.includes('long an')) {
    return 2;
  }
  
  return 3;
}

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
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING id`,
    [
      request.order_id,
      request.shipping_provider || 'GHTK',
      request.tracking_number || null,
      request.shipping_fee,
      estimatedDate,
    ]
  );

  return result.rows[0].id;
};

