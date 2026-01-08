import { logger } from '../../utils/logging';

// GHN API Configuration
interface GHNConfig {
  token: string;
  shopId: number;
  apiUrl: string;
}

// Get GHN config from environment
// CHỈ SỬ DỤNG STAGING/DEV ENVIRONMENT ĐỂ TEST
const getGHNConfig = (): GHNConfig => {
  const defaultApiUrl = 'https://dev-online-gateway.ghn.vn/shiip/public-api/v2'; // Staging/Dev only
  const apiUrl = process.env.GHN_API_URL || defaultApiUrl;
  
  // Đảm bảo không dùng production URL
  if (apiUrl.includes('online-gateway.ghn.vn') && !apiUrl.includes('dev-online-gateway')) {
    logger.warn('⚠️ Production GHN API URL detected! Using staging instead for safety.');
    return {
      token: process.env.GHN_API_TOKEN || '',
      shopId: parseInt(process.env.GHN_SHOP_ID || '0', 10),
      apiUrl: defaultApiUrl, // Force staging
    };
  }
  
  return {
    token: process.env.GHN_API_TOKEN || '',
    shopId: parseInt(process.env.GHN_SHOP_ID || '0', 10),
    apiUrl: apiUrl,
  };
};

// GHN API Response Type
export interface GHNResponse<T> {
  code: number;
  message: string;
  data: T;
}

// GHN API Types
export interface GHNCalculateFeeRequest {
  from_district_id: number;
  from_ward_code: string;
  to_district_id: number;
  to_ward_code: string;
  weight: number; // in gram
  value: number; // order value in VND
  service_type_id?: number; // Service type ID (default: 2 - Standard)
  service_id?: number; // Service ID
  insurance_value?: number; // Insurance value
  cod_amount?: number; // COD amount
}

export interface GHNCalculateFeeResponse {
  total: number; // Total fee in VND
  service_fee: number; // Service fee
  insurance_fee: number; // Insurance fee
  pick_station_fee: number; // Pick station fee
  coupon_value: number; // Coupon value
  r2s_fee: number; // R2S fee
  return_again_fee: number; // Return again fee
  document_return: number; // Document return fee
  double_check: number; // Double check fee
  cod_fee: number; // COD fee
  pick_remote_areas_fee: number; // Pick remote areas fee
  deliver_remote_areas_fee: number; // Deliver remote areas fee
  pick_remote_areas_fee_total: number; // Total pick remote areas fee
  deliver_remote_areas_fee_total: number; // Total deliver remote areas fee
  cod_failed_fee: number; // COD failed fee
}

export interface GHNCreateOrderRequest {
  to_name: string;
  to_phone: string;
  to_address: string;
  to_ward_code: string;
  to_district_id: number;
  to_province_id: number;
  return_name?: string;
  return_phone?: string;
  return_address?: string;
  return_ward_code?: string;
  return_district_id?: number;
  return_province_id?: number;
  client_order_code: string; // Order number
  cod_amount: number; // COD amount (0 if not COD)
  content: string; // Order content/note
  weight: number; // Weight in gram
  length?: number; // Length in cm
  width?: number; // Width in cm
  height?: number; // Height in cm
  pick_station_id?: number;
  deliver_station_id?: number;
  insurance_value?: number;
  service_type_id?: number; // Default: 2 (Standard)
  service_id?: number;
  payment_type_id?: number; // 1: Shop pay, 2: Buyer pay
  note?: string;
  required_note?: string; // "CHOTHUHANG", "CHOXEMHANGKHONGTHU", "KHONGCHOXEMHANG"
  items?: Array<{
    name: string;
    code: string;
    quantity: number;
    price: number;
    length?: number;
    width?: number;
    height?: number;
    weight?: number;
  }>;
}

export interface GHNCreateOrderResponse {
  code: number;
  message: string;
  data: {
    order_code: string; // GHN order code
    sort_code: string;
    trans_type: string;
    ward_encode: string;
    district_encode: string;
    total_fee: number;
    expected_delivery_time: string;
  };
}

export interface GHNTrackingResponse {
  code: number;
  message: string;
  data: {
    order_code: string;
    status: string;
    created_date: string;
    updated_date: string;
    current_status: string;
    order_date: string;
    money_collection: number;
    total_fee: number;
    expected_delivery_time: string;
    weight: number;
    length: number;
    width: number;
    height: number;
    pick_station_name: string;
    deliver_station_name: string;
    from_name: string;
    from_phone: string;
    from_address: string;
    from_ward_name: string;
    from_district_name: string;
    from_province_name: string;
    to_name: string;
    to_phone: string;
    to_address: string;
    to_ward_name: string;
    to_district_name: string;
    to_province_name: string;
    timeline: Array<{
      status: string;
      status_code: string;
      status_date: string;
      location: string;
      note: string;
    }>;
  };
}

/**
 * Calculate shipping fee using GHN API
 */
export const calculateGHNFee = async (
  request: GHNCalculateFeeRequest
): Promise<{ fee: number; estimated_days: number; service_type: string; provider: string }> => {
  const config = getGHNConfig();

  if (!config.token || !config.shopId) {
    logger.warn('GHN API token or shop ID not configured, using fallback calculation');
    return calculateFallbackFee(request);
  }

  try {
    const response = await fetch(`${config.apiUrl}/shipping-order/fee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
        'ShopId': String(config.shopId),
      },
      body: JSON.stringify({
        from_district_id: request.from_district_id,
        from_ward_code: request.from_ward_code,
        to_district_id: request.to_district_id,
        to_ward_code: request.to_ward_code,
        weight: request.weight,
        value: request.value,
        service_type_id: request.service_type_id || 2, // Standard service
        service_id: request.service_id,
        insurance_value: request.insurance_value || request.value,
        cod_amount: request.cod_amount || 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('GHN API error - Calculate Fee', {
        status: response.status,
        error: errorText,
      });
      return calculateFallbackFee(request);
    }

    const result = await response.json() as { code: number; message: string; data: GHNCalculateFeeResponse };

    if (result.code !== 200) {
      logger.error('GHN API error - Calculate Fee', {
        code: result.code,
        message: result.message,
      });
      return calculateFallbackFee(request);
    }

    // Calculate estimated days (GHN doesn't provide this directly, estimate based on distance)
    const isSameDistrict = request.from_district_id === request.to_district_id;
    const estimatedDays = isSameDistrict ? 1 : 3;

    return {
      fee: result.data.total,
      estimated_days: estimatedDays,
      service_type: 'standard',
      provider: 'GHN',
    };
  } catch (error: any) {
    logger.error('Error calling GHN API - Calculate Fee', {
      error: error.message,
      stack: error.stack,
    });
    return calculateFallbackFee(request);
  }
};

/**
 * Create shipping order using GHN API
 */
export const createGHNOrder = async (
  request: GHNCreateOrderRequest
): Promise<{ success: boolean; tracking_number?: string; order_code?: string; fee?: number; estimated_delivery_date?: string; error?: string }> => {
  const config = getGHNConfig();

  if (!config.token || !config.shopId) {
    logger.warn('GHN API token or shop ID not configured, cannot create order');
    return {
      success: false,
      error: 'GHN API token or shop ID not configured',
    };
  }

  try {
    const response = await fetch(`${config.apiUrl}/shipping-order/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
        'ShopId': String(config.shopId),
      },
      body: JSON.stringify({
        to_name: request.to_name,
        to_phone: request.to_phone,
        to_address: request.to_address,
        to_ward_code: request.to_ward_code,
        to_district_id: request.to_district_id,
        to_province_id: request.to_province_id,
        return_name: request.return_name,
        return_phone: request.return_phone,
        return_address: request.return_address,
        return_ward_code: request.return_ward_code,
        return_district_id: request.return_district_id,
        return_province_id: request.return_province_id,
        client_order_code: request.client_order_code,
        cod_amount: request.cod_amount || 0,
        content: request.content,
        weight: request.weight,
        length: request.length || 20,
        width: request.width || 20,
        height: request.height || 20,
        pick_station_id: request.pick_station_id,
        deliver_station_id: request.deliver_station_id,
        insurance_value: request.insurance_value || request.cod_amount || 0,
        service_type_id: request.service_type_id || 2,
        service_id: request.service_id,
        payment_type_id: request.payment_type_id || 2, // Buyer pay
        note: request.note,
        required_note: request.required_note || 'CHOTHUHANG',
        items: request.items,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('GHN create order error', {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: errorText,
      };
    }

    const result = await response.json() as GHNCreateOrderResponse;

    if (result.code !== 200) {
      logger.error('GHN create order error', {
        code: result.code,
        message: result.message,
      });
      return {
        success: false,
        error: result.message,
      };
    }

    return {
      success: true,
      tracking_number: result.data.order_code,
      order_code: result.data.order_code,
      fee: result.data.total_fee,
      estimated_delivery_date: result.data.expected_delivery_time,
    };
  } catch (error: any) {
    logger.error('Error creating GHN order', {
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
 * Track shipping order using GHN API
 */
export const trackGHNOrder = async (
  orderCode: string
): Promise<{ status: string; tracking_number: string; current_location?: string; estimated_delivery_date?: string; history?: Array<{ status: string; time: string; location?: string }> } | null> => {
  const config = getGHNConfig();

  if (!config.token || !config.shopId) {
    logger.warn('GHN API token or shop ID not configured, cannot track order');
    return null;
  }

  try {
    const response = await fetch(`${config.apiUrl}/shipping-order/detail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
        'ShopId': String(config.shopId),
      },
      body: JSON.stringify({
        order_code: orderCode,
      }),
    });

    if (!response.ok) {
      logger.error('GHN tracking error', {
        status: response.status,
        orderCode,
      });
      return null;
    }

    const result = await response.json() as GHNTrackingResponse;

    if (result.code !== 200) {
      logger.error('GHN tracking error', {
        code: result.code,
        message: result.message,
        orderCode,
      });
      return null;
    }

    return {
      status: result.data.current_status,
      tracking_number: result.data.order_code,
      current_location: result.data.to_address,
      estimated_delivery_date: result.data.expected_delivery_time,
      history: result.data.timeline?.map(t => ({
        status: t.status,
        time: t.status_date,
        location: t.location,
      })),
    };
  } catch (error: any) {
    logger.error('Error tracking GHN order', {
      error: error.message,
      orderCode,
    });
    return null;
  }
};

// GHN Service Types
export interface GHNService {
  service_id: number;
  short_name: string;
  service_type_id: number;
}

export interface GHNGetServicesRequest {
  shop_id: number;
  from_district: number;
  to_district: number;
}

// GHN Station Types
export interface GHNStation {
  station_id: number;
  station_name: string;
  district_id: number;
  ward_code: string;
  address: string;
  lat: number;
  lng: number;
}

export interface GHNGetStationsRequest {
  district_id: number;
}

// GHN Leadtime Types
export interface GHNLeadtimeRequest {
  from_district_id: number;
  from_ward_code: string;
  to_district_id: number;
  to_ward_code: string;
  service_id?: number;
  service_type_id?: number;
}

export interface GHNLeadtimeResponse {
  leadtime: number; // Days
  order_date: string;
}

// GHN Cancel Order Types
export interface GHNCancelOrderRequest {
  order_codes: string[]; // Array of order codes to cancel
}

export interface GHNCancelOrderResponse {
  order_code: string;
  result: boolean;
  message: string;
}

// GHN Update COD Types
export interface GHNUpdateCODRequest {
  order_code: string;
  cod_amount: number;
}

// GHN Update Order Types
export interface GHNUpdateOrderRequest {
  order_code: string;
  to_name?: string;
  to_phone?: string;
  to_address?: string;
  to_ward_code?: string;
  to_district_id?: number;
  to_province_id?: number;
  note?: string;
  required_note?: string;
}

/**
 * Get available services (Nhanh, Chuẩn, Tiết kiệm)
 */
export const getGHNServices = async (
  request: GHNGetServicesRequest
): Promise<GHNService[]> => {
  const config = getGHNConfig();

  if (!config.token) {
    logger.warn('GHN API token not configured');
    throw new Error('GHN API token not configured');
  }

  try {
    const response = await fetch(`${config.apiUrl}/shipping-order/available-services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
      },
      body: JSON.stringify({
        shop_id: request.shop_id,
        from_district: request.from_district,
        to_district: request.to_district,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('GHN API error - Get Services', {
        status: response.status,
        error: errorText,
      });
      throw new Error(`GHN API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as GHNResponse<GHNService[]>;

    if (result.code !== 200) {
      logger.error('GHN API error - Get Services', {
        code: result.code,
        message: result.message,
      });
      throw new Error(`GHN API error: ${result.message}`);
    }

    return result.data || [];
  } catch (error: any) {
    logger.error('Error calling GHN API - Get Services', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Calculate expected delivery time
 */
export const calculateGHNLeadtime = async (
  request: GHNLeadtimeRequest
): Promise<GHNLeadtimeResponse> => {
  const config = getGHNConfig();

  if (!config.token || !config.shopId) {
    logger.warn('GHN API token or shop ID not configured');
    throw new Error('GHN API token or shop ID not configured');
  }

  try {
    const response = await fetch(`${config.apiUrl}/shipping-order/leadtime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
        'ShopId': String(config.shopId),
      },
      body: JSON.stringify({
        from_district_id: request.from_district_id,
        from_ward_code: request.from_ward_code,
        to_district_id: request.to_district_id,
        to_ward_code: request.to_ward_code,
        service_id: request.service_id,
        service_type_id: request.service_type_id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('GHN API error - Calculate Leadtime', {
        status: response.status,
        error: errorText,
      });
      throw new Error(`GHN API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as GHNResponse<GHNLeadtimeResponse>;

    if (result.code !== 200) {
      logger.error('GHN API error - Calculate Leadtime', {
        code: result.code,
        message: result.message,
      });
      throw new Error(`GHN API error: ${result.message}`);
    }

    return result.data;
  } catch (error: any) {
    logger.error('Error calling GHN API - Calculate Leadtime', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Get stations (bưu cục)
 */
export const getGHNStations = async (
  request: GHNGetStationsRequest
): Promise<GHNStation[]> => {
  const config = getGHNConfig();

  if (!config.token) {
    logger.warn('GHN API token not configured');
    throw new Error('GHN API token not configured');
  }

  try {
    const response = await fetch(`${config.apiUrl}/shipping-order/station`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('GHN API error - Get Stations', {
        status: response.status,
        error: errorText,
      });
      throw new Error(`GHN API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as GHNResponse<GHNStation[]>;

    if (result.code !== 200) {
      logger.error('GHN API error - Get Stations', {
        code: result.code,
        message: result.message,
      });
      throw new Error(`GHN API error: ${result.message}`);
    }

    // Filter by district_id if provided
    let stations = result.data || [];
    if (request.district_id) {
      stations = stations.filter((s: GHNStation) => s.district_id === request.district_id);
    }

    return stations;
  } catch (error: any) {
    logger.error('Error calling GHN API - Get Stations', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Cancel order
 */
export const cancelGHNOrder = async (
  request: GHNCancelOrderRequest
): Promise<GHNCancelOrderResponse[]> => {
  const config = getGHNConfig();

  if (!config.token || !config.shopId) {
    logger.warn('GHN API token or shop ID not configured');
    throw new Error('GHN API token or shop ID not configured');
  }

  try {
    const response = await fetch(`${config.apiUrl}/shipping-order/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
        'ShopId': String(config.shopId),
      },
      body: JSON.stringify({
        order_codes: request.order_codes,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('GHN API error - Cancel Order', {
        status: response.status,
        error: errorText,
      });
      throw new Error(`GHN API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as GHNResponse<GHNCancelOrderResponse[]>;

    if (result.code !== 200) {
      logger.error('GHN API error - Cancel Order', {
        code: result.code,
        message: result.message,
      });
      throw new Error(`GHN API error: ${result.message}`);
    }

    return result.data || [];
  } catch (error: any) {
    logger.error('Error calling GHN API - Cancel Order', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Update COD amount
 */
export const updateGHNCOD = async (
  request: GHNUpdateCODRequest
): Promise<{ success: boolean; message: string }> => {
  const config = getGHNConfig();

  if (!config.token || !config.shopId) {
    logger.warn('GHN API token or shop ID not configured');
    return {
      success: false,
      message: 'GHN API token or shop ID not configured',
    };
  }

  try {
    const response = await fetch(`${config.apiUrl}/shipping-order/update-cod`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
        'ShopId': String(config.shopId),
      },
      body: JSON.stringify({
        order_code: request.order_code,
        cod_amount: request.cod_amount,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('GHN API error - Update COD', {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        message: errorText,
      };
    }

    const result = await response.json() as GHNResponse<any>;

    if (result.code !== 200) {
      logger.error('GHN API error - Update COD', {
        code: result.code,
        message: result.message,
      });
      return {
        success: false,
        message: result.message,
      };
    }

    return {
      success: true,
      message: 'Cập nhật COD thành công',
    };
  } catch (error: any) {
    logger.error('Error calling GHN API - Update COD', {
      error: error.message,
      stack: error.stack,
    });
    return {
      success: false,
      message: error.message,
    };
  }
};

/**
 * Update order information
 */
export const updateGHNOrder = async (
  request: GHNUpdateOrderRequest
): Promise<{ success: boolean; message: string }> => {
  const config = getGHNConfig();

  if (!config.token || !config.shopId) {
    logger.warn('GHN API token or shop ID not configured');
    return {
      success: false,
      message: 'GHN API token or shop ID not configured',
    };
  }

  try {
    const body: any = {
      order_code: request.order_code,
    };

    if (request.to_name) body.to_name = request.to_name;
    if (request.to_phone) body.to_phone = request.to_phone;
    if (request.to_address) body.to_address = request.to_address;
    if (request.to_ward_code) body.to_ward_code = request.to_ward_code;
    if (request.to_district_id) body.to_district_id = request.to_district_id;
    if (request.to_province_id) body.to_province_id = request.to_province_id;
    if (request.note) body.note = request.note;
    if (request.required_note) body.required_note = request.required_note;

    const response = await fetch(`${config.apiUrl}/shipping-order/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
        'ShopId': String(config.shopId),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('GHN API error - Update Order', {
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        message: errorText,
      };
    }

    const result = await response.json() as GHNResponse<any>;

    if (result.code !== 200) {
      logger.error('GHN API error - Update Order', {
        code: result.code,
        message: result.message,
      });
      return {
        success: false,
        message: result.message,
      };
    }

    return {
      success: true,
      message: 'Cập nhật đơn hàng thành công',
    };
  } catch (error: any) {
    logger.error('Error calling GHN API - Update Order', {
      error: error.message,
      stack: error.stack,
    });
    return {
      success: false,
      message: error.message,
    };
  }
};

/**
 * Fallback fee calculation when API is not available
 */
function calculateFallbackFee(request: GHNCalculateFeeRequest): { fee: number; estimated_days: number; service_type: string; provider: string } {
  const baseFee = 30000;
  const weightFee = (request.weight / 1000) * 5000; // Convert gram to kg
  
  // Simple distance calculation
  const isSameDistrict = request.from_district_id === request.to_district_id;
  const distanceMultiplier = isSameDistrict ? 1.0 : 1.5;
  
  const fee = Math.round((baseFee + weightFee) * distanceMultiplier);
  const estimatedDays = isSameDistrict ? 1 : 3;

  logger.info('Using fallback shipping fee calculation', {
    from_district: request.from_district_id,
    to_district: request.to_district_id,
    fee,
  });

  return {
    fee,
    estimated_days: estimatedDays,
    service_type: 'standard',
    provider: 'GHN (fallback)',
  };
}
