import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { orderSchema } from './orders.validation';
import { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail, checkAndSendLowStockAlert } from '../../utils/email.service';
import { createShippingRecord } from '../shipping/shipping.service';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';
import { appConfig } from '../../connections/config/app.config';
import { ORDER_STATUS, PAYMENT_STATUS, generateOrderNumber } from '../../constants';
import { createNotification } from '../notifications/notifications.controller';

// UC-12: Đặt hàng
export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    const validated = orderSchema.parse(req.body);
    const userId = req.user!.id;

    // Get cart items (only active products)
    const cartItems = await pool.query(
      `SELECT ci.*,
       p.price,
       p.name as product_name,
       p.sku as product_sku,
       p.stock_quantity as product_stock,
       pv.price_adjustment,
       pv.stock_quantity as variant_stock,
       pv.sku as variant_sku,
       pv.variant_attributes
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id AND p.deleted_at IS NULL AND p.is_active = TRUE
       LEFT JOIN product_variants pv ON ci.variant_id = pv.id AND pv.deleted_at IS NULL AND pv.is_active = TRUE
       WHERE ci.user_id = $1`,
      [userId]
    );

    if (cartItems.rows.length === 0) {
      return ResponseHandler.error(res, 'Giỏ hàng trống', 400);
    }

    // Get user info for order
    const userResult = await pool.query(
      'SELECT full_name, phone, email FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    // Check stock and calculate totals
    let subtotal = 0;
    const orderItems: any[] = [];

    for (const item of cartItems.rows) {
      // Kiểm tra sản phẩm/biến thể còn tồn tại và còn hoạt động
      if (item.variant_id) {
        // Có variant_id nhưng join không ra bản ghi hợp lệ
        if (item.variant_stock === null || item.variant_stock === undefined) {
          return ResponseHandler.error(
            res,
            `Biến thể của sản phẩm ${item.product_id} không tồn tại hoặc đã vô hiệu hóa`,
            400,
            {
              code: 'VARIANT_NOT_FOUND_OR_INACTIVE',
              details: {
                productId: item.product_id,
                variantId: item.variant_id,
              },
            }
          );
        }
      } else {
        // Không có variant_id, nhưng product_stock không có => sản phẩm không hợp lệ
        if (item.product_stock === null || item.product_stock === undefined) {
          return ResponseHandler.error(
            res,
            `Sản phẩm ${item.product_id} không tồn tại hoặc đã vô hiệu hóa`,
            400,
            {
              code: 'PRODUCT_NOT_FOUND_OR_INACTIVE',
              details: {
                productId: item.product_id,
              },
            }
          );
        }
      }

      const availableStock = item.variant_id ? item.variant_stock : item.product_stock;

      if (availableStock === null || availableStock === undefined) {
        return ResponseHandler.error(
          res,
          `Không thể xác định tồn kho cho sản phẩm ${item.product_id}`,
          400,
          {
            code: 'STOCK_NOT_AVAILABLE',
            details: {
              productId: item.product_id,
              variantId: item.variant_id,
            },
          }
        );
      }

      if (item.quantity > availableStock) {
        return ResponseHandler.error(res, `Sản phẩm ${item.product_id} không đủ số lượng`, 400, {
          code: 'INSUFFICIENT_STOCK',
          details: { productId: item.product_id, available: availableStock, requested: item.quantity },
        });
      }

      const itemPrice = item.price + (item.price_adjustment || 0);
      const itemTotal = itemPrice * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku,
        variant_id: item.variant_id,
        variant_sku: item.variant_sku,
        variant_attributes_snapshot: item.variant_attributes,
        quantity: item.quantity,
        price: itemPrice,
      });
    }

    // Calculate fees and totals
    const defaultShippingFee = parseInt(process.env.DEFAULT_SHIPPING_FEE || '30000');
    const shippingFee = validated.shipping_fee || defaultShippingFee;
    const discountAmount = validated.discount_amount || 0;
    const taxAmount = validated.tax_amount || 0;
    const totalAmount = subtotal + shippingFee - discountAmount + taxAmount;

    // Generate order number using constant function
    const orderNumber = generateOrderNumber(userId);
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create order with all required fields from schema
      const orderResult = await client.query(
        `INSERT INTO orders (
          user_id, order_number,
          subtotal, discount_amount, tax_amount, shipping_fee, total_amount,
          shipping_address, payment_method, payment_status, order_status, notes
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, user_id, order_number,
          subtotal, discount_amount, tax_amount, shipping_fee, total_amount,
          order_status, payment_status, shipping_address, payment_method, notes, created_at, updated_at`,
        [
          userId,
          orderNumber,
          subtotal,
          discountAmount,
          taxAmount,
          shippingFee,
          totalAmount,
          validated.shipping_address,
          validated.payment_method,
          PAYMENT_STATUS.PENDING,
          ORDER_STATUS.PENDING,
          validated.notes || null,
        ]
      );

      const order = orderResult.rows[0];

      // Create order items and update stock
      for (const item of orderItems) {
        await client.query(
          `INSERT INTO order_items (
             order_id,
             product_id,
             product_name,
             product_sku,
             variant_id,
             variant_sku,
             variant_attributes_snapshot,
             quantity,
             price
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
          [
            order.id,
            item.product_id,
            item.product_name,
            item.product_sku,
            item.variant_id,
            item.variant_sku,
            item.variant_attributes_snapshot ? JSON.stringify(item.variant_attributes_snapshot) : null,
            item.quantity,
            item.price,
          ]
        );

        // Get current stock before update (check soft delete)
        let currentStock: number;
        if (item.variant_id) {
          const stockResult = await client.query(
            'SELECT stock_quantity FROM product_variants WHERE id = $1 AND deleted_at IS NULL',
            [item.variant_id]
          );
          if (stockResult.rows.length === 0) {
            throw new Error(`Variant ${item.variant_id} không tồn tại hoặc đã bị xóa`);
          }
          currentStock = parseInt(stockResult.rows[0].stock_quantity);
        } else {
          const stockResult = await client.query(
            'SELECT stock_quantity FROM products WHERE id = $1 AND deleted_at IS NULL',
            [item.product_id]
          );
          if (stockResult.rows.length === 0) {
            throw new Error(`Product ${item.product_id} không tồn tại hoặc đã bị xóa`);
          }
          currentStock = parseInt(stockResult.rows[0].stock_quantity);
        }

        const newStock = currentStock - item.quantity;

        // Update stock (will be finalized after payment confirmation)
        if (item.variant_id) {
          await client.query(
            'UPDATE product_variants SET stock_quantity = $1 WHERE id = $2',
            [newStock, item.variant_id]
          );
          // Check and send low stock alert (outside transaction)
          checkAndSendLowStockAlert(item.product_id, item.variant_id, newStock, 10).catch(err => {
            logger.error('Failed to check low stock alert', err instanceof Error ? err : new Error(String(err)));
          });
        } else {
          await client.query(
            'UPDATE products SET stock_quantity = $1 WHERE id = $2',
            [newStock, item.product_id]
          );
          // Check and send low stock alert (outside transaction)
          checkAndSendLowStockAlert(item.product_id, null, newStock, 10).catch(err => {
            logger.error('Failed to check low stock alert', err instanceof Error ? err : new Error(String(err)));
          });
        }

      }

      // Clear cart
      await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

      await client.query('COMMIT');

      // Create shipping record (outside transaction - non-critical)
      try {
        await createShippingRecord(pool, {
          order_id: order.id,
          shipping_fee: shippingFee,
          shipping_provider: 'GHN',
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

      // User info already fetched above

      // Get product names for email
      const productIds = orderItems.map(item => item.product_id);
      const productsResult = await pool.query(
        `SELECT id, name FROM products WHERE id = ANY($1::int[]) AND deleted_at IS NULL`,
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

      // Send notification to user
      try {
        await createNotification({
          userId: userId,
          type: 'order_placed',
          title: 'Đặt hàng thành công',
          message: `Đơn hàng ${order.order_number} của bạn đã được đặt thành công với tổng giá trị ${parseFloat(order.total_amount).toLocaleString('vi-VN')} VNĐ`,
          link: `/orders/${order.id}`,
        });
      } catch (error: any) {
        // Log error but don't fail the request
        logger.error('Failed to create order notification', error instanceof Error ? error : new Error(String(error)), {
          orderId: order.id,
          orderNumber: order.order_number,
          userId: userId,
        });
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
            parseFloat(totalAmount.toString()),
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
      WHERE o.user_id = $1 AND o.deleted_at IS NULL
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

    logger.info('Fetching order by ID', { orderId: id, userId });

    // Lấy thông tin đơn hàng cơ bản
    const orderResult = await pool.query(
      `SELECT o.*
       FROM orders o
       WHERE o.id = $1 AND o.user_id = $2 AND o.deleted_at IS NULL`,
      [id, userId]
    );

    if (orderResult.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại');
    }

    const order = orderResult.rows[0];

    // Lấy thông tin vận chuyển (nếu có)
    const shippingResult = await pool.query(
      `SELECT shipping_provider, tracking_number, shipping_fee
       FROM shipping
       WHERE order_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    );
    const shipping = shippingResult.rows[0];

    // Lấy order items với product và variant info
    const itemsResult = await pool.query(
      `SELECT 
         oi.id,
         oi.product_id,
         oi.variant_id,
         oi.quantity,
         oi.price,
         p.id as product_id_full,
         p.name as product_name,
         p.price as product_price,
        pv.id as variant_id_full,
        pv.variant_attributes,
        pv.price_adjustment
       FROM order_items oi 
       JOIN products p ON oi.product_id = p.id
       LEFT JOIN product_variants pv ON oi.variant_id = pv.id
       WHERE oi.order_id = $1`,
      [id]
    );

    // Lấy images cho từng product và variant
    const items = await Promise.all(
      itemsResult.rows.map(async (item) => {
        // Lấy product images
        const productImagesResult = await pool.query(
          `SELECT image_url 
           FROM product_media 
           WHERE product_id = $1 AND type = 'image' AND variant_id IS NULL 
           ORDER BY display_order, id`,
          [item.product_id]
        );
        const productImageUrls = productImagesResult.rows.map((row: any) => row.image_url);

        // Lấy variant images nếu có variant
        let variantImageUrls: string[] = [];
        if (item.variant_id) {
          const variantImagesResult = await pool.query(
            `SELECT image_url 
             FROM product_media 
             WHERE variant_id = $1 AND type = 'image' 
             ORDER BY display_order, id`,
            [item.variant_id]
          );
          variantImageUrls = variantImagesResult.rows.map((row: any) => row.image_url);
        }

        return {
          id: item.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          price: item.price,
          product: {
            id: item.product_id_full,
            name: item.product_name,
            price: item.product_price,
            image_urls: productImageUrls,
          },
          variant: item.variant_id_full
            ? {
                id: item.variant_id_full,
                variant_attributes: typeof item.variant_attributes === 'string' 
                  ? JSON.parse(item.variant_attributes) 
                  : item.variant_attributes || {},
                price_adjustment: item.price_adjustment,
                image_urls: variantImageUrls,
              }
            : null,
        };
      })
    );

    // Lấy refunds của order
    const refundsResult = await pool.query(
      `SELECT r.*,
       (SELECT json_agg(json_build_object(
         'id', ri.id,
         'order_item_id', ri.order_item_id,
         'quantity', ri.quantity,
         'refund_amount', ri.refund_amount,
         'reason', ri.reason
       )) FROM refund_items ri WHERE ri.refund_id = r.id) as items
       FROM refunds r
       WHERE r.order_id = $1 AND r.deleted_at IS NULL
       ORDER BY r.created_at DESC`,
      [id]
    );

    // Kết hợp tất cả
    const orderWithDetails = {
      ...order,
      ...(shipping && {
        shipping_provider: shipping.shipping_provider,
        tracking_number: shipping.tracking_number,
        // Ưu tiên shipping_fee từ bảng shipping nếu có
        shipping_fee: shipping.shipping_fee ?? order.shipping_fee,
      }),
      items,
      refunds: refundsResult.rows || [],
    };

    logger.info('Order fetched successfully', { orderId: id, itemsCount: items.length });

    return ResponseHandler.success(res, { order: orderWithDetails }, 'Lấy thông tin đơn hàng thành công');
  } catch (error: any) {
    logger.error('Error fetching order', error instanceof Error ? error : new Error(String(error)), {
      orderId: id,
      userId: req.user?.id,
      ip: req.ip,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy thông tin đơn hàng', error);
  }
};

// Hủy đơn hàng (hoàn kho nếu đã trừ tồn, chỉ cho phép khi chưa giao/đã thanh toán)
export const cancelOrder = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const client = await pool.connect();

  try {
    if (!userId) {
      return ResponseHandler.error(res, 'Người dùng chưa đăng nhập', 401);
    }

    await client.query('BEGIN');

    // Khóa đơn hàng để tránh race
    const orderResult = await client.query(
      `SELECT id, user_id, order_number, order_status, payment_status 
       FROM orders 
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [id, userId]
    );

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ResponseHandler.notFound(res, 'Đơn hàng không tồn tại');
    }

    const order = orderResult.rows[0];

    // Chỉ cho hủy khi đơn chưa giao/hậu cần
    const notCancellableStatuses = [ORDER_STATUS.SHIPPING, ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED];
    if (notCancellableStatuses.includes(order.order_status)) {
      await client.query('ROLLBACK');
      return ResponseHandler.error(res, 'Đơn hàng không thể hủy ở trạng thái hiện tại', 400);
    }

    // Nếu đã thanh toán online (PAID), cần quy trình hoàn tiền riêng
    if (order.payment_status === PAYMENT_STATUS.PAID) {
      await client.query('ROLLBACK');
      return ResponseHandler.error(res, 'Đơn đã thanh toán, cần xử lý hoàn tiền thủ công', 400);
    }

    // Hoàn kho (vì đã trừ khi tạo đơn)
    const orderItems = await client.query(
      `SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = $1`,
      [order.id]
    );

    for (const item of orderItems.rows) {
      let stockQuery: string;
      let stockParams: any[];
      if (item.variant_id) {
        stockQuery = 'SELECT stock_quantity FROM product_variants WHERE id = $1 FOR UPDATE';
        stockParams = [item.variant_id];
      } else {
        stockQuery = 'SELECT stock_quantity FROM products WHERE id = $1 FOR UPDATE';
        stockParams = [item.product_id];
      }

      const stockResult = await client.query(stockQuery, stockParams);
      if (stockResult.rows.length === 0) {
        // Nếu không tìm thấy, bỏ qua để không chặn toàn bộ hủy đơn
        continue;
      }

      const currentStock = parseInt(stockResult.rows[0].stock_quantity);
      const newStock = currentStock + item.quantity;

      if (item.variant_id) {
        await client.query('UPDATE product_variants SET stock_quantity = $1 WHERE id = $2', [
          newStock,
          item.variant_id,
        ]);
        // Check and send low stock alert (outside transaction)
        checkAndSendLowStockAlert(item.product_id, item.variant_id, newStock, 10).catch(err => {
          logger.error('Failed to check low stock alert', err instanceof Error ? err : new Error(String(err)));
        });
      } else {
        await client.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [newStock, item.product_id]);
        // Check and send low stock alert (outside transaction)
        checkAndSendLowStockAlert(item.product_id, null, newStock, 10).catch(err => {
          logger.error('Failed to check low stock alert', err instanceof Error ? err : new Error(String(err)));
        });
      }

    }

    // Cập nhật trạng thái đơn
    await client.query(
      `UPDATE orders 
       SET order_status = $1, 
           payment_status = CASE WHEN payment_status = $2 THEN $3 ELSE payment_status END,
           updated_at = NOW()
       WHERE id = $4`,
      [ORDER_STATUS.CANCELLED, PAYMENT_STATUS.PENDING, PAYMENT_STATUS.FAILED, order.id]
    );

    await client.query('COMMIT');

    // Send notification to user
    try {
      await createNotification({
        userId: userId,
        type: 'order_cancelled',
        title: 'Đơn hàng đã bị hủy',
        message: `Đơn hàng ${order.order_number} của bạn đã được hủy thành công.`,
        link: `/orders/${order.id}`,
      });
    } catch (error: any) {
      // Log error but don't fail the request
      logger.error('Failed to create cancellation notification', error instanceof Error ? error : new Error(String(error)), {
        orderId: order.id,
        orderNumber: order.order_number,
        userId: userId,
      });
    }

    return ResponseHandler.success(res, { order_id: order.id }, 'Hủy đơn hàng thành công');
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error cancelling order', error instanceof Error ? error : new Error(String(error)), {
      orderId: id,
      userId,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi hủy đơn hàng', error);
  } finally {
    client.release();
  }
};

