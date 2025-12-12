import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { orderSchema } from './orders.validation';
import { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } from '../../utils/email.service';

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

    // Calculate shipping fee (simplified)
    const shippingFee = 0; // TODO: Calculate based on address

    // Create order
    const orderNumber = `ORD-${Date.now()}-${userId}`;
    const orderResult = await pool.query(
      `INSERT INTO orders (user_id, order_number, total_amount, shipping_address, 
        payment_method, shipping_fee, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        orderNumber,
        totalAmount + shippingFee,
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

    // Clear cart
    await pool.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

    // Handle payment
    if (validated.payment_method === 'online') {
      // TODO: Integrate payment gateway
      // For now, mark as paid
      await pool.query(
        'UPDATE orders SET payment_status = $1, order_status = $2 WHERE id = $3',
        ['paid', 'confirmed', order.id]
      );
    }

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

    res.status(201).json({
      message: 'Đặt hàng thành công',
      order: {
        ...order,
        items: orderItems,
      },
    });
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

