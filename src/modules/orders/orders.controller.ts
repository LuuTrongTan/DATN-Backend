import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { orderSchema } from './orders.validation';
import { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } from '../../utils/email.service';
import { createShippingRecord } from '../shipping/shipping.service';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import { appConfig } from '../../connections/config/app.config';

// UC-12: Đặt hàng
export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    const validated = orderSchema.parse(req.body);
    const userId = req.user!.id;

    // Get cart items
    const cartItems = await pool.query(
      `SELECT ci.*, p.price, p.stock_quantity as product_stock,
       pv.price_adjustment, pv.stock_quantity as variant_stock
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       LEFT JOIN product_variants pv ON ci.variant_id = pv.id
       WHERE ci.user_id = $1`,
      [userId]
    );

    if (cartItems.rows.length === 0) {
      return ResponseHandler.error(res, 'Giỏ hàng trống', 400);
    }

    // Check stock and calculate total
    let totalAmount = 0;
    const orderItems: any[] = [];

    for (const item of cartItems.rows) {
      const availableStock = item.variant_id ? item.variant_stock : item.product_stock;
      
      if (item.quantity > availableStock) {
        return ResponseHandler.error(res, `Sản phẩm ${item.product_id} không đủ số lượng`, 400, {
          code: 'INSUFFICIENT_STOCK',
          details: { productId: item.product_id, available: availableStock, requested: item.quantity },
        });
      }

      const itemPrice = item.price + (item.price_adjustment || 0);
      const itemTotal = itemPrice * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        price: itemPrice,
      });
    }


    // Calculate shipping fee (simplified - will be replaced by shipping service)
    const defaultShippingFee = parseInt(process.env.DEFAULT_SHIPPING_FEE || '30000');
    const shippingFee = validated.shipping_fee || defaultShippingFee;

    // Create order with transaction
    const orderNumber = `ORD-${Date.now()}-${userId}`;
    const finalAmount = totalAmount + shippingFee;
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create order
      const orderResult = await client.query(
        `INSERT INTO orders (user_id, order_number, total_amount, shipping_address, 
          payment_method, shipping_fee, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, user_id, order_number, total_amount, order_status, payment_status, shipping_address, payment_method, shipping_fee, notes, created_at, updated_at`,
        [
          userId,
          orderNumber,
          finalAmount,
          validated.shipping_address,
          validated.payment_method,
          shippingFee,
          validated.notes || null,
        ]
      );

      const order = orderResult.rows[0];

      // Create order items and update stock
      for (const item of orderItems) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, variant_id, quantity, price)
           VALUES ($1, $2, $3, $4, $5)`,
          [order.id, item.product_id, item.variant_id, item.quantity, item.price]
        );

        // Get current stock before update
        let currentStock: number;
        if (item.variant_id) {
          const stockResult = await client.query(
            'SELECT stock_quantity FROM product_variants WHERE id = $1',
            [item.variant_id]
          );
          currentStock = parseInt(stockResult.rows[0].stock_quantity);
        } else {
          const stockResult = await client.query(
            'SELECT stock_quantity FROM products WHERE id = $1',
            [item.product_id]
          );
          currentStock = parseInt(stockResult.rows[0].stock_quantity);
        }

        const newStock = currentStock - item.quantity;

        // Update stock (will be finalized after payment confirmation)
        if (item.variant_id) {
          await client.query(
            'UPDATE product_variants SET stock_quantity = $1 WHERE id = $2',
            [newStock, item.variant_id]
          );
        } else {
          await client.query(
            'UPDATE products SET stock_quantity = $1 WHERE id = $2',
            [newStock, item.product_id]
          );
        }

        // Create stock history
        await client.query(
          `INSERT INTO stock_history (product_id, variant_id, type, quantity, previous_stock, new_stock, reason, created_by)
           VALUES ($1, $2, 'out', $3, $4, $5, $6, $7)`,
          [
            item.product_id,
            item.variant_id || null,
            item.quantity,
            currentStock,
            newStock,
            `Đơn hàng #${order.order_number}`,
            userId,
          ]
        );
      }

      // Clear cart
      await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

      await client.query('COMMIT');

      // Create shipping record (outside transaction - non-critical)
      try {
        await createShippingRecord(pool, {
          order_id: order.id,
          shipping_fee: shippingFee,
          shipping_provider: 'GHTK',
        });
      } catch (error) {
        // Log error but don't fail order creation
        logger.error('Error creating shipping record', error instanceof Error ? error : new Error(String(error)), {
          orderId: order.id,
          orderNumber: order.order_number,
        });
      }

    // Handle payment
    // For online payment, return payment URL in response
    // For COD, order is already created with pending payment status

      // Get user info for email
      const userResult = await pool.query(
        'SELECT email, full_name FROM users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];

      // Get product names for email
      const productIds = orderItems.map(item => item.product_id);
      const productsResult = await pool.query(
        `SELECT id, name FROM products WHERE id = ANY($1::int[])`,
        [productIds]
      );
      const productsMap = new Map(productsResult.rows.map(p => [p.id, p.name]));

      // Send order confirmation email
      if (user.email) {
        try {
          await sendOrderConfirmationEmail({
            orderNumber: order.order_number,
            customerName: user.full_name || 'Khách hàng',
            customerEmail: user.email,
            orderDate: new Date(order.created_at).toLocaleString('vi-VN'),
            totalAmount: parseFloat(order.total_amount),
            shippingAddress: validated.shipping_address,
            paymentMethod: validated.payment_method,
            items: orderItems.map(item => ({
              productName: productsMap.get(item.product_id) || 'Sản phẩm',
              quantity: item.quantity,
              price: item.price,
            })),
          });
        } catch (error: any) {
          // Log error but don't fail the request
          logger.error('Failed to send order confirmation email', error instanceof Error ? error : new Error(String(error)), {
            orderId: order.id,
            orderNumber: order.order_number,
            email: user.email,
          });
        }
      }

      // Prepare response
      const responseData: any = {
        order: {
          ...order,
          items: orderItems,
        },
      };

      // If online payment, create payment URL
      if (validated.payment_method === 'online') {
        try {
          const { createPaymentUrl } = require('../payment/vnpay.service');
          const paymentUrl = createPaymentUrl(
            order.id,
            order.order_number,
          parseFloat(finalAmount.toString()),
          `Thanh toan don hang ${order.order_number}`,
          'other',
          'vn',
          req.ip || '127.0.0.1'
        );

          if (paymentUrl) {
            responseData.payment_url = paymentUrl;
          }
        } catch (error) {
          // VNPay not configured, continue without payment URL
          logger.error('Error creating payment URL', error instanceof Error ? error : new Error(String(error)), {
            orderId: order.id,
            orderNumber: order.order_number,
          });
        }
      }

      return ResponseHandler.created(res, responseData, 'Đặt hàng thành công');
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.validationError(res, error.errors);
    }
    const userId = req.user?.id;
    logger.error('Error creating order', error instanceof Error ? error : new Error(String(error)), {
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, error.message || 'Lỗi khi đặt hàng', error);
  }
};

// UC-13: Theo dõi đơn hàng
export const getOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { status } = req.query;

    let query = `
      SELECT o.*, 
      (SELECT json_agg(json_build_object(
        'id', oi.id,
        'product_id', oi.product_id,
        'quantity', oi.quantity,
        'price', oi.price
      )) FROM order_items oi WHERE oi.order_id = o.id) as items
      FROM orders o
      WHERE o.user_id = $1
    `;
    const params: any[] = [userId];

    if (status) {
      query += ' AND o.order_status = $2';
      params.push(status);
    }

    query += ' ORDER BY o.created_at DESC';

    const result = await pool.query(query, params);

    return ResponseHandler.success(res, { orders: result.rows }, 'Lấy danh sách đơn hàng thành công');
  } catch (error: any) {
    logger.error('Error fetching orders', error instanceof Error ? error : new Error(String(error)), {
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách đơn hàng', error);
  }
};

export const getOrderById = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    const result = await pool.query(
      `SELECT o.*,
       (SELECT json_agg(json_build_object(
         'id', oi.id,
         'product_id', oi.product_id,
         'product_name', p.name,
         'quantity', oi.quantity,
         'price', oi.price
       )) FROM order_items oi 
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = o.id) as items,
       (SELECT json_agg(json_build_object(
         'status', osh.status,
         'notes', osh.notes,
         'created_at', osh.created_at
       )) FROM order_status_history osh 
       WHERE osh.order_id = o.id ORDER BY osh.created_at DESC) as status_history
       FROM orders o
       WHERE o.id = $1 AND o.user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại');
    }

    return ResponseHandler.success(res, { order: result.rows[0] }, 'Lấy thông tin đơn hàng thành công');
  } catch (error: any) {
    logger.error('Error fetching order', error instanceof Error ? error : new Error(String(error)), {
      orderId: id,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin đơn hàng', error);
  }
};

