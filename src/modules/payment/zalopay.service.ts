import crypto from 'crypto';
import https from 'https';
import { URL } from 'url';
import { appConfig } from '../../connections/config/app.config';
import { logger } from '../../utils/logging';

interface ZaloPayConfig {
  appId: string;
  key1: string;
  key2: string;
  endpoint: string;
  returnUrl: string;
}

// Lấy cấu hình ZaloPay từ biến môi trường
const getZaloPayConfig = (): ZaloPayConfig => {
  const backendBaseUrl = process.env.BASE_URL || `http://localhost:${appConfig.port}`;
  return {
    appId: process.env.ZALOPAY_APP_ID || '',
    key1: process.env.ZALOPAY_KEY1 || '',
    key2: process.env.ZALOPAY_KEY2 || '',
    endpoint: process.env.ZALOPAY_SANDBOX_ENDPOINT || 'https://sbgateway.zalopay.vn',
    returnUrl: process.env.ZALOPAY_RETURN_URL || `${backendBaseUrl}/api/payment/zalopay/callback`,
  };
};

export interface ZaloPayCreateResult {
  /**
   * URL để redirect người dùng sang trang Cổng thanh toán ZaloPay.
   */
  paymentUrl: string;
  /**
   * Mã QR đa năng (VietQR) nếu merchant muốn tự render QR.
   */
  qrCode?: string;
}

/**
 * Tạo đơn thanh toán ZaloPay qua Cổng Website (Website - Cổng) theo tài liệu v2.
 * Gọi API `/v2/create` của ZaloPay, nhận về `order_url` (Cổng ZaloPay) và `qr_code` (VietQR đa năng).
 */
export const createZaloPayOrder = async (
  orderId: number,
  orderNumber: string,
  amount: number,
  description: string,
  userId: string | number
): Promise<ZaloPayCreateResult | null> => {
  const config = getZaloPayConfig();

  if (!config.appId || !config.key1 || !config.key2) {
    logger.warn('ZaloPay not configured, returning null payment URL');
    return null;
  }

  // app_trans_id thường có format yyMMdd_random (theo tài liệu ZaloPay v2).
  const now = new Date();
  const datePrefix = now.toISOString().slice(2, 10).replace(/-/g, ''); // yyMMdd
  const appTransId = `${datePrefix}_${orderId}`;

  // Payload tạo đơn trên Cổng ZaloPay (Website - Cổng) theo tài liệu v2
  // Tham khảo cấu trúc tổng quát tại developers.zalopay.vn
  const payload: Record<string, any> = {
    app_id: config.appId,
    app_trans_id: appTransId,
    app_time: now.getTime(),
    app_user: String(userId),
    amount: Math.round(amount),
    item: '[]',
    description,
    embed_data: JSON.stringify({
      redirecturl: config.returnUrl,
      orderNumber,
    }),
    bank_code: '',
    callback_url: config.returnUrl,
  };

  try {
    // MAC theo chuẩn ZaloPay v2:
    // mac = HMAC_SHA256(key1, app_id|app_trans_id|app_user|amount|app_time|embed_data|item)
    const dataToSign = [
      payload.app_id,
      payload.app_trans_id,
      payload.app_user,
      payload.amount,
      payload.app_time,
      payload.embed_data,
      payload.item,
    ].join('|');

    const mac = crypto.createHmac('sha256', config.key1).update(dataToSign).digest('hex');

    const body = JSON.stringify({ ...payload, mac });

    const createUrl = new URL('/v2/create', config.endpoint);

    const options: https.RequestOptions = {
      method: 'POST',
      hostname: createUrl.hostname,
      path: createUrl.pathname,
      port: createUrl.port || 443,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const responseBody = await postJson(options, body);
    const parsed = JSON.parse(responseBody);

    if (parsed.return_code !== 1) {
      logger.warn('ZaloPay create order failed', {
        orderId,
        orderNumber,
        appTransId,
        return_code: parsed.return_code,
        return_message: parsed.return_message,
        sub_return_code: parsed.sub_return_code,
        sub_return_message: parsed.sub_return_message,
      });
      return null;
    }

    const paymentUrl: string | undefined = parsed.order_url;
    const qrCode: string | undefined = parsed.qr_code;

    if (!paymentUrl) {
      logger.warn('ZaloPay create order succeeded but missing order_url', {
        orderId,
        orderNumber,
        appTransId,
      });
      return null;
    }

    logger.info('ZaloPay payment URL created', {
      orderId,
      orderNumber,
      appTransId,
      amount,
    });

    return { paymentUrl, qrCode };
  } catch (error) {
    logger.error(
      'Failed to create ZaloPay payment URL',
      error instanceof Error ? error : new Error(String(error)),
      { orderId, orderNumber }
    );
    return null;
  }
};

/**
 * Gửi POST JSON tới ZaloPay bằng https và trả về body (Promise).
 */
const postJson = (options: https.RequestOptions, body: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString('utf8');
        resolve(responseBody);
      });
    });

    req.on('error', err => reject(err));
    req.write(body);
    req.end();
  });
};

export interface ZaloPayCallbackVerification {
  isValid: boolean;
  orderNumber?: string;
  amount?: number;
  transactionId?: string;
  returnCode?: number;
}

/**
 * Xác minh callback từ ZaloPay.
 *
 * Lưu ý: Tùy theo format callback (body/query) của ZaloPay, cần điều chỉnh field tương ứng.
 * Ở đây chỉ là skeleton cho sandbox.
 */
export const verifyZaloPayCallback = (payload: Record<string, any>): ZaloPayCallbackVerification => {
  const config = getZaloPayConfig();
  if (!config.key2) {
    return { isValid: false };
  }

  try {
    // Ví dụ callback có trường data và mac, trong đó data là JSON string.
    const data = payload.data as string | undefined;
    const mac = payload.mac as string | undefined;

    if (!data || !mac) {
      logger.warn('ZaloPay callback missing data or mac');
      return { isValid: false };
    }

    const calculatedMac = crypto.createHmac('sha256', config.key2).update(data).digest('hex');
    if (calculatedMac !== mac) {
      logger.warn('ZaloPay callback MAC mismatch');
      return { isValid: false };
    }

    const parsed = JSON.parse(data);
    const returnCode = typeof parsed.return_code === 'number' ? parsed.return_code : undefined;
    const orderNumber = parsed.app_order_id || parsed.orderNumber;
    const amount = typeof parsed.amount === 'number' ? parsed.amount : undefined;
    const transactionId = parsed.zp_trans_id ? String(parsed.zp_trans_id) : undefined;

    return {
      isValid: true,
      orderNumber,
      amount,
      transactionId,
      returnCode,
    };
  } catch (error) {
    logger.error(
      'Error verifying ZaloPay callback',
      error instanceof Error ? error : new Error(String(error))
    );
    return { isValid: false };
  }
};

