import { pool } from '../connections';
import nodemailer from 'nodemailer';
import { emailConfig } from '../connections/config/app.config';
import { logger } from './logging';

// Helper function to check and send low stock alert
export const checkAndSendLowStockAlert = async (
  productId: number,
  variantId: number | null | undefined,
  newStock: number,
  threshold: number = 10
): Promise<void> => {
  // Only send alert if stock is below threshold
  if (newStock >= threshold) {
    return;
  }

  try {
    // Get product info
    const productResult = await pool.query(
      `SELECT id, name, sku FROM products WHERE id = $1 AND deleted_at IS NULL`,
      [productId]
    );

    if (productResult.rows.length === 0) {
      return;
    }

    const product = productResult.rows[0];
    let variantAttributes: Record<string, string> | undefined;

    // If variant, get variant info
    if (variantId) {
      const variantResult = await pool.query(
        `SELECT variant_attributes FROM product_variants WHERE id = $1 AND deleted_at IS NULL`,
        [variantId]
      );

      if (variantResult.rows.length > 0) {
        const attrs = variantResult.rows[0].variant_attributes;
        variantAttributes = typeof attrs === 'string' ? JSON.parse(attrs) : attrs;
      }
    }

    // Send alert email
    await sendLowStockAlertEmail({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      variantId: variantId || undefined,
      variantAttributes,
      currentStock: newStock,
      threshold,
    });
  } catch (error: any) {
    // Log error but don't fail the operation
    logger.error('Error checking low stock alert', error instanceof Error ? error : new Error(String(error)), {
      productId,
      variantId,
      newStock,
    });
  }
};

const transporter = nodemailer.createTransport({
  host: emailConfig.host,
  port: emailConfig.port,
  secure: false,
  auth: {
    user: emailConfig.user,
    pass: emailConfig.pass,
  },
});

interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  orderDate: string;
  totalAmount: number;
  shippingAddress: string;
  paymentMethod: string;
  items: Array<{
    productName: string;
    quantity: number;
    price: number;
  }>;
}

// Send order confirmation email
export const sendOrderConfirmationEmail = async (data: OrderEmailData): Promise<void> => {
  if (!emailConfig.user || !emailConfig.pass) {
    logger.warn('Email not configured, skipping order confirmation email', { orderNumber: data.orderNumber });
    return;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px;">
        Xác nhận đơn hàng #${data.orderNumber}
      </h2>
      
      <p>Xin chào <strong>${data.customerName}</strong>,</p>
      <p>Cảm ơn bạn đã đặt hàng tại cửa hàng của chúng tôi!</p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #667eea;">Thông tin đơn hàng</h3>
        <p><strong>Mã đơn hàng:</strong> #${data.orderNumber}</p>
        <p><strong>Ngày đặt:</strong> ${data.orderDate}</p>
        <p><strong>Phương thức thanh toán:</strong> ${data.paymentMethod === 'cod' ? 'Thanh toán khi nhận hàng (COD)' : 'Thanh toán online'}</p>
        <p><strong>Tổng tiền:</strong> <span style="color: #cf1322; font-size: 18px; font-weight: bold;">${data.totalAmount.toLocaleString('vi-VN')} VNĐ</span></p>
      </div>
      
      <div style="margin: 20px 0;">
        <h3 style="color: #667eea;">Địa chỉ giao hàng</h3>
        <p style="background: #f9f9f9; padding: 10px; border-radius: 5px;">${data.shippingAddress}</p>
      </div>
      
      <div style="margin: 20px 0;">
        <h3 style="color: #667eea;">Chi tiết sản phẩm</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #667eea; color: white;">
              <th style="padding: 10px; text-align: left;">Sản phẩm</th>
              <th style="padding: 10px; text-align: center;">Số lượng</th>
              <th style="padding: 10px; text-align: right;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${data.items.map(item => `
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 10px;">${item.productName}</td>
                <td style="padding: 10px; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; text-align: right;">${(item.price * item.quantity).toLocaleString('vi-VN')} VNĐ</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        Chúng tôi sẽ gửi email cập nhật khi đơn hàng của bạn thay đổi trạng thái.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"XGame Store" <${emailConfig.user}>`,
      to: data.customerEmail,
      subject: `Xác nhận đơn hàng #${data.orderNumber}`,
      html,
    });
    logger.info('Order confirmation email sent successfully', { orderNumber: data.orderNumber, email: data.customerEmail });
  } catch (error: any) {
    logger.error('Failed to send order confirmation email', { orderNumber: data.orderNumber, error: error.message });
    // Don't throw error, just log it
  }
};

// Send order status update email
export const sendOrderStatusUpdateEmail = async (
  customerEmail: string,
  customerName: string,
  orderNumber: string,
  status: string,
  notes?: string
): Promise<void> => {
  if (!emailConfig.user || !emailConfig.pass) {
    logger.warn('Email not configured, skipping order status update email', { orderNumber });
    return;
  }

  const statusLabels: Record<string, string> = {
    pending: 'Chờ xác nhận',
    confirmed: 'Đã xác nhận',
    processing: 'Đang xử lý',
    shipping: 'Đang giao hàng',
    delivered: 'Đã giao hàng',
    cancelled: 'Đã hủy',
  };

  const statusLabel = statusLabels[status] || status;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px;">
        Cập nhật đơn hàng #${orderNumber}
      </h2>
      
      <p>Xin chào <strong>${customerName}</strong>,</p>
      <p>Đơn hàng của bạn đã được cập nhật trạng thái:</p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
        <h3 style="margin: 0; color: #667eea; font-size: 24px;">${statusLabel}</h3>
      </div>
      
      ${notes ? `<p><strong>Ghi chú:</strong> ${notes}</p>` : ''}
      
      <p>Bạn có thể theo dõi đơn hàng của mình tại trang <a href="${process.env.FRONTEND_URL}/orders/${orderNumber}" style="color: #667eea;">đơn hàng của tôi</a>.</p>
      
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        Cảm ơn bạn đã mua sắm tại cửa hàng của chúng tôi!
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"XGame Store" <${emailConfig.user}>`,
      to: customerEmail,
      subject: `Cập nhật đơn hàng #${orderNumber} - ${statusLabel}`,
      html,
    });
    logger.info('Order status update email sent successfully', { orderNumber, status, email: customerEmail });
  } catch (error: any) {
    logger.error('Failed to send order status update email', { orderNumber, error: error.message });
  }
};

// Send low stock alert email to admin
interface LowStockAlertData {
  productId: number;
  productName: string;
  sku?: string;
  variantId?: number;
  variantAttributes?: Record<string, string>;
  currentStock: number;
  threshold: number;
}

export const sendLowStockAlertEmail = async (data: LowStockAlertData): Promise<void> => {
  if (!emailConfig.user || !emailConfig.pass) {
    logger.warn('Email not configured, skipping low stock alert email', { productId: data.productId });
    return;
  }

  // Get admin emails from database
  const adminEmails = await pool.query(
    `SELECT email FROM users WHERE role = 'admin' AND status = 'active' AND email IS NOT NULL`,
    []
  );

  if (adminEmails.rows.length === 0) {
    logger.warn('No admin emails found for low stock alert', { productId: data.productId });
    return;
  }

  const recipientEmails = adminEmails.rows.map((row: any) => row.email).filter(Boolean);

  if (recipientEmails.length === 0) {
    logger.warn('No valid admin emails found for low stock alert', { productId: data.productId });
    return;
  }

  const variantInfo = data.variantId
    ? `<p><strong>Biến thể:</strong> ${data.variantAttributes ? Object.entries(data.variantAttributes).map(([k, v]) => `${k}: ${v}`).join(', ') : `ID: ${data.variantId}`}</p>`
    : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #cf1322; border-bottom: 2px solid #cf1322; padding-bottom: 10px;">
        ⚠️ Cảnh báo: Tồn kho thấp
      </h2>
      
      <p>Xin chào Admin,</p>
      <p>Sản phẩm sau đây có tồn kho thấp hơn ngưỡng cảnh báo (<strong>${data.threshold}</strong> sản phẩm):</p>
      
      <div style="background: #fff2f0; border-left: 4px solid #cf1322; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #cf1322;">Thông tin sản phẩm</h3>
        <p><strong>Tên sản phẩm:</strong> ${data.productName}</p>
        ${data.sku ? `<p><strong>SKU:</strong> ${data.sku}</p>` : ''}
        ${variantInfo}
        <p><strong>ID sản phẩm:</strong> ${data.productId}</p>
        <p style="font-size: 18px; margin-top: 15px;">
          <strong style="color: #cf1322;">Tồn kho hiện tại: ${data.currentStock}</strong>
        </p>
      </div>
      
      <p style="background: #fffbe6; padding: 10px; border-radius: 5px; border-left: 4px solid #faad14;">
        <strong>⚠️ Lưu ý:</strong> Vui lòng kiểm tra và nhập thêm hàng để đảm bảo không bị hết hàng.
      </p>
      
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        Email này được gửi tự động từ hệ thống quản lý kho hàng.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"XGame Store - Hệ thống" <${emailConfig.user}>`,
      to: recipientEmails.join(', '),
      subject: `⚠️ Cảnh báo: Tồn kho thấp - ${data.productName}`,
      html,
    });
    logger.info('Low stock alert email sent successfully', { 
      productId: data.productId, 
      variantId: data.variantId,
      currentStock: data.currentStock,
      recipientCount: recipientEmails.length 
    });
  } catch (error: any) {
    logger.error('Failed to send low stock alert email', { 
      productId: data.productId, 
      error: error.message 
    });
  }
};


