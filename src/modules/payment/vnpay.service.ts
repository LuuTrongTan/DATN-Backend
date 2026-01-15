import crypto from 'crypto';
import querystring from 'qs';
import { appConfig } from '../../connections/config/app.config';
import { logger } from '../../utils/logging';

interface VNPayConfig {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  returnUrl: string;
  ipnUrl: string;
}

// Lấy cấu hình VNPay từ biến môi trường
const getVNPayConfig = (): VNPayConfig => {
  const backendBaseUrl = process.env.BASE_URL || `http://localhost:${appConfig.port}`;
  // Trim hashSecret để loại bỏ khoảng trắng thừa (nguyên nhân phổ biến của lỗi checksum)
  const hashSecret = (process.env.VNPAY_HASH_SECRET || '').trim();
  
  // Cảnh báo nếu hashSecret có khoảng trắng thừa
  if (process.env.VNPAY_HASH_SECRET && process.env.VNPAY_HASH_SECRET !== hashSecret) {
    logger.warn('VNPay Hash Secret có khoảng trắng thừa! Đã tự động trim. Vui lòng kiểm tra file .env');
  }
  
  return {
    tmnCode: (process.env.VNPAY_TMN_CODE || '').trim(),
    hashSecret: hashSecret,
    paymentUrl: process.env.VNPAY_PAYMENT_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl: process.env.VNPAY_RETURN_URL || `${backendBaseUrl}/api/payment/vnpay/return`,
    ipnUrl: process.env.VNPAY_IPN_URL || `${backendBaseUrl}/api/payment/vnpay/ipn`,
  };
};

export interface VNPayCreateResult {
  /**
   * URL để redirect người dùng sang trang Cổng thanh toán VNPay.
   */
  paymentUrl: string;
}

/**
 * Sắp xếp object theo key để tạo query string
 * Theo code demo chuẩn VNPAY
 */
const sortObject = (obj: Record<string, any>): Record<string, any> => {
  const sorted: Record<string, any> = {};
  const str: string[] = [];
  let key: string;
  
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      str.push(encodeURIComponent(key));
    }
  }
  
  str.sort();
  
  for (let i = 0; i < str.length; i++) {
    const decodedKey = decodeURIComponent(str[i]);
    sorted[str[i]] = encodeURIComponent(obj[decodedKey]).replace(/%20/g, '+');
  }
  
  return sorted;
};

/**
 * Tạo URL thanh toán VNPay
 * @param orderId - ID đơn hàng
 * @param orderNumber - Mã đơn hàng
 * @param amount - Số tiền (VND, không có phần thập phân)
 * @param description - Mô tả đơn hàng
 * @param ipAddr - IP của khách hàng
 * @param locale - Ngôn ngữ (vn/en)
 */
export const createVNPayPaymentUrl = async (
  orderId: number,
  orderNumber: string,
  amount: number,
  description: string,
  ipAddr: string,
  locale: string = 'vn'
): Promise<VNPayCreateResult | null> => {
  const config = getVNPayConfig();

  if (!config.tmnCode || !config.hashSecret) {
    logger.warn('VNPay not configured, returning null payment URL');
    return null;
  }

  try {
    // Validate và sanitize orderNumber
    // VNPay yêu cầu vnp_TxnRef: tối đa 100 ký tự, chấp nhận chữ số, chữ cái và dấu gạch ngang
    // Giữ nguyên format orderNumber nhưng đảm bảo không có ký tự đặc biệt khác
    let sanitizedOrderNumber = orderNumber
      .replace(/[^a-zA-Z0-9-]/g, '') // Chỉ giữ chữ số, chữ cái và dấu gạch ngang
      .substring(0, 100);
    if (!sanitizedOrderNumber) {
      // Nếu sau khi sanitize mà rỗng, dùng orderId
      sanitizedOrderNumber = `ORDER${orderId}`;
    }

    // Validate amount
    if (!amount || amount <= 0) {
      logger.error('Invalid amount for VNPay', { amount, orderId, orderNumber });
      return null;
    }

    // VNPay yêu cầu số tiền phải nhân 100 (khử phần thập phân)
    // Ví dụ: 10,000 VND -> 1000000
    const vnpAmount = Math.round(amount * 100);
    if (vnpAmount <= 0) {
      logger.error('Invalid vnpAmount after calculation', { amount, vnpAmount, orderId });
      return null;
    }

    // Tạo ngày giờ theo format yyyyMMddHHmmss (GMT+7)
    // Theo code demo VNPay: sử dụng timezone 'Asia/Ho_Chi_Minh'
    // Set timezone để đảm bảo format đúng theo GMT+7
    const originalTZ = process.env.TZ;
    process.env.TZ = 'Asia/Ho_Chi_Minh';
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const vnpCreateDate = `${year}${month}${day}${hours}${minutes}${seconds}`;
    
    // Restore timezone
    if (originalTZ) {
      process.env.TZ = originalTZ;
    } else {
      delete process.env.TZ;
    }

    // Sanitize description - VNPay yêu cầu không có ký tự đặc biệt
    // Loại bỏ các ký tự không phải ASCII và giới hạn độ dài
    let sanitizedDescription = description
      .replace(/[^\x20-\x7E]/g, '') // Chỉ giữ ký tự ASCII printable (32-126)
      .replace(/[<>\"'&]/g, '') // Loại bỏ các ký tự HTML đặc biệt
      .substring(0, 255)
      .trim();
    
    // Nếu sau khi sanitize mà rỗng, dùng mô tả mặc định
    if (!sanitizedDescription) {
      sanitizedDescription = 'Thanh toan don hang';
    }

    // Validate ReturnUrl
    try {
      new URL(config.returnUrl);
    } catch (urlError) {
      logger.error('Invalid VNPay returnUrl', { returnUrl: config.returnUrl });
      return null;
    }

    // Tạo các tham số theo tài liệu VNPay (theo code demo chuẩn)
    const vnpParams: Record<string, any> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: config.tmnCode,
      vnp_Locale: locale,
      vnp_CurrCode: 'VND',
      vnp_TxnRef: sanitizedOrderNumber, // Mã tham chiếu giao dịch (đã sanitize)
      vnp_OrderInfo: sanitizedDescription, // Mô tả đã sanitize
      vnp_OrderType: 'other',
      vnp_Amount: vnpAmount.toString(),
      vnp_ReturnUrl: config.returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: vnpCreateDate,
      // Lưu ý: vnp_ExpireDate không có trong tài liệu VNPAY và code demo chuẩn
      // Nếu cần thêm vnp_BankCode (tùy chọn), thêm vào đây
    };

    // Sắp xếp các tham số theo thứ tự alphabet (theo code demo chuẩn)
    const sortedParams = sortObject(vnpParams);

    // Tạo query string không encode để tính checksum (theo code demo chuẩn)
    const signData = querystring.stringify(sortedParams, { encode: false });

    // Log signData để debug (không log hashSecret)
    logger.debug('VNPay signData for checksum', {
      signData: signData.substring(0, 200) + (signData.length > 200 ? '...' : ''),
      signDataLength: signData.length,
      paramsCount: Object.keys(sortedParams).length,
    });

    // Tạo chữ ký SHA512 (theo code demo chuẩn)
    const hmac = crypto.createHmac('sha512', config.hashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    // Thêm chữ ký vào params
    sortedParams['vnp_SecureHash'] = signed;

    // Tạo URL thanh toán với querystring.stringify (theo code demo chuẩn)
    const paymentUrl = `${config.paymentUrl}?${querystring.stringify(sortedParams, { encode: false })}`;
    
    // Debug: Log URL để kiểm tra
    logger.debug('VNPay payment URL (full)', {
      urlLength: paymentUrl.length,
      urlPreview: paymentUrl.substring(0, 300) + '...',
      hasEncodedSpaces: paymentUrl.includes('%20'),
      hasPlusSigns: paymentUrl.includes('+'),
    });

    // Log chi tiết để debug - LOG ĐẦY ĐỦ để debug lỗi checksum
    logger.info('VNPay payment URL created', {
      orderId,
      orderNumber,
      sanitizedOrderNumber,
      amount: vnpAmount,
      vnpTxnRef: sanitizedOrderNumber,
      vnpCreateDate,
      returnUrl: config.returnUrl,
      hasHashSecret: !!config.hashSecret,
      hashSecretLength: config.hashSecret?.length || 0,
      hashSecretPreview: config.hashSecret ? `${config.hashSecret.substring(0, 10)}...${config.hashSecret.substring(config.hashSecret.length - 5)}` : 'MISSING',
      secureHash: signed, // Log đầy đủ hash để debug
      signData: signData, // Log đầy đủ signData để debug
      sortedParams: sortedParams, // Log tất cả params để debug
    });

    // Log URL đầy đủ để debug (chỉ khi cần)
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_VNPAY === 'true') {
      logger.debug('VNPay payment URL full', { paymentUrl });
    } else {
      const urlPreview = paymentUrl.substring(0, 200) + '...';
      logger.debug('VNPay payment URL preview', { urlPreview });
    }

    return { paymentUrl };
  } catch (error) {
    logger.error(
      'Failed to create VNPay payment URL',
      error instanceof Error ? error : new Error(String(error)),
      { orderId, orderNumber }
    );
    return null;
  }
};

export interface VNPayCallbackVerification {
  isValid: boolean;
  orderNumber?: string;
  amount?: number;
  transactionNo?: string;
  responseCode?: string;
  transactionStatus?: string;
  bankCode?: string;
}

/**
 * Xác minh callback từ VNPay (ReturnURL và IPN)
 * @param params - Query parameters từ VNPay callback
 */
export const verifyVNPayCallback = (params: Record<string, any>): VNPayCallbackVerification => {
  const config = getVNPayConfig();
  
  if (!config.hashSecret) {
    return { isValid: false };
  }

  try {
    const vnpSecureHash = params['vnp_SecureHash'];
    
    if (!vnpSecureHash) {
      logger.warn('VNPay callback missing vnp_SecureHash');
      return { isValid: false };
    }

    // Loại bỏ vnp_SecureHash và vnp_SecureHashType khỏi params để tính toán checksum
    const fieldsToRemove = ['vnp_SecureHash', 'vnp_SecureHashType'];
    const filteredParams: Record<string, any> = {};
    
    Object.keys(params).forEach((key) => {
      if (!fieldsToRemove.includes(key)) {
        filteredParams[key] = params[key];
      }
    });

    // Sắp xếp và tạo query string (theo code demo chuẩn)
    const sortedParams = sortObject(filteredParams);
    const signData = querystring.stringify(sortedParams, { encode: false });

    // Tính toán checksum (theo code demo chuẩn)
    const hmac = crypto.createHmac('sha512', config.hashSecret);
    const calculatedHash = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    // So sánh checksum
    if (calculatedHash !== vnpSecureHash) {
      logger.warn('VNPay callback checksum mismatch', {
        calculated: calculatedHash,
        received: vnpSecureHash,
      });
      return { isValid: false };
    }

    // Lấy thông tin từ callback
    const orderNumber = params['vnp_TxnRef'];
    const amount = params['vnp_Amount'] ? parseInt(params['vnp_Amount']) / 100 : undefined; // Chia 100 để đổi về VND
    const transactionNo = params['vnp_TransactionNo'];
    const responseCode = params['vnp_ResponseCode'];
    const transactionStatus = params['vnp_TransactionStatus'];
    const bankCode = params['vnp_BankCode'];

    return {
      isValid: true,
      orderNumber,
      amount,
      transactionNo,
      responseCode,
      transactionStatus,
      bankCode,
    };
  } catch (error) {
    logger.error(
      'Error verifying VNPay callback',
      error instanceof Error ? error : new Error(String(error))
    );
    return { isValid: false };
  }
};
