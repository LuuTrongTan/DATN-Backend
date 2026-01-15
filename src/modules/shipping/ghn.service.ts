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
  from_district_id?: number; // Optional - will use ShopId if not provided
  from_ward_code?: string; // Optional - will use ShopId if not provided
  to_district_id: number; // Required
  to_ward_code: string; // Required
  weight: number; // in gram (required for Hàng nhẹ)
  service_type_id?: number; // Service type ID: 2 = Hàng nhẹ, 5 = Hàng nặng
  service_id?: number; // Service ID (dùng để tính leadtime chính xác)
  insurance_value?: number; // Insurance value (default: 0)
  cod_value?: number; // COD amount (default: 0) - NOTE: API uses cod_value, not cod_amount
  // Hàng nhẹ (service_type_id = 2): dùng length, width, height, weight ở root
  length?: number; // Length in cm (for Hàng nhẹ)
  width?: number; // Width in cm (for Hàng nhẹ)
  height?: number; // Height in cm (for Hàng nhẹ)
  // Hàng nặng (service_type_id = 5): BẮT BUỘC phải có items[]
  items?: Array<{
    name: string; // Required
    code?: string; // Optional
    quantity: number; // Required
    length: number; // Required (in cm)
    width: number; // Required (in cm)
    height: number; // Required (in cm)
    weight: number; // Required (in gram)
  }>;
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
  to_name: string; // Bắt buộc
  to_phone: string; // Bắt buộc
  to_address: string; // Bắt buộc
  to_ward_name: string; // Bắt buộc - Tên phường/xã
  to_district_name: string; // Bắt buộc - Tên quận/huyện
  to_province_name: string; // Bắt buộc - Tên tỉnh/thành phố
  to_ward_code?: string; // Optional - Mã phường/xã (có thể dùng thay cho to_ward_name)
  to_district_id?: number; // Optional - ID quận/huyện (có thể dùng thay cho to_district_name)
  to_province_id?: number; // Optional - ID tỉnh/thành phố (có thể dùng thay cho to_province_name)
  from_name?: string; // Optional - Nếu không truyền thì lấy từ ShopID
  from_phone?: string; // Optional - Nếu không truyền thì lấy từ ShopID
  from_address?: string; // Optional - Nếu không truyền thì lấy từ ShopID
  from_ward_name?: string; // Optional - Nếu không truyền thì lấy từ ShopID
  from_district_name?: string; // Optional - Nếu không truyền thì lấy từ ShopID
  from_province_name?: string; // Optional - Nếu không truyền thì lấy từ ShopID
  from_district_id?: number; // Optional - ID quận/huyện kho lấy hàng
  from_ward_code?: string; // Optional - Mã phường/xã kho lấy hàng
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
): Promise<{ fee: number; estimated_days: number; estimated_hours?: number; estimated_minutes?: number; service_type: string; provider: string }> => {
  const config = getGHNConfig();

  if (!config.token || !config.shopId) {
    logger.warn('GHN API token or shop ID not configured, using fallback calculation');
    return calculateFallbackFee(request);
  }

  // Log request details for debugging
  logger.info('GHN API Request - Calculate Fee', {
    url: `${config.apiUrl}/shipping-order/fee`,
    shopId: config.shopId,
    hasToken: !!config.token,
    tokenPrefix: config.token ? config.token.substring(0, 8) + '...' : 'N/A',
    from_district: request.from_district_id,
    to_district: request.to_district_id,
  });

  try {
    // Validate required fields according to GHN API documentation
    if (!request.to_district_id || !request.to_ward_code || !request.weight) {
      logger.error('GHN API - Missing required fields', {
        has_to_district_id: !!request.to_district_id,
        has_to_ward_code: !!request.to_ward_code,
        has_weight: !!request.weight,
      });
      return calculateFallbackFee(request);
    }

    // CHỈ CẦN service_type_id, KHÔNG CẦN service_id
    // NOTE: Luôn sử dụng Hàng nhẹ (service_type_id = 2) cho tất cả sản phẩm
    const serviceTypeId = request.service_type_id || 2; // ALWAYS 2 (Hàng nhẹ) - Hardcoded default

    // Build request body according to GHN API spec: https://api.ghn.vn/home/docs/detail?id=95
    // Hàng nhẹ (service_type_id = 2): dùng length, width, height, weight ở root
    // Hàng nặng (service_type_id = 5): BẮT BUỘC phải có items[] array
    const requestBody: any = {
      to_district_id: request.to_district_id, // Required
      to_ward_code: request.to_ward_code, // Required
      service_type_id: serviceTypeId,
    };

    // Xử lý theo loại dịch vụ
    if (serviceTypeId === 2) {
      // Hàng nhẹ: dùng length, width, height, weight ở root level
      requestBody.weight = request.weight; // Required (in gram)
      
      if (request.length) {
        requestBody.length = request.length;
      }
      if (request.width) {
        requestBody.width = request.width;
      }
      if (request.height) {
        requestBody.height = request.height;
      }
    } else if (serviceTypeId === 5) {
      // Hàng nặng: BẮT BUỘC phải có items[] array
      // Nếu không có items từ request, tạo items từ kích thước và weight
      if (request.items && request.items.length > 0) {
        requestBody.items = request.items;
      } else {
        // Tạo item từ kích thước và weight từ request (nếu có)
        // Nếu không có kích thước, dùng giá trị mặc định cho 1 bộ quần áo
        // Kích thước đóng gói 1 bộ quần áo: 35x25x8cm, trọng lượng: 0.3-0.5kg
        const itemLength = request.length ? Math.round(request.length) : 35; // Default 35cm (cho 1 bộ quần áo)
        const itemWidth = request.width ? Math.round(request.width) : 25;   // Default 25cm (cho 1 bộ quần áo)
        const itemHeight = request.height ? Math.round(request.height) : 8; // Default 8cm (cho 1 bộ quần áo)
        
        requestBody.items = [{
          name: 'Hàng hóa',
          quantity: 1,
          length: itemLength,
          width: itemWidth,
          height: itemHeight,
          weight: request.weight, // Weight in gram
        }];
        logger.info('Created items array for Hàng nặng', {
          items_count: requestBody.items.length,
          total_weight: request.weight,
          length: itemLength,
          width: itemWidth,
          height: itemHeight,
          using_defaults: !request.length && !request.width && !request.height,
        });
      }
      // Hàng nặng vẫn cần weight ở root (tổng weight)
      requestBody.weight = request.weight;
    }

    // Optional fields - only include if provided
    // NOTE: Theo yêu cầu, KHÔNG gửi from_district_id và from_ward_code lên GHN nữa
    // if (request.from_district_id) {
    //   requestBody.from_district_id = request.from_district_id;
    // }
    // if (request.from_ward_code && request.from_ward_code.trim() !== '') {
    //   requestBody.from_ward_code = request.from_ward_code;
    // }
    if (request.insurance_value !== undefined && request.insurance_value !== null) {
      requestBody.insurance_value = request.insurance_value;
    } else if (request.insurance_value === undefined) {
      // Default insurance_value is 0 according to API docs
      requestBody.insurance_value = 0;
    }
    if (request.cod_value !== undefined && request.cod_value !== null) {
      requestBody.cod_value = request.cod_value; // NOTE: API uses cod_value, not cod_amount
    } else if (request.cod_value === undefined) {
      // Default cod_value is 0 according to API docs
      requestBody.cod_value = 0;
    }

    // Log the payload being sent to GHN API - formatted for Postman testing
    const fullToken = config.token || '';
    const fullHeaders = {
      'Content-Type': 'application/json',
      'Token': fullToken,
      'ShopId': String(config.shopId),
    };
    
    console.log('\n========== GHN API REQUEST - COPY TO POSTMAN ==========');
    console.log('URL:', `${config.apiUrl}/shipping-order/fee`);
    console.log('\nMethod: POST');
    console.log('\nHeaders:');
    console.log(JSON.stringify(fullHeaders, null, 2));
    console.log('\nBody (JSON):');
    console.log(JSON.stringify(requestBody, null, 2));
    console.log('\n--- cURL Command ---');
    console.log(`curl --location '${config.apiUrl}/shipping-order/fee' \\`);
    console.log(`  --header 'Content-Type: application/json' \\`);
    console.log(`  --header 'Token: ${fullToken}' \\`);
    console.log(`  --header 'ShopId: ${config.shopId}' \\`);
    console.log(`  --data '${JSON.stringify(requestBody)}'`);
    console.log('=======================================================\n');
    
    // Also log to file logger
    logger.info('GHN API Request Payload', {
      url: `${config.apiUrl}/shipping-order/fee`,
      headers: fullHeaders,
      body: requestBody,
    });

    const response = await fetch(`${config.apiUrl}/shipping-order/fee`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
        'ShopId': String(config.shopId),
      },
      body: JSON.stringify(requestBody),
    });

    // Log response status
    console.log('\n========== GHN API RESPONSE ==========');
    console.log('Status:', response.status, response.statusText);
    
    const responseText = await response.text();
    console.log('\nResponse Body:');
    console.log(responseText);
    console.log('======================================\n');
    
    if (!response.ok) {
      logger.error('GHN API error - Calculate Fee', {
        status: response.status,
        error: responseText,
      });
      return calculateFallbackFee(request);
    }

    const result = JSON.parse(responseText) as { code: number; message: string; data: GHNCalculateFeeResponse };
    
    // Log parsed response
    console.log('\n========== GHN API RESPONSE PARSED ==========');
    console.log('Code:', result.code);
    console.log('Message:', result.message);
    console.log('\nData:');
    console.log(JSON.stringify(result.data, null, 2));
    console.log('=============================================\n');
    
    logger.info('GHN API Response', {
      code: result.code,
      message: result.message,
      data: result.data,
    });

    if (result.code !== 200) {
      logger.error('GHN API error - Calculate Fee', {
        code: result.code,
        message: result.message,
      });
      return calculateFallbackFee(request);
    }

    // BƯỚC 3: Tính thời gian dự kiến từ GHN API /leadtime
    let estimatedDays = 3; // Default fallback
    let hours = 0; // Default
    let minutes = 0; // Default
    try {
      // Gọi API leadtime để lấy thời gian dự kiến chính xác từ GHN
      if (request.from_district_id && request.from_ward_code && request.to_district_id && request.to_ward_code) {
        const leadtimeResult = await calculateGHNLeadtime({
          from_district_id: request.from_district_id,
          from_ward_code: request.from_ward_code,
          to_district_id: request.to_district_id,
          to_ward_code: request.to_ward_code,
          service_id: request.service_id,
          service_type_id: request.service_type_id,
        });
        
        // Chuẩn hóa leadtime: Theo tài liệu GHN API (https://api.ghn.vn/home/docs/detail?id=104)
        // leadtime là Unix timestamp (seconds) - thời gian giao hàng dự kiến
        // order_date là Unix timestamp (seconds) - ngày tạo đơn hàng
        const rawLeadtime = leadtimeResult.leadtime;
        const rawOrderDate = leadtimeResult.order_date;
        let normalizedDays = 3; // Default
        // hours và minutes đã được khai báo ở đầu function
        
        // Theo tài liệu GHN: leadtime là timestamp (Unix timestamp tính bằng giây)
        // Ví dụ: leadtime: 1593187200
        if (rawLeadtime && rawLeadtime > 1000000000) {
          // leadtime là timestamp (seconds) - thời gian giao hàng dự kiến
          const now = Math.floor(Date.now() / 1000); // Current timestamp in seconds
          const deliveryTimestamp = rawLeadtime; // Thời gian giao hàng dự kiến
          const secondsDiff = deliveryTimestamp - now; // Chênh lệch thời gian (seconds)
          
          // Tính số ngày, giờ, phút từ hiện tại đến thời gian giao dự kiến
          if (secondsDiff > 0) {
            // Thời gian giao trong tương lai
            const totalDays = secondsDiff / (24 * 60 * 60);
            normalizedDays = Math.floor(totalDays);
            const remainingSeconds = secondsDiff % (24 * 60 * 60); // Phần dư sau khi trừ số ngày
            hours = Math.floor(remainingSeconds / (60 * 60));
            const remainingSecondsAfterHours = remainingSeconds % (60 * 60);
            minutes = Math.floor(remainingSecondsAfterHours / 60);
            
            // Validate: nếu số ngày quá lớn (> 30) hoặc quá nhỏ (< 0), có thể là timestamp sai
            if (normalizedDays > 30) {
              logger.warn('Leadtime timestamp seems too far in future, using fallback', {
                raw_leadtime: rawLeadtime,
                calculated_days: normalizedDays,
                calculated_hours: hours,
                calculated_minutes: minutes,
                now_timestamp: now,
                delivery_timestamp: deliveryTimestamp,
                seconds_diff: secondsDiff,
              });
              // Fallback: tính dựa trên khoảng cách
              const isSameDistrict = request.from_district_id === request.to_district_id;
              normalizedDays = isSameDistrict ? 1 : 3;
              hours = 0;
              minutes = 0;
            } else if (normalizedDays < 0) {
              // Thời gian giao đã qua (có thể do timezone hoặc lỗi)
              logger.warn('Leadtime timestamp is in the past, using fallback', {
                raw_leadtime: rawLeadtime,
                calculated_days: normalizedDays,
                now_timestamp: now,
                delivery_timestamp: deliveryTimestamp,
              });
              const isSameDistrict = request.from_district_id === request.to_district_id;
              normalizedDays = isSameDistrict ? 1 : 3;
              hours = 0;
              minutes = 0;
            }
          } else {
            // Thời gian giao đã qua hoặc bằng hiện tại
            logger.warn('Leadtime timestamp is not in future, using fallback', {
              raw_leadtime: rawLeadtime,
              seconds_diff: secondsDiff,
              now_timestamp: now,
              delivery_timestamp: deliveryTimestamp,
            });
            const isSameDistrict = request.from_district_id === request.to_district_id;
            normalizedDays = isSameDistrict ? 1 : 3;
            hours = 0;
            minutes = 0;
          }
        } else {
          // Giá trị không hợp lệ (không phải timestamp), dùng fallback
          logger.warn('Leadtime value is not a valid timestamp, using fallback', {
            raw_leadtime: rawLeadtime,
          });
          const isSameDistrict = request.from_district_id === request.to_district_id;
          normalizedDays = isSameDistrict ? 1 : 3;
          hours = 0;
          minutes = 0;
        }
        
        estimatedDays = normalizedDays;
        
        // Format ngày tháng từ timestamp để hiển thị
        const deliveryDate = rawLeadtime ? new Date(Number(rawLeadtime) * 1000).toISOString() : null;
        const orderDateFormatted = rawOrderDate ? new Date(Number(rawOrderDate) * 1000).toISOString() : null;
        
        logger.info('GHN Leadtime calculated and normalized', {
          raw_leadtime: rawLeadtime,
          raw_order_date: rawOrderDate,
          delivery_date_formatted: deliveryDate,
          order_date_formatted: orderDateFormatted,
          estimated_days: estimatedDays,
          estimated_hours: hours,
          estimated_minutes: minutes,
          service_id: request.service_id,
          service_type_id: request.service_type_id,
        });
        
        console.log('\n========== GHN API - LEADTIME RESULT (NORMALIZED) ==========');
        console.log('Raw Leadtime (timestamp):', rawLeadtime);
        console.log('Delivery Date (formatted):', deliveryDate);
        console.log('Raw Order Date (timestamp):', rawOrderDate);
        console.log('Order Date (formatted):', orderDateFormatted);
        console.log('\nEstimated Delivery Time:');
        console.log('  - Days:', estimatedDays);
        console.log('  - Hours:', hours);
        console.log('  - Minutes:', minutes);
        console.log('  - Total:', `${estimatedDays} ngày ${hours} giờ ${minutes} phút`);
        console.log('==============================================================\n');
      } else {
        logger.warn('Cannot calculate leadtime - missing location info, using fallback', {
          has_from_district: !!request.from_district_id,
          has_from_ward: !!request.from_ward_code,
          has_to_district: !!request.to_district_id,
          has_to_ward: !!request.to_ward_code,
        });
        // Fallback: tính dựa trên khoảng cách
        const isSameDistrict = request.from_district_id === request.to_district_id;
        estimatedDays = isSameDistrict ? 1 : 3;
        hours = 0;
        minutes = 0;
      }
    } catch (leadtimeError: any) {
      logger.warn('Failed to calculate leadtime from GHN API, using fallback', {
        error: leadtimeError.message,
        stack: leadtimeError.stack,
      });
      // Fallback: tính dựa trên khoảng cách
      const isSameDistrict = request.from_district_id === request.to_district_id;
      estimatedDays = isSameDistrict ? 1 : 3;
      hours = 0;
      minutes = 0;
    }

    return {
      fee: result.data.total,
      estimated_days: estimatedDays,
      estimated_hours: hours,
      estimated_minutes: minutes,
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
    // NOTE: Hardcode địa chỉ để test (luôn ghi đè from_* và to_* theo yêu cầu)
    const HARD_CODED_CONTACT = {
      address: '72 Thành Thái, Phường 14, Quận 10, Hồ Chí Minh, Vietnam',
      ward_name: 'Phường 14',
      district_name: 'Quận 10',
      province_name: 'HCM',
    } as const;

    // Build request body theo tài liệu GHN API
    // Các trường bắt buộc: to_name, to_phone, to_address, to_ward_name, to_district_name, to_province_name, service_type_id, payment_type_id, required_note
    const requestBody: any = {
      // Bắt buộc - Thông tin người nhận
      to_name: request.to_name,
      to_phone: request.to_phone,
      to_address: HARD_CODED_CONTACT.address,
      to_ward_name: HARD_CODED_CONTACT.ward_name, // Bắt buộc - Tên phường/xã
      to_district_name: HARD_CODED_CONTACT.district_name, // Bắt buộc - Tên quận/huyện
      to_province_name: HARD_CODED_CONTACT.province_name, // Bắt buộc - Tên tỉnh/thành phố
      // Thông tin người gửi (from) - Luôn dùng giá trị mặc định, không lấy từ request
      from_name: request.from_name || request.to_name,
      from_phone: request.from_phone || request.to_phone,
      from_address: HARD_CODED_CONTACT.address,
      from_ward_name: HARD_CODED_CONTACT.ward_name,
      from_district_name: HARD_CODED_CONTACT.district_name,
      from_province_name: HARD_CODED_CONTACT.province_name,
      // Thông tin trả hàng (return) - Luôn dùng giá trị mặc định, không lấy từ request
      return_phone: '0332190158',
      return_address: '39 NTT',
      return_district_id: null,
      return_ward_code: '',
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
    };

    // Log request để import vào Postman
    console.log('\n========== GHN API - CREATE ORDER REQUEST ==========');
    console.log('URL:', `${config.apiUrl}/shipping-order/create`);
    console.log('Method: POST');
    console.log('\nHeaders:');
    console.log(JSON.stringify({
      'Content-Type': 'application/json',
      'Token': config.token ? `${config.token.substring(0, 8)}...` : 'NOT_SET',
      'ShopId': String(config.shopId),
    }, null, 2));
    console.log('\nRequest Body:');
    console.log(JSON.stringify(requestBody, null, 2));
    console.log('\n--- cURL Command (Full Token) ---');
    console.log(`curl --location '${config.apiUrl}/shipping-order/create' \\`);
    console.log(`  --header 'Content-Type: application/json' \\`);
    console.log(`  --header 'Token: ${config.token}' \\`);
    console.log(`  --header 'ShopId: ${config.shopId}' \\`);
    console.log(`  --data '${JSON.stringify(requestBody)}'`);
    console.log('\n--- Postman Collection JSON (Import vào Postman) ---');
    const postmanCollection = {
      info: {
        name: 'GHN API',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: [
        {
          name: 'Create Order',
          request: {
            method: 'POST',
            header: [
              { key: 'Content-Type', value: 'application/json', type: 'text' },
              { key: 'Token', value: config.token, type: 'text' },
              { key: 'ShopId', value: String(config.shopId), type: 'text' },
            ],
            body: {
              mode: 'raw',
              raw: JSON.stringify(requestBody, null, 2),
              options: {
                raw: {
                  language: 'json',
                },
              },
            },
            url: {
              raw: `${config.apiUrl}/shipping-order/create`,
              protocol: config.apiUrl.startsWith('https') ? 'https' : 'http',
              host: config.apiUrl.replace(/^https?:\/\//, '').split('/').filter(Boolean),
            },
          },
        },
      ],
    };
    console.log(JSON.stringify(postmanCollection, null, 2));
    console.log('\n--- Hướng dẫn import vào Postman ---');
    console.log('1. Copy toàn bộ JSON từ "Postman Collection JSON" ở trên');
    console.log('2. Trong Postman: File > Import > Raw text');
    console.log('3. Paste JSON và click Import');
    console.log('=====================================================\n');

    const response = await fetch(`${config.apiUrl}/shipping-order/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': config.token,
        'ShopId': String(config.shopId),
      },
      body: JSON.stringify(requestBody),
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
  leadtime: number; // Timestamp (seconds) hoặc số ngày - cần chuẩn hóa
  order_date?: string; // Ngày đặt hàng
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

    // Log raw response for debugging
    logger.info('GHN Get Services Response', {
      code: result.code,
      message: result.message,
      services_count: result.data?.length || 0,
      services: result.data?.map(s => ({
        service_id: s.service_id,
        service_type_id: s.service_type_id,
        short_name: s.short_name,
      })),
    });

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

    const responseText = await response.text();
    
    console.log('\n========== GHN API - LEADTIME RAW RESPONSE ==========');
    console.log('Status:', response.status, response.statusText);
    console.log('Response Body:', responseText);
    console.log('====================================================\n');
    
    const result = JSON.parse(responseText) as GHNResponse<GHNLeadtimeResponse>;

    if (result.code !== 200) {
      logger.error('GHN API error - Calculate Leadtime', {
        code: result.code,
        message: result.message,
      });
      throw new Error(`GHN API error: ${result.message}`);
    }

    // Log parsed response
    console.log('\n========== GHN API - LEADTIME PARSED ==========');
    console.log('Code:', result.code);
    console.log('Message:', result.message);
    console.log('\nData:');
    console.log(JSON.stringify(result.data, null, 2));
    console.log('==============================================\n');

    logger.info('GHN Leadtime API Response', {
      code: result.code,
      message: result.message,
      raw_leadtime: result.data?.leadtime,
      order_date: result.data?.order_date,
    });

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
function calculateFallbackFee(request: GHNCalculateFeeRequest): { fee: number; estimated_days: number; estimated_hours?: number; estimated_minutes?: number; service_type: string; provider: string } {
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
    estimated_hours: 0,
    estimated_minutes: 0,
    service_type: 'standard',
    provider: 'GHN (fallback)',
  };
}
