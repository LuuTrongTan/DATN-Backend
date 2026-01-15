import crypto from 'crypto';
import querystring from 'querystring';
import { appConfig } from '../../connections/config/app.config';
import { logger } from '../../utils/logging';

/**
 * Mock VNPay Service - Dùng để test local mà không cần expose ra internet
 * 
 * Service này tạo URL mock và simulate VNPay callback để test flow thanh toán
 * mà không cần kết nối thực tế với VNPay sandbox.
 */

interface MockVNPayConfig {
  returnUrl: string;
  ipnUrl: string;
  hashSecret: string;
}

/**
 * Lấy cấu hình mock VNPay
 */
const getMockVNPayConfig = (): MockVNPayConfig => {
  const backendBaseUrl = process.env.BASE_URL || `http://localhost:${appConfig.port}`;
  return {
    returnUrl: `${backendBaseUrl}/api/payment/vnpay/return`,
    ipnUrl: `${backendBaseUrl}/api/payment/vnpay/ipn`,
    hashSecret: process.env.VNPAY_HASH_SECRET || 'mock_hash_secret_for_testing',
  };
};

/**
 * Sắp xếp object theo key để tạo query string
 */
const sortObject = (obj: Record<string, any>): Record<string, any> => {
  const sorted: Record<string, any> = {};
  const keys = Object.keys(obj).sort();
  keys.forEach((key) => {
    sorted[key] = obj[key];
  });
  return sorted;
};

/**
 * Tạo query string không encode (dùng để tính checksum)
 */
const stringifyWithoutEncode = (obj: Record<string, any>): string => {
  return Object.keys(obj)
    .map((key) => `${key}=${obj[key]}`)
    .join('&');
};

/**
 * Tạo chữ ký SHA512 giống VNPay
 */
const createSecureHash = (params: Record<string, any>, hashSecret: string): string => {
  const sortedParams = sortObject(params);
  const signData = stringifyWithoutEncode(sortedParams);
  const hmac = crypto.createHmac('sha512', hashSecret);
  return hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
};

/**
 * Tạo URL mock để test local
 * URL này sẽ redirect về mock payment page thay vì VNPay thật
 */
export const createMockVNPayPaymentUrl = (
  orderId: number,
  orderNumber: string,
  amount: number,
  description: string,
  success: boolean = true // true = thanh toán thành công, false = thất bại
): string => {
  const config = getMockVNPayConfig();
  const backendBaseUrl = process.env.BASE_URL || `http://localhost:${appConfig.port}`;
  
  // Tạo URL mock payment page
  const mockPaymentUrl = `${backendBaseUrl}/api/payment/vnpay/mock-payment`;
  
  // Tạo các tham số để pass qua mock page
  const params: Record<string, any> = {
    orderId: orderId.toString(),
    orderNumber,
    amount: amount.toString(),
    description,
    success: success.toString(),
  };
  
  const queryString = querystring.stringify(params);
  return `${mockPaymentUrl}?${queryString}`;
};

/**
 * Tạo callback data giống VNPay để test
 */
export const createMockVNPayCallback = (
  orderNumber: string,
  amount: number,
  success: boolean = true
): Record<string, any> => {
  const config = getMockVNPayConfig();
  
  // Tạo ngày giờ theo format yyyyMMddHHmmss
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const vnpCreateDate = `${year}${month}${day}${hours}${minutes}${seconds}`;
  
  // Tạo các tham số giống VNPay
  const vnpParams: Record<string, any> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: 'MOCK_TMN_CODE',
    vnp_Amount: Math.round(amount * 100).toString(), // Nhân 100
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderNumber,
    vnp_OrderInfo: 'Thanh toan don hang',
    vnp_OrderType: 'other',
    vnp_Locale: 'vn',
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: '127.0.0.1',
    vnp_CreateDate: vnpCreateDate,
    vnp_TransactionNo: `MOCK${Date.now()}`,
    vnp_ResponseCode: success ? '00' : '07', // 00 = thành công, 07 = thất bại
    vnp_TransactionStatus: success ? '00' : '02',
    vnp_BankCode: 'NCB',
  };
  
  // Tạo chữ ký
  const secureHash = createSecureHash(vnpParams, config.hashSecret);
  vnpParams['vnp_SecureHash'] = secureHash;
  
  return vnpParams;
};

/**
 * Log mock payment info
 */
export const logMockPayment = (
  orderId: number,
  orderNumber: string,
  amount: number,
  success: boolean
): void => {
  logger.info('Mock VNPay payment created', {
    orderId,
    orderNumber,
    amount,
    success,
    note: 'This is a mock payment for local testing. No real payment is processed.',
  });
};
