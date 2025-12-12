import { pool } from '../connections';
import nodemailer from 'nodemailer';
import { emailConfig } from '../connections/config/app.config';
import { logger } from './logging';

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

