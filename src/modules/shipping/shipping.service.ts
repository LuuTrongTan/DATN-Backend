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
  length?: number; // Chiều dài (cm) - cho Hàng nhẹ hoặc tính items cho Hàng nặng
  width?: number; // Chiều rộng (cm)
  height?: number; // Chiều cao (cm)
  from_province?: string | number; // Shop location province name or ID
  from_district?: string | number; // Shop location district name or ID
  from_ward?: string; // Shop location ward code or name
}

export interface ShippingFeeResponse {
  fee: number;
  estimated_days: number;
  estimated_hours?: number; // Số giờ dự kiến (0-23)
  estimated_minutes?: number; // Số phút dự kiến (0-59)
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
): Promise<{ 
  provinceId: number; 
  districtId: number; 
  wardCode: string;
  provinceName: string;
  districtName: string;
  wardName: string;
}> => {
  // Nếu đã truyền sẵn mã GHN (number cho province/district, ward là code) thì cần lookup tên
  if (typeof province === 'number' && typeof district === 'number') {
    const wardCode = ward || '';
    // Lookup tên từ ID
    const provinces = await getGHNProvinces();
    const provinceObj = provinces.find(p => p.ProvinceID === province);
    const districts = await getGHNDistricts(province);
    const districtObj = districts.find(d => d.DistrictID === district);
    let wardName = '';
    if (wardCode) {
      const wards = await getGHNWards(district);
      const wardObj = wards.find(w => w.WardCode === wardCode);
      wardName = wardObj?.WardName || '';
    }
    return { 
      provinceId: province, 
      districtId: district, 
      wardCode,
      provinceName: provinceObj?.ProvinceName || '',
      districtName: districtObj?.DistrictName || '',
      wardName,
    };
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

  // Lookup ward code và tên
  let wardCode = ward || '';
  let wardName = '';
  if (ward && !ward.match(/^\d+$/)) {
    // If ward is a name, lookup the code
    const wards = await getGHNWards(districtId);
    const wardObj = wards.find(w => 
      w.WardCode === ward ||
      w.WardName === ward
    );
    if (wardObj) {
      wardCode = wardObj.WardCode;
      wardName = wardObj.WardName;
    }
  } else if (ward && ward.match(/^\d+$/)) {
    // If ward is a code, lookup the name
    const wards = await getGHNWards(districtId);
    const wardObj = wards.find(w => w.WardCode === ward);
    if (wardObj) {
      wardName = wardObj.WardName;
    }
  }

  return { 
    provinceId, 
    districtId, 
    wardCode,
    provinceName: provinceObj.ProvinceName,
    districtName: districtObj.DistrictName,
    wardName: wardName || ward || '',
  };
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

    // Validate required fields - to_ward_code is required by GHN API
    if (!toLocation.wardCode || toLocation.wardCode.trim() === '') {
      logger.warn('to_ward_code is empty, trying to get first ward from district', {
        districtId: toLocation.districtId,
        province: request.province,
        district: request.district,
      });
      
      // Try to get first ward from district if ward_code is empty
      try {
        const wards = await getGHNWards(toLocation.districtId);
        if (wards && wards.length > 0) {
          toLocation.wardCode = wards[0].WardCode;
          logger.info('Using first ward from district', {
            wardCode: toLocation.wardCode,
            wardName: wards[0].WardName,
          });
        } else {
          throw new Error('Không tìm thấy phường/xã cho quận/huyện này');
        }
      } catch (error: any) {
        logger.error('Cannot get ward code', error instanceof Error ? error : new Error(String(error)));
        throw new Error('Phường/xã là bắt buộc để tính phí vận chuyển. Vui lòng cung cấp thông tin phường/xã.');
      }
    }

      // BƯỚC 1: Gọi API lấy danh sách services để kiểm tra service_type_id = 2 có hợp lệ
      // Theo tài liệu: https://api.ghn.vn/home/docs/detail?id=86
      const shopId = parseInt(process.env.GHN_SHOP_ID || '0', 10);
      if (!shopId) {
        throw new Error('GHN_SHOP_ID chưa được cấu hình');
      }

      let serviceTypeId = 2; // Ưu tiên Hàng nhẹ (< 20kg), nếu không có thì dùng Hàng nặng
      let selectedService: { service_id: number; service_type_id: number; short_name: string } | undefined;

      try {
        const { getGHNServices } = await import('./ghn.service.js');

        console.log('\n========== GHN API - GET AVAILABLE SERVICES ==========');
        console.log('URL: https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services');
        console.log('\nMethod: POST');
        console.log('\nRequest Body:');
        const servicesRequest = {
          shop_id: shopId,
          from_district: fromLocation.districtId,
          to_district: toLocation.districtId,
        };
        console.log(JSON.stringify(servicesRequest, null, 2));
        console.log('\n--- cURL Command ---');
        const token = process.env.GHN_API_TOKEN || '';
        console.log(`curl --location 'https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services' \\`);
        console.log(`  --header 'Content-Type: application/json' \\`);
        console.log(`  --header 'Token: ${token.substring(0, 8)}...' \\`);
        console.log(`  --data '${JSON.stringify(servicesRequest)}'`);
        console.log('=======================================================\n');
        
        logger.info('Fetching available services to validate service_type_id', {
          shop_id: shopId,
          from_district: fromLocation.districtId,
          to_district: toLocation.districtId,
          requested_service_type_id: serviceTypeId,
        });
        
        const services = await getGHNServices({
          shop_id: shopId,
          from_district: fromLocation.districtId,
          to_district: toLocation.districtId,
        });
        
        console.log('\n========== GHN API - AVAILABLE SERVICES RESPONSE ==========');
        console.log('Services Count:', services.length);
        console.log('\nAvailable Services:');
        console.log(JSON.stringify(services, null, 2));
        console.log('============================================================\n');
        
        // Tìm service với service_type_id = 2 (Hàng nhẹ) trước
        selectedService = services.find((s: any) => s.service_type_id === 2);
        let finalServiceTypeId = 2;
        
        // Nếu không có Hàng nhẹ, dùng Hàng nặng (service_type_id = 5)
        if (!selectedService) {
          selectedService = services.find((s: any) => s.service_type_id === 5);
          if (selectedService) {
            finalServiceTypeId = 5;
            logger.warn('service_type_id = 2 (Hàng nhẹ) không có sẵn, sử dụng Hàng nặng (service_type_id = 5)', {
              available_services: services.map((s: any) => ({
                service_id: s.service_id,
                service_type_id: s.service_type_id,
                name: s.short_name,
              })),
              selected_service_type_id: finalServiceTypeId,
              selected_service_name: selectedService.short_name,
            });
          } else {
            // Nếu cả hai đều không có thì mới throw error
            logger.error('Không có dịch vụ Hàng nhẹ (2) hoặc Hàng nặng (5) cho tuyến này', {
              available_services: services.map((s: any) => ({
                service_id: s.service_id,
                service_type_id: s.service_type_id,
                name: s.short_name,
              })),
            });
            throw new Error(`Không có dịch vụ vận chuyển phù hợp cho tuyến từ ${fromLocation.districtId} đến ${toLocation.districtId}`);
          }
        } else {
          logger.info('service_type_id = 2 (Hàng nhẹ) hợp lệ cho tuyến này', {
            service_type_id: finalServiceTypeId,
            service_name: selectedService.short_name,
            available_services: services.length,
          });
        }
        
        // Cập nhật serviceTypeId để dùng trong request tính phí và leadtime
        serviceTypeId = finalServiceTypeId;

      } catch (serviceError: any) {
        logger.error('Failed to validate service_type_id', {
          error: serviceError.message,
          stack: serviceError.stack,
        });
        throw new Error(`Không thể xác thực dịch vụ vận chuyển: ${serviceError.message}`);
      }

      // BƯỚC 2: Tính phí với service_type_id đã được xác thực hợp lệ
      // Use GHN API - according to GHN API docs: https://api.ghn.vn/home/docs/detail?id=95
      const ghnRequest: GHNCalculateFeeRequest = {
        from_district_id: fromLocation.districtId,
        from_ward_code: fromLocation.wardCode || undefined, // Optional - will use ShopId if not provided
        to_district_id: toLocation.districtId, // Required
        to_ward_code: toLocation.wardCode, // Required - now guaranteed to have value
        weight: request.weight * 1000, // Convert kg to gram (required)
        insurance_value: request.value || 0, // Use value as insurance_value (max 5,000,000)
        service_type_id: serviceTypeId, // 2 = Hàng nhẹ, 5 = Hàng nặng - đã được xác thực hợp lệ
        service_id: selectedService?.service_id, // Thêm service_id để tính leadtime chính xác
        // Kích thước từ request (nếu có) - dùng cho Hàng nhẹ hoặc tạo items cho Hàng nặng
        length: request.length ? Math.round(request.length) : undefined,
        width: request.width ? Math.round(request.width) : undefined,
        height: request.height ? Math.round(request.height) : undefined,
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
      estimated_hours: 0,
      estimated_minutes: 0,
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
    // Lookup location IDs cho shop (from) và khách hàng (to)
    const fromLocation = await lookupLocationIds(request.from_province, request.from_district, request.from_ward);
    const toLocation = await lookupLocationIds(request.to_province, request.to_district, request.to_ward);

    // Validate from_location - bắt buộc để GHN xác định kho
    if (!fromLocation.districtId) {
      logger.error('Missing from_district_id for GHN order', {
        from_province: request.from_province,
        from_district: request.from_district,
        from_ward: request.from_ward,
      });
      return {
        success: false,
        error: 'Thiếu thông tin địa chỉ kho lấy hàng (from_district). Vui lòng cấu hình SHOP_PROVINCE, SHOP_DISTRICT trong .env',
      };
    }

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

    // Validate to_location
    if (!toLocation.districtId || !toLocation.wardCode) {
      return {
        success: false,
        error: `Thiếu thông tin địa chỉ giao hàng. District ID: ${toLocation.districtId}, Ward Code: ${toLocation.wardCode}`,
      };
    }

    logger.info('GHN order location info', {
      from: {
        district_id: fromLocation.districtId,
        ward_code: fromLocation.wardCode,
        province: request.from_province,
        district: request.from_district,
        ward: request.from_ward,
      },
      to: {
        district_id: toLocation.districtId,
        ward_code: toLocation.wardCode,
        province_id: toProvinceObj.ProvinceID,
        province: request.to_province,
        district: request.to_district,
        ward: request.to_ward,
      },
    });

    const ghnRequest: GHNCreateOrderRequest = {
      // Các trường bắt buộc theo tài liệu GHN
      to_name: request.to_name,
      to_phone: request.to_phone,
      to_address: request.to_address,
      to_ward_name: toLocation.wardName || toLocation.wardCode || '', // Bắt buộc - Tên phường/xã
      to_district_name: toLocation.districtName || '', // Bắt buộc - Tên quận/huyện
      to_province_name: toProvinceObj.ProvinceName || '', // Bắt buộc - Tên tỉnh/thành phố
      // Optional - ID/Code (có thể dùng thay cho tên)
      to_ward_code: toLocation.wardCode || undefined,
      to_district_id: toLocation.districtId || undefined,
      to_province_id: toProvinceObj.ProvinceID || undefined,
      // Thông tin kho lấy hàng (from) - Luôn dùng giá trị mặc định, không lấy từ request hoặc lookup
      from_name: 'TinTest124',
      from_phone: '0987654321',
      from_address: '72 Thành Thái, Phường 14, Quận 10, Hồ Chí Minh, Vietnam',
      from_ward_name: 'Phường 14',
      from_district_name: 'Quận 10',
      from_province_name: 'HCM',
      // Không gửi from_district_id và from_ward_code lên GHN theo yêu cầu
      // Các trường khác
      client_order_code: request.order_number,
      cod_amount: request.cod || 0,
      content: request.note || `Đơn hàng #${request.order_number}`,
      weight: request.weight * 1000, // Convert kg to gram
      length: 20,
      width: 20,
      height: 20,
      service_type_id: 2, // Bắt buộc - Hàng nhẹ
      payment_type_id: 2, // Bắt buộc - Buyer pay
      note: request.note,
      required_note: 'CHOTHUHANG', // Bắt buộc - Cho thu hàng
      // Thông tin trả hàng (return) - Luôn dùng giá trị mặc định
      return_phone: '0332190158',
      return_address: '39 NTT',
      return_district_id: undefined,
      return_ward_code: '',
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


