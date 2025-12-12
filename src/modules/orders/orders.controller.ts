import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { orderSchema } from './orders.validation';
import { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } from '../../utils/email.service';
import { createShippingRecord } from '../shipping/shipping.service';

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
      return res.status(400).json({ message: 'Giỏ hàng trống' });
    }

    // Check stock and calculate total
    let totalAmount = 0;
    const orderItems: any[] = [];

    for (const item of cartItems.rows) {
      const availableStock = item.variant_id ? item.variant_stock : item.product_stock;
      
      if (item.quantity > availableStock) {
        return res.status(400).json({
          message: `Sản phẩm ${item.product_id} không đủ số lượng`,
          available: availableStock,
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

    // Apply coupon if provided
    let discountAmount = 0;
    let couponId: number | null = null;
    
    if (validated.coupon_code) {
      try {
        const productIds = orderItems.map(item => item.product_id);
        const categoryIds = orderItems
          .map(item => item.product_id)
          .filter((id, index, self) => self.indexOf(id) === index); // Get unique product IDs
        
        // Get categories for products
        const categoryResult = await pool.query(
          `SELECT DISTINCT category_id FROM products WHERE id = ANY($1::int[]) AND category_id IS NOT NULL`,
          [productIds]
        );
        const categoryIdsFromProducts = categoryResult.rows.map(r => r.category_id);

        const couponResponse = await pool.query(
          `SELECT * FROM coupons WHERE code = $1 AND is_active = TRUE`,
          [validated.coupon_code.toUpperCase()]
        );

        if (couponResponse.rows.length > 0) {
          const coupon = couponResponse.rows[0];
          const now = new Date();
          const startDate = new Date(coupon.start_date);
          const endDate = new Date(coupon.end_date);

          if (now >= startDate && now <= endDate) {
            if (!coupon.usage_limit || coupon.used_count < coupon.usage_limit) {
              const userUsageCount = await pool.query(
                'SELECT COUNT(*) FROM coupon_usage WHERE coupon_id = $1 AND user_id = $2',
                [coupon.id, userId]
              );

              if (parseInt(userUsageCount.rows[0].count) < coupon.user_limit) {
                if (totalAmount >= coupon.min_order_amount) {
                  // Check applicable to
                  let isApplicable = true;
                  if (coupon.applicable_to === 'category' && coupon.category_id) {
                    isApplicable = categoryIdsFromProducts.includes(coupon.category_id);
                  } else if (coupon.applicable_to === 'product' && coupon.product_id) {
                    isApplicable = productIds.includes(coupon.product_id);
                  }

                  if (isApplicable) {
                    // Calculate discount
                    if (coupon.discount_type === 'percentage') {
                      discountAmount = (totalAmount * coupon.discount_value) / 100;
                      if (coupon.max_discount_amount && discountAmount > coupon.max_discount_amount) {
                        discountAmount = coupon.max_discount_amount;
                      }
                    } else {
                      discountAmount = coupon.discount_value;
                    }

                    if (discountAmount > totalAmount) {
                      discountAmount = totalAmount;
                    }

                    couponId = coupon.id;
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        // Silent fail, continue without coupon
        console.error('Error applying coupon:', error);
      }
    }

    // Calculate shipping fee (simplified - will be replaced by shipping service)
    const shippingFee = validated.shipping_fee || 30000; // Default 30k

    // Create order
    const orderNumber = `ORD-${Date.now()}-${userId}`;
    const finalAmount = totalAmount - discountAmount + shippingFee;
    
    const orderResult = await pool.query(
      `INSERT INTO orders (user_id, order_number, total_amount, shipping_address, 
        payment_method, shipping_fee, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
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
      await pool.query(
        `INSERT INTO order_items (order_id, product_id, variant_id, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.product_id, item.variant_id, item.quantity, item.price]
      );

      // Get current stock before update
      let currentStock: number;
      if (item.variant_id) {
        const stockResult = await pool.query(
          'SELECT stock_quantity FROM product_variants WHERE id = $1',
          [item.variant_id]
        );
        currentStock = parseInt(stockResult.rows[0].stock_quantity);
      } else {
        const stockResult = await pool.query(
          'SELECT stock_quantity FROM products WHERE id = $1',
          [item.product_id]
        );
        currentStock = parseInt(stockResult.rows[0].stock_quantity);
      }

      const newStock = currentStock - item.quantity;

      // Update stock (will be finalized after payment confirmation)
      if (item.variant_id) {
        await pool.query(
          'UPDATE product_variants SET stock_quantity = $1 WHERE id = $2',
          [newStock, item.variant_id]
        );
      } else {
        await pool.query(
          'UPDATE products SET stock_quantity = $1 WHERE id = $2',
          [newStock, item.product_id]
        );
      }

      // Create stock history
      await pool.query(
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

    // Record coupon usage if applied
    if (couponId && discountAmount > 0) {
      await pool.query(
        `INSERT INTO coupon_usage (coupon_id, user_id, order_id, discount_amount)
         VALUES ($1, $2, $3, $4)`,
        [couponId, userId, order.id, discountAmount]
      );

      // Update coupon used count
      await pool.query(
        'UPDATE coupons SET used_count = used_count + 1 WHERE id = $1',
        [couponId]
      );
    }

    // Create shipping record
    try {
      await createShippingRecord(pool, {
        order_id: order.id,
        shipping_fee: shippingFee,
        shipping_provider: 'GHTK',
      });
    } catch (error) {
      // Log error but don't fail order creation
      console.error('Error creating shipping record:', error);
    }

    // Clear cart
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

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
        console.error('Failed to send order confirmation email:', error);
      }
    }

    // Prepare response
    const response: any = {
      message: 'Đặt hàng thành công',
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
          response.payment_url = paymentUrl;
        }
      } catch (error) {
        // VNPay not configured, continue without payment URL
        console.error('Error creating payment URL:', error);
      }
    }

    res.status(201).json(response);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        message: 'Dữ liệu không hợp lệ',
        errors: error.errors,
      });
    }
    res.status(500).json({ message: error.message });
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

    res.json({ orders: result.rows });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getOrderById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

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
      return res.status(404).json({ message: 'Đơn hàng không tồn tại' });
    }

    res.json({ order: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

