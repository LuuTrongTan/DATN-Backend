import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { pool } from '../../connections';
import { orderSchema } from '../../utils/validation';

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

      // Update stock (will be finalized after payment confirmation)
      if (item.variant_id) {
        await pool.query(
          'UPDATE product_variants SET stock_quantity = stock_quantity - $1 WHERE id = $2',
          [item.quantity, item.variant_id]
        );
      } else {
        await pool.query(
          'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }
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

