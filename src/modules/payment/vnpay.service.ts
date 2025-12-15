import crypto from 'crypto';
import { appConfig } from '../../connections/config/app.config';
import { logger } from '../../utils/logging';

interface VNPayConfig {
  tmnCode: string;
  secretKey: string;
  url: string;
  returnUrl: string;
}

// Get VNPay config from environment
const getVNPayConfig = (): VNPayConfig => {
  return {
    tmnCode: process.env.VNPAY_TMN_CODE || '',
    secretKey: process.env.VNPAY_SECRET_KEY || '',
    url: process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl: process.env.VNPAY_RETURN_URL || `${appConfig.frontendUrl}/payment/callback`,
  };
};

// Create payment URL
export const createPaymentUrl = (
  orderId: number,
  orderNumber: string,
  amount: number,
  orderDescription: string,
  orderType: string = 'other',
  locale: string = 'vn',
  ipAddr: string = '127.0.0.1'
): string => {
  const config = getVNPayConfig();

  if (!config.tmnCode || !config.secretKey) {
    logger.warn('VNPay not configured, returning empty URL');
    return '';
  }

  const date = new Date();
  const createDate = date.toISOString().replace(/[-:]/g, '').split('.')[0] + '00';
  const expireDate = new Date(date.getTime() + 15 * 60 * 1000)
    .toISOString()
    .replace(/[-:]/g, '')
    .split('.')[0] + '00';

  const vnp_Params: Record<string, string> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: config.tmnCode,
    vnp_Locale: locale,
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderNumber,
    vnp_OrderInfo: orderDescription,
    vnp_OrderType: orderType,
    vnp_Amount: (amount * 100).toString(), // VNPay expects amount in cents
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate,
  };

  // Sort params and create query string
  const sortedParams = Object.keys(vnp_Params)
    .sort()
    .reduce((acc: Record<string, string>, key) => {
      acc[key] = vnp_Params[key];
      return acc;
    }, {});

  const signData = new URLSearchParams(sortedParams).toString();
  const hmac = crypto.createHmac('sha512', config.secretKey);
  const signed = hmac.update(signData, 'utf-8').digest('hex');

  vnp_Params['vnp_SecureHash'] = signed;

  const paymentUrl = `${config.url}?${new URLSearchParams(vnp_Params).toString()}`;
  
  logger.info('VNPay payment URL created', { orderNumber, amount });
  
  return paymentUrl;
};

// Verify payment callback
export const verifyPaymentCallback = (query: Record<string, string>): {
  isValid: boolean;
  orderNumber?: string;
  amount?: number;
  transactionId?: string;
  responseCode?: string;
} => {
  const config = getVNPayConfig();

  if (!config.secretKey) {
    return { isValid: false };
  }

  const vnp_SecureHash = query['vnp_SecureHash'];
  delete query['vnp_SecureHash'];
  delete query['vnp_SecureHashType'];

  // Sort params
  const sortedParams = Object.keys(query)
    .sort()
    .reduce((acc: Record<string, string>, key) => {
      if (query[key]) {
        acc[key] = query[key];
      }
      return acc;
    }, {});

  const signData = new URLSearchParams(sortedParams).toString();
  const hmac = crypto.createHmac('sha512', config.secretKey);
  const signed = hmac.update(signData, 'utf-8').digest('hex');

  if (signed !== vnp_SecureHash) {
    logger.warn('VNPay callback signature mismatch');
    return { isValid: false };
  }

  const responseCode = query['vnp_ResponseCode'];
  const orderNumber = query['vnp_TxnRef'];
  const amount = parseInt(query['vnp_Amount']) / 100; // Convert from cents
  const transactionId = query['vnp_TransactionNo'];

  // Response code '00' means success
  const isValid = responseCode === '00';

  return {
    isValid,
    orderNumber,
    amount,
    transactionId,
    responseCode,
  };
};


