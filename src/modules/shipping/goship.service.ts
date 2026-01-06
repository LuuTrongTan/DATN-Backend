import { logger } from '../../utils/logging';

// Goship API Configuration
interface GoshipConfig {
  apiKey: string;
  apiUrl: string;
  shopId?: string;
}

// Get Goship config from environment
const getGoshipConfig = (): GoshipConfig => {
  return {
    apiKey: process.env.GOSHIP_API_KEY || '',
    apiUrl: process.env.GOSHIP_API_URL || 'https://api.goship.io/v2',
    shopId: process.env.GOSHIP_SHOP_ID || '',
  };
};

// Goship API Types
export interface GoshipCalculateFeeRequest {
  from_province: string;
  from_district: string;
  from_ward?: string;
  to_province: string;
  to_district: string;
  to_ward?: string;
  weight: number; // in kg
  value: number; // order value in VND
  cod?: number; // COD amount (if COD)
  service_type?: string; // 'standard', 'express', 'economy'
}

export interface GoshipCalculateFeeResponse {
  fee: number;
  estimated_days: number;
  service_type: string;
  provider?: string;
}

export interface GoshipCreateOrderRequest {
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
  service_type?: string;
}

export interface GoshipCreateOrderResponse {
  success: boolean;
  tracking_number?: string;
  order_code?: string;
  fee?: number;
  estimated_delivery_date?: string;
  error?: string;
}

export interface GoshipTrackingResponse {
  status: string;
  tracking_number: string;
  current_location?: string;
  estimated_delivery_date?: string;
  history?: Array<{
    status: string;
    time: string;
    location?: string;
  }>;
}

/**
 * Calculate shipping fee using Goship API
 */
export const calculateGoshipFee = async (
  request: GoshipCalculateFeeRequest
): Promise<GoshipCalculateFeeResponse> => {
  const config = getGoshipConfig();

  if (!config.apiKey) {
    logger.warn('Goship API key not configured, using fallback calculation');
    return calculateFallbackFee(request);
  }

  try {
    const response = await fetch(`${config.apiUrl}/shipping/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        from_province: request.from_province,
        from_district: request.from_district,
        from_ward: request.from_ward,
        to_province: request.to_province,
        to_district: request.to_district,
        to_ward: request.to_ward,
        weight: request.weight,
        value: request.value,
        cod: request.cod || 0,
        service_type: request.service_type || 'standard',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Goship API error', {
        status: response.status,
        error: errorText,
      });
      return calculateFallbackFee(request);
    }

    const data = await response.json();

    return {
      fee: data.fee || 0,
      estimated_days: data.estimated_days || 3,
      service_type: data.service_type || 'standard',
      provider: data.provider || 'Goship',
    };
  } catch (error: any) {
    logger.error('Error calling Goship API', {
      error: error.message,
      stack: error.stack,
    });
    return calculateFallbackFee(request);
  }
};

/**
 * Create shipping order using Goship API
 */
export const createGoshipOrder = async (
  request: GoshipCreateOrderRequest
): Promise<GoshipCreateOrderResponse> => {
  const config = getGoshipConfig();

  if (!config.apiKey) {
    logger.warn('Goship API key not configured, cannot create order');
    return {
      success: false,
      error: 'Goship API key not configured',
    };
  }

  try {
    const response = await fetch(`${config.apiUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        shop_id: config.shopId,
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
        cod: request.cod || 0,
        note: request.note,
        service_type: request.service_type || 'standard',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Goship create order error', {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: errorText,
      };
    }

    const data = await response.json();

    return {
      success: true,
      tracking_number: data.tracking_number,
      order_code: data.order_code,
      fee: data.fee,
      estimated_delivery_date: data.estimated_delivery_date,
    };
  } catch (error: any) {
    logger.error('Error creating Goship order', {
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
 * Track shipping order using Goship API
 */
export const trackGoshipOrder = async (
  trackingNumber: string
): Promise<GoshipTrackingResponse | null> => {
  const config = getGoshipConfig();

  if (!config.apiKey) {
    logger.warn('Goship API key not configured, cannot track order');
    return null;
  }

  try {
    const response = await fetch(`${config.apiUrl}/orders/${trackingNumber}/track`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
    });

    if (!response.ok) {
      logger.error('Goship tracking error', {
        status: response.status,
        trackingNumber,
      });
      return null;
    }

    const data = await response.json();

    return {
      status: data.status,
      tracking_number: data.tracking_number,
      current_location: data.current_location,
      estimated_delivery_date: data.estimated_delivery_date,
      history: data.history,
    };
  } catch (error: any) {
    logger.error('Error tracking Goship order', {
      error: error.message,
      trackingNumber,
    });
    return null;
  }
};

/**
 * Fallback fee calculation when API is not available
 */
function calculateFallbackFee(request: GoshipCalculateFeeRequest): GoshipCalculateFeeResponse {
  const baseFee = 30000;
  const weightFee = request.weight * 5000;
  
  // Simple distance calculation
  const isSameProvince = request.from_province === request.to_province;
  const distanceMultiplier = isSameProvince ? 1.0 : 1.5;
  
  const fee = Math.round((baseFee + weightFee) * distanceMultiplier);
  const estimatedDays = isSameProvince ? 1 : 3;

  logger.info('Using fallback shipping fee calculation', {
    from: request.from_province,
    to: request.to_province,
    fee,
  });

  return {
    fee,
    estimated_days: estimatedDays,
    service_type: 'standard',
    provider: 'Goship (fallback)',
  };
}
