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

// GHN API Types
export interface GHNProvince {
  ProvinceID: number;
  ProvinceName: string;
  Code: string;
}

export interface GHNDistrict {
  DistrictID: number;
  DistrictName: string;
  Code: string;
  ProvinceID: number;
}

export interface GHNWard {
  WardCode: string;
  WardName: string;
  DistrictID: number;
}

export interface GHNResponse<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * Get all provinces from GHN API
 */
export const getGHNProvinces = async (): Promise<GHNProvince[]> => {
  const config = getGHNConfig();

  if (!config.token) {
    logger.warn('GHN API token not configured');
    throw new Error('GHN API token not configured');
  }

  try {
    // Provinces API không dùng /v2, dùng base URL trực tiếp
    const baseUrl = config.apiUrl.replace('/v2', ''); // Remove /v2 for master-data endpoints
    const response = await fetch(`${baseUrl}/master-data/province`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('GHN API error - Get Provinces', {
        status: response.status,
        error: errorText,
      });
      throw new Error(`GHN API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as GHNResponse<GHNProvince[]>;

    if (result.code !== 200) {
      logger.error('GHN API error - Get Provinces', {
        code: result.code,
        message: result.message,
      });
      throw new Error(`GHN API error: ${result.message}`);
    }

    return result.data || [];
  } catch (error: any) {
    logger.error('Error calling GHN API - Get Provinces', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Get districts by province ID from GHN API
 */
export const getGHNDistricts = async (provinceId: number): Promise<GHNDistrict[]> => {
  const config = getGHNConfig();

  if (!config.token) {
    logger.warn('GHN API token not configured');
    throw new Error('GHN API token not configured');
  }

  try {
    // Districts API không dùng /v2, dùng base URL trực tiếp
    const baseUrl = config.apiUrl.replace('/v2', ''); // Remove /v2 for master-data endpoints
    const response = await fetch(`${baseUrl}/master-data/district`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
      },
      body: JSON.stringify({
        province_id: provinceId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('GHN API error - Get Districts', {
        status: response.status,
        provinceId,
        error: errorText,
      });
      throw new Error(`GHN API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as GHNResponse<GHNDistrict[]>;

    if (result.code !== 200) {
      logger.error('GHN API error - Get Districts', {
        code: result.code,
        message: result.message,
        provinceId,
      });
      throw new Error(`GHN API error: ${result.message}`);
    }

    return result.data || [];
  } catch (error: any) {
    logger.error('Error calling GHN API - Get Districts', {
      error: error.message,
      provinceId,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Get wards by district ID from GHN API
 */
export const getGHNWards = async (districtId: number): Promise<GHNWard[]> => {
  const config = getGHNConfig();

  if (!config.token) {
    logger.warn('GHN API token not configured');
    throw new Error('GHN API token not configured');
  }

  try {
    // Wards API không dùng /v2, dùng base URL trực tiếp
    const baseUrl = config.apiUrl.replace('/v2', ''); // Remove /v2 for master-data endpoints
    const response = await fetch(`${baseUrl}/master-data/ward`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
      },
      body: JSON.stringify({
        district_id: districtId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('GHN API error - Get Wards', {
        status: response.status,
        districtId,
        error: errorText,
      });
      throw new Error(`GHN API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as GHNResponse<GHNWard[]>;

    if (result.code !== 200) {
      logger.error('GHN API error - Get Wards', {
        code: result.code,
        message: result.message,
        districtId,
      });
      throw new Error(`GHN API error: ${result.message}`);
    }

    return result.data || [];
  } catch (error: any) {
    logger.error('Error calling GHN API - Get Wards', {
      error: error.message,
      districtId,
      stack: error.stack,
    });
    throw error;
  }
};
