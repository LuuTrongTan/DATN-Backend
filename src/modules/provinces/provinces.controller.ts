import { Response, Request } from 'express';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

const PROVINCES_API_BASE_URL = 'https://provinces.open-api.vn/api';

// Cache để tránh gọi API quá nhiều
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch data from provinces API with caching
 */
const fetchWithCache = async (url: string, cacheKey: string): Promise<any> => {
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    logger.info('[Provinces] Using cached data', { cacheKey });
    return cached.data;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();

    // Cache the data
    cache.set(cacheKey, { data, timestamp: Date.now() });
    logger.info('[Provinces] Fetched and cached data', { cacheKey });

    return data;
  } catch (error: any) {
    logger.error('[Provinces] Error fetching data', {
      url,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Get all provinces (tỉnh/thành phố)
 * GET /api/provinces
 */
export const getProvinces = async (req: Request, res: Response) => {
  try {
    const { depth = '1' } = req.query;
    const depthNum = parseInt(depth as string, 10);
    
    if (isNaN(depthNum) || depthNum < 1 || depthNum > 3) {
      return ResponseHandler.badRequest(res, 'Depth phải là số từ 1 đến 3');
    }

    const url = `${PROVINCES_API_BASE_URL}/?depth=${depthNum}`;
    const cacheKey = `provinces_depth_${depthNum}`;
    
    const data = await fetchWithCache(url, cacheKey);
    
    return ResponseHandler.success(res, data, 'Lấy danh sách tỉnh/thành phố thành công');
  } catch (error: any) {
    logger.error('[Provinces] Error getting provinces', {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách tỉnh/thành phố', error);
  }
};

/**
 * Get province by code
 * GET /api/provinces/:code
 */
export const getProvinceByCode = async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const { depth = '2' } = req.query;
    const depthNum = parseInt(depth as string, 10);
    
    if (isNaN(depthNum) || depthNum < 1 || depthNum > 3) {
      return ResponseHandler.badRequest(res, 'Depth phải là số từ 1 đến 3');
    }

    const provinceCode = parseInt(code, 10);
    if (isNaN(provinceCode)) {
      return ResponseHandler.badRequest(res, 'Mã tỉnh/thành phố không hợp lệ');
    }

    const url = `${PROVINCES_API_BASE_URL}/p/${provinceCode}?depth=${depthNum}`;
    const cacheKey = `province_${provinceCode}_depth_${depthNum}`;
    
    const data = await fetchWithCache(url, cacheKey);
    
    return ResponseHandler.success(res, data, 'Lấy thông tin tỉnh/thành phố thành công');
  } catch (error: any) {
    logger.error('[Provinces] Error getting province by code', {
      error: error.message,
      stack: error.stack,
      code: req.params.code,
      query: req.query,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin tỉnh/thành phố', error);
  }
};

/**
 * Get districts by province code
 * GET /api/provinces/:provinceCode/districts
 */
export const getDistricts = async (req: Request, res: Response) => {
  try {
    const { provinceCode } = req.params;
    const { depth = '1' } = req.query;
    const depthNum = parseInt(depth as string, 10);
    
    if (isNaN(depthNum) || depthNum < 1 || depthNum > 2) {
      return ResponseHandler.badRequest(res, 'Depth phải là số từ 1 đến 2');
    }

    const code = parseInt(provinceCode, 10);
    if (isNaN(code)) {
      return ResponseHandler.badRequest(res, 'Mã tỉnh/thành phố không hợp lệ');
    }

    const url = `${PROVINCES_API_BASE_URL}/p/${code}?depth=${depthNum + 1}`;
    const cacheKey = `districts_${code}_depth_${depthNum}`;
    
    const data = await fetchWithCache(url, cacheKey);
    
    // Extract districts from province data
    const districts = data.districts || [];
    
    return ResponseHandler.success(res, districts, 'Lấy danh sách quận/huyện thành công');
  } catch (error: any) {
    logger.error('[Provinces] Error getting districts', {
      error: error.message,
      stack: error.stack,
      provinceCode: req.params.provinceCode,
      query: req.query,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách quận/huyện', error);
  }
};

/**
 * Get district by code
 * GET /api/provinces/districts/:code
 */
export const getDistrictByCode = async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const { depth = '1' } = req.query;
    const depthNum = parseInt(depth as string, 10);
    
    if (isNaN(depthNum) || depthNum < 1 || depthNum > 2) {
      return ResponseHandler.badRequest(res, 'Depth phải là số từ 1 đến 2');
    }

    const districtCode = parseInt(code, 10);
    if (isNaN(districtCode)) {
      return ResponseHandler.badRequest(res, 'Mã quận/huyện không hợp lệ');
    }

    const url = `${PROVINCES_API_BASE_URL}/d/${districtCode}?depth=${depthNum}`;
    const cacheKey = `district_${districtCode}_depth_${depthNum}`;
    
    const data = await fetchWithCache(url, cacheKey);
    
    return ResponseHandler.success(res, data, 'Lấy thông tin quận/huyện thành công');
  } catch (error: any) {
    logger.error('[Provinces] Error getting district by code', {
      error: error.message,
      stack: error.stack,
      code: req.params.code,
      query: req.query,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin quận/huyện', error);
  }
};

/**
 * Get wards by district code
 * GET /api/provinces/districts/:districtCode/wards
 */
export const getWards = async (req: Request, res: Response) => {
  try {
    const { districtCode } = req.params;
    
    const code = parseInt(districtCode, 10);
    if (isNaN(code)) {
      return ResponseHandler.badRequest(res, 'Mã quận/huyện không hợp lệ');
    }

    const url = `${PROVINCES_API_BASE_URL}/d/${code}?depth=2`;
    const cacheKey = `wards_${code}`;
    
    const data = await fetchWithCache(url, cacheKey);
    
    // Extract wards from district data
    const wards = data.wards || [];
    
    return ResponseHandler.success(res, wards, 'Lấy danh sách phường/xã thành công');
  } catch (error: any) {
    logger.error('[Provinces] Error getting wards', {
      error: error.message,
      stack: error.stack,
      districtCode: req.params.districtCode,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách phường/xã', error);
  }
};

/**
 * Get ward by code
 * GET /api/provinces/wards/:code
 */
export const getWardByCode = async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    
    const wardCode = parseInt(code, 10);
    if (isNaN(wardCode)) {
      return ResponseHandler.badRequest(res, 'Mã phường/xã không hợp lệ');
    }

    const url = `${PROVINCES_API_BASE_URL}/w/${wardCode}`;
    const cacheKey = `ward_${wardCode}`;
    
    const data = await fetchWithCache(url, cacheKey);
    
    return ResponseHandler.success(res, data, 'Lấy thông tin phường/xã thành công');
  } catch (error: any) {
    logger.error('[Provinces] Error getting ward by code', {
      error: error.message,
      stack: error.stack,
      code: req.params.code,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin phường/xã', error);
  }
};

/**
 * Search provinces, districts, wards
 * GET /api/provinces/search?q=keyword
 */
export const search = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return ResponseHandler.badRequest(res, 'Vui lòng nhập từ khóa tìm kiếm');
    }

    const keyword = q.trim();
    const url = `${PROVINCES_API_BASE_URL}/d/search/?q=${encodeURIComponent(keyword)}`;
    const cacheKey = `search_${keyword}`;
    
    // Cache search results for shorter duration (1 hour)
    const cached = cache.get(cacheKey);
    const SEARCH_CACHE_DURATION = 60 * 60 * 1000; // 1 hour
    if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_DURATION) {
      logger.info('[Provinces] Using cached search results', { keyword });
      return ResponseHandler.success(res, cached.data, 'Tìm kiếm thành công');
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();

    // Cache the search results
    cache.set(cacheKey, { data, timestamp: Date.now() });
    
    return ResponseHandler.success(res, data, 'Tìm kiếm thành công');
  } catch (error: any) {
    logger.error('[Provinces] Error searching', {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi tìm kiếm', error);
  }
};

