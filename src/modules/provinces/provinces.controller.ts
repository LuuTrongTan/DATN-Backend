import { Response, Request } from 'express';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import { getGHNProvinces, getGHNDistricts, getGHNWards, GHNProvince, GHNDistrict, GHNWard } from './ghn.service';

// Sử dụng GHN API cho provinces/districts/wards để đồng nhất với shipping
// Cache để tránh gọi API quá nhiều
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Convert GHN Province to standard format
 */
const convertGHNProvince = (ghnProvince: GHNProvince) => ({
  code: ghnProvince.ProvinceID,
  name: ghnProvince.ProvinceName,
  codename: ghnProvince.Code,
  division_type: '',
  phone_code: 0,
});

/**
 * Convert GHN District to standard format
 */
const convertGHNDistrict = (ghnDistrict: GHNDistrict) => ({
  code: ghnDistrict.DistrictID,
  name: ghnDistrict.DistrictName,
  codename: ghnDistrict.Code,
  division_type: '',
  province_code: ghnDistrict.ProvinceID,
});

/**
 * Convert GHN Ward to standard format
 */
const convertGHNWard = (ghnWard: GHNWard) => ({
  code: parseInt(ghnWard.WardCode, 10) || 0,
  name: ghnWard.WardName,
  codename: ghnWard.WardCode,
  division_type: '',
  district_code: ghnWard.DistrictID,
});

/**
 * Fetch data with caching
 */
const fetchWithCache = async <T>(
  cacheKey: string,
  fetchFn: () => Promise<T>
): Promise<T> => {
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    const cacheAge = Math.floor((Date.now() - cached.timestamp) / 1000 / 60); // minutes
    console.log('[GHN API] 💾 Using cached data', { 
      cacheKey, 
      cacheAgeMinutes: cacheAge,
    });
    return cached.data as T;
  }

  try {
    console.log('[GHN API] 🌐 Fetching from GHN API', { cacheKey });
    const data = await fetchFn();

    // Cache the data
    cache.set(cacheKey, { data, timestamp: Date.now() });
    console.log('[GHN API] ✅ Fetched and cached data', { 
      cacheKey,
      dataSize: JSON.stringify(data).length 
    });

    return data;
  } catch (error: any) {
    console.error('[GHN API] ❌ Error fetching data', {
      cacheKey,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Get all provinces (tỉnh/thành phố)
 * GET /api/provinces
 * Sử dụng GHN API
 */
export const getProvinces = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  
  console.log('[GHN API] 📍 GET /api/provinces - Request từ frontend', {
    method: req.method,
    path: req.path,
    query: req.query,
    clientIp,
    userAgent: req.get('user-agent'),
  });

  try {
    const { search } = req.query;
    const cacheKey = search && typeof search === 'string' && search.trim().length > 0
      ? `ghn_provinces_search_${search.trim()}`
      : 'ghn_provinces';
    
    const ghnProvinces = await fetchWithCache(cacheKey, () => getGHNProvinces());
    
    // Convert to standard format
    let provinces = ghnProvinces.map(convertGHNProvince);
    
    // Filter by search if provided
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const searchLower = search.trim().toLowerCase();
      provinces = provinces.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        p.codename.toLowerCase().includes(searchLower)
      );
    }
    
    const duration = Date.now() - startTime;
    
    console.log('[GHN API] ✅ GET /api/provinces - Response thành công', {
      duration: `${duration}ms`,
      dataLength: provinces.length,
      search: search || null,
      cached: cache.has(cacheKey),
    });
    
    return ResponseHandler.success(res, provinces, 'Lấy danh sách tỉnh/thành phố thành công');
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[GHN API] ❌ GET /api/provinces - Error', {
      error: error.message,
      stack: error.stack,
      query: req.query,
      duration: `${duration}ms`,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách tỉnh/thành phố', error);
  }
};

/**
 * Get province by code
 * GET /api/provinces/:code
 * Sử dụng GHN API
 */
export const getProvinceByCode = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const { code } = req.params;
  
  console.log('[GHN API] 📍 GET /api/provinces/:code - Request từ frontend', {
    method: req.method,
    path: req.path,
    params: { code },
    query: req.query,
    clientIp,
    userAgent: req.get('user-agent'),
  });

  try {
    const provinceCode = parseInt(code, 10);
    if (isNaN(provinceCode)) {
      console.warn('[GHN API] ⚠️ Invalid province code', { code });
      return ResponseHandler.badRequest(res, 'Mã tỉnh/thành phố không hợp lệ');
    }

    const cacheKey = `ghn_province_${provinceCode}`;
    const ghnProvinces = await fetchWithCache('ghn_provinces', () => getGHNProvinces());
    
    const ghnProvince = ghnProvinces.find(p => p.ProvinceID === provinceCode);
    if (!ghnProvince) {
      return ResponseHandler.notFound(res, 'Không tìm thấy tỉnh/thành phố');
    }

    const province = convertGHNProvince(ghnProvince);
    
    const duration = Date.now() - startTime;
    console.log('[GHN API] ✅ GET /api/provinces/:code - Response thành công', {
      duration: `${duration}ms`,
      provinceCode,
      cached: cache.has('ghn_provinces'),
    });
    
    return ResponseHandler.success(res, province, 'Lấy thông tin tỉnh/thành phố thành công');
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[GHN API] ❌ GET /api/provinces/:code - Error', {
      error: error.message,
      stack: error.stack,
      code: req.params.code,
      query: req.query,
      duration: `${duration}ms`,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin tỉnh/thành phố', error);
  }
};

/**
 * Get districts by province code
 * GET /api/provinces/:provinceCode/districts
 * Sử dụng GHN API
 */
export const getDistricts = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const { provinceCode } = req.params;
  
  console.log('[GHN API] 📍 GET /api/provinces/:provinceCode/districts - Request từ frontend', {
    method: req.method,
    path: req.path,
    params: { provinceCode },
    query: req.query,
    clientIp,
    userAgent: req.get('user-agent'),
  });

  try {
    const code = parseInt(provinceCode, 10);
    if (isNaN(code)) {
      console.warn('[GHN API] ⚠️ Invalid province code', { provinceCode });
      return ResponseHandler.badRequest(res, 'Mã tỉnh/thành phố không hợp lệ');
    }

    const cacheKey = `ghn_districts_${code}`;
    const ghnDistricts = await fetchWithCache(cacheKey, () => getGHNDistricts(code));
    
    // Convert to standard format
    const districts = ghnDistricts.map(convertGHNDistrict);
    
    const duration = Date.now() - startTime;
    console.log('[GHN API] ✅ GET /api/provinces/:provinceCode/districts - Response thành công', {
      duration: `${duration}ms`,
      provinceCode: code,
      districtsCount: districts.length,
      cached: cache.has(cacheKey),
    });
    
    return ResponseHandler.success(res, districts, 'Lấy danh sách quận/huyện thành công');
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[GHN API] ❌ GET /api/provinces/:provinceCode/districts - Error', {
      error: error.message,
      stack: error.stack,
      provinceCode: req.params.provinceCode,
      query: req.query,
      duration: `${duration}ms`,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách quận/huyện', error);
  }
};

/**
 * Get district by code
 * GET /api/provinces/districts/:code
 * Sử dụng GHN API
 */
export const getDistrictByCode = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const { code } = req.params;
  
  console.log('[GHN API] 📍 GET /api/provinces/districts/:code - Request từ frontend', {
    method: req.method,
    path: req.path,
    params: { code },
    query: req.query,
    clientIp,
    userAgent: req.get('user-agent'),
  });

  try {
    const districtCode = parseInt(code, 10);
    if (isNaN(districtCode)) {
      console.warn('[GHN API] ⚠️ Invalid district code', { code });
      return ResponseHandler.badRequest(res, 'Mã quận/huyện không hợp lệ');
    }

    // Get all provinces first to find district's province
    const ghnProvinces = await fetchWithCache('ghn_provinces', () => getGHNProvinces());
    
    // Try to find district by searching through all provinces
    // This is not optimal but GHN API doesn't have direct district lookup
    for (const province of ghnProvinces) {
      const ghnDistricts = await fetchWithCache(`ghn_districts_${province.ProvinceID}`, () => 
        getGHNDistricts(province.ProvinceID)
      );
      const district = ghnDistricts.find(d => d.DistrictID === districtCode);
      if (district) {
        const districtData = convertGHNDistrict(district);
        const duration = Date.now() - startTime;
        console.log('[GHN API] ✅ GET /api/provinces/districts/:code - Response thành công', {
          duration: `${duration}ms`,
          districtCode,
        });
        return ResponseHandler.success(res, districtData, 'Lấy thông tin quận/huyện thành công');
      }
    }
    
    return ResponseHandler.notFound(res, 'Không tìm thấy quận/huyện');
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[GHN API] ❌ GET /api/provinces/districts/:code - Error', {
      error: error.message,
      stack: error.stack,
      code: req.params.code,
      query: req.query,
      duration: `${duration}ms`,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin quận/huyện', error);
  }
};

/**
 * Get wards by district code
 * GET /api/provinces/districts/:districtCode/wards
 * Sử dụng GHN API
 */
export const getWards = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const { districtCode } = req.params;
  
  console.log('[GHN API] 📍 GET /api/provinces/districts/:districtCode/wards - Request từ frontend', {
    method: req.method,
    path: req.path,
    params: { districtCode },
    clientIp,
    userAgent: req.get('user-agent'),
  });

  try {
    const code = parseInt(districtCode, 10);
    if (isNaN(code)) {
      console.warn('[GHN API] ⚠️ Invalid district code', { districtCode });
      return ResponseHandler.badRequest(res, 'Mã quận/huyện không hợp lệ');
    }

    const cacheKey = `ghn_wards_${code}`;
    const ghnWards = await fetchWithCache(cacheKey, () => getGHNWards(code));
    
    // Convert to standard format
    const wards = ghnWards.map(convertGHNWard);
    
    const duration = Date.now() - startTime;
    console.log('[GHN API] ✅ GET /api/provinces/districts/:districtCode/wards - Response thành công', {
      duration: `${duration}ms`,
      districtCode: code,
      wardsCount: wards.length,
      cached: cache.has(cacheKey),
    });
    
    return ResponseHandler.success(res, wards, 'Lấy danh sách phường/xã thành công');
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[GHN API] ❌ GET /api/provinces/districts/:districtCode/wards - Error', {
      error: error.message,
      stack: error.stack,
      districtCode: req.params.districtCode,
      duration: `${duration}ms`,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách phường/xã', error);
  }
};

/**
 * Get ward by code
 * GET /api/provinces/wards/:code
 * Sử dụng GHN API
 */
export const getWardByCode = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const { code } = req.params;
  
  console.log('[GHN API] 📍 GET /api/provinces/wards/:code - Request từ frontend', {
    method: req.method,
    path: req.path,
    params: { code },
    clientIp,
    userAgent: req.get('user-agent'),
  });

  try {
    // GHN uses WardCode as string, but we accept both string and number
    const wardCode = code;
    
    // Get all provinces and districts to find ward
    // This is not optimal but GHN API doesn't have direct ward lookup
    const ghnProvinces = await fetchWithCache('ghn_provinces', () => getGHNProvinces());
    
    for (const province of ghnProvinces) {
      const ghnDistricts = await fetchWithCache(`ghn_districts_${province.ProvinceID}`, () => 
        getGHNDistricts(province.ProvinceID)
      );
      
      for (const district of ghnDistricts) {
        const ghnWards = await fetchWithCache(`ghn_wards_${district.DistrictID}`, () => 
          getGHNWards(district.DistrictID)
        );
        
        const ward = ghnWards.find(w => 
          w.WardCode === wardCode || 
          w.WardCode === String(wardCode) ||
          parseInt(w.WardCode, 10) === parseInt(String(wardCode), 10)
        );
        
        if (ward) {
          const wardData = convertGHNWard(ward);
          const duration = Date.now() - startTime;
          console.log('[GHN API] ✅ GET /api/provinces/wards/:code - Response thành công', {
            duration: `${duration}ms`,
            wardCode,
          });
          return ResponseHandler.success(res, wardData, 'Lấy thông tin phường/xã thành công');
        }
      }
    }
    
    return ResponseHandler.notFound(res, 'Không tìm thấy phường/xã');
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[GHN API] ❌ GET /api/provinces/wards/:code - Error', {
      error: error.message,
      stack: error.stack,
      code: req.params.code,
      duration: `${duration}ms`,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin phường/xã', error);
  }
};

/**
 * Search provinces, districts, wards
 * GET /api/provinces/search?q=keyword
 * Sử dụng GHN API - tìm kiếm trong tất cả provinces, districts, wards
 */
export const search = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  
  console.log('[GHN API] 📍 GET /api/provinces/search - Request từ frontend', {
    method: req.method,
    path: req.path,
    query: req.query,
    clientIp,
    userAgent: req.get('user-agent'),
  });

  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      console.warn('[GHN API] ⚠️ Missing search keyword', { query: req.query });
      return ResponseHandler.badRequest(res, 'Vui lòng nhập từ khóa tìm kiếm');
    }

    const keyword = q.trim().toLowerCase();
    const cacheKey = `ghn_search_${keyword}`;
    
    // Cache search results for shorter duration (1 hour)
    const cached = cache.get(cacheKey);
    const SEARCH_CACHE_DURATION = 60 * 60 * 1000; // 1 hour
    if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_DURATION) {
      const duration = Date.now() - startTime;
      console.log('[GHN API] ✅ GET /api/provinces/search - Response từ cache', {
        duration: `${duration}ms`,
        keyword,
        resultsCount: Array.isArray(cached.data) ? cached.data.length : 0,
        cached: true,
      });
      return ResponseHandler.success(res, cached.data, 'Tìm kiếm thành công');
    }

    // Search in provinces, districts, and wards
    const results: any[] = [];
    
    // Search provinces
    const ghnProvinces = await fetchWithCache('ghn_provinces', () => getGHNProvinces());
    const matchedProvinces = ghnProvinces
      .filter(p => 
        p.ProvinceName.toLowerCase().includes(keyword) ||
        p.Code.toLowerCase().includes(keyword)
      )
      .map(p => ({ ...convertGHNProvince(p), type: 'province' }));
    results.push(...matchedProvinces);
    
    // Search districts (limited to first 5 provinces for performance)
    for (const province of ghnProvinces.slice(0, 5)) {
      try {
        const ghnDistricts = await fetchWithCache(`ghn_districts_${province.ProvinceID}`, () => 
          getGHNDistricts(province.ProvinceID)
        );
        const matchedDistricts = ghnDistricts
          .filter(d => 
            d.DistrictName.toLowerCase().includes(keyword) ||
            d.Code.toLowerCase().includes(keyword)
          )
          .map(d => ({ ...convertGHNDistrict(d), type: 'district' }));
        results.push(...matchedDistricts);
      } catch (error) {
        // Skip if error
      }
    }
    
    // Search wards (limited to first 3 districts for performance)
    for (const province of ghnProvinces.slice(0, 3)) {
      try {
        const ghnDistricts = await fetchWithCache(`ghn_districts_${province.ProvinceID}`, () => 
          getGHNDistricts(province.ProvinceID)
        );
        for (const district of ghnDistricts.slice(0, 3)) {
          try {
            const ghnWards = await fetchWithCache(`ghn_wards_${district.DistrictID}`, () => 
              getGHNWards(district.DistrictID)
            );
            const matchedWards = ghnWards
              .filter(w => 
                w.WardName.toLowerCase().includes(keyword) ||
                w.WardCode.toLowerCase().includes(keyword)
              )
              .map(w => ({ ...convertGHNWard(w), type: 'ward' }));
            results.push(...matchedWards);
          } catch (error) {
            // Skip if error
          }
        }
      } catch (error) {
        // Skip if error
      }
    }

    // Cache the search results
    cache.set(cacheKey, { data: results, timestamp: Date.now() });
    
    const duration = Date.now() - startTime;
    console.log('[GHN API] ✅ GET /api/provinces/search - Response thành công', {
      duration: `${duration}ms`,
      keyword,
      resultsCount: results.length,
      cached: false,
    });
    
    return ResponseHandler.success(res, results, 'Tìm kiếm thành công');
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[GHN API] ❌ GET /api/provinces/search - Error', {
      error: error.message,
      stack: error.stack,
      query: req.query,
      duration: `${duration}ms`,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi tìm kiếm', error);
  }
};

/**
 * Clear provinces API cache
 * POST /api/provinces/cache/clear
 * DELETE /api/provinces/cache/clear
 */
export const clearCache = async (req: Request, res: Response) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  
  console.log('[GHN API] 🗑️ Clear cache request', {
    method: req.method,
    path: req.path,
    clientIp,
    userAgent: req.get('user-agent'),
    cacheSizeBefore: cache.size,
  });

  try {
    const cacheSizeBefore = cache.size;
    
    // Clear all cache
    cache.clear();
    
    const duration = Date.now() - startTime;
    console.log('[GHN API] ✅ Cache cleared successfully', {
      duration: `${duration}ms`,
      cacheSizeBefore,
      cacheSizeAfter: cache.size,
    });
    
    return ResponseHandler.success(
      res,
      {
        cleared: true,
        cacheSizeBefore,
        cacheSizeAfter: cache.size,
        message: 'Đã xóa toàn bộ cache thành công',
      },
      'Đã xóa cache thành công'
    );
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[GHN API] ❌ Clear cache error', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi xóa cache', error);
  }
};
