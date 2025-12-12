import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';

// Stock in (Nhập kho)
export const stockIn = async (req: AuthRequest, res: Response) => {
  try {
    const { product_id, variant_id, quantity, reason } = req.body;

    if (!product_id && !variant_id) {
      return res.status(400).json({
        success: false,
        message: 'Phải cung cấp product_id hoặc variant_id',
      });
    }

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Số lượng phải lớn hơn 0',
      });
    }

    // Get current stock
    let currentStock: number;
    let stockQuery: string;
    let stockParams: any[];

    if (variant_id) {
      stockQuery = 'SELECT stock_quantity FROM product_variants WHERE id = $1';
      stockParams = [variant_id];
    } else {
      stockQuery = 'SELECT stock_quantity FROM products WHERE id = $1';
      stockParams = [product_id];
    }

    const stockResult = await pool.query(stockQuery, stockParams);
    if (stockResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: variant_id ? 'Biến thể không tồn tại' : 'Sản phẩm không tồn tại',
      });
    }

    currentStock = parseInt(stockResult.rows[0].stock_quantity);
    const newStock = currentStock + quantity;

    // Update stock
    if (variant_id) {
      await pool.query(
        'UPDATE product_variants SET stock_quantity = $1 WHERE id = $2',
        [newStock, variant_id]
      );
    } else {
      await pool.query(
        'UPDATE products SET stock_quantity = $1 WHERE id = $2',
        [newStock, product_id]
      );
    }

    // Create stock history
    await pool.query(
      `INSERT INTO stock_history (product_id, variant_id, type, quantity, previous_stock, new_stock, reason, created_by)
       VALUES ($1, $2, 'in', $3, $4, $5, $6, $7)`,
      [
        product_id || null,
        variant_id || null,
        quantity,
        currentStock,
        newStock,
        reason || null,
        req.user!.id,
      ]
    );

    // Check and update stock alerts
    await checkAndUpdateStockAlerts(product_id, variant_id, newStock);

    res.json({
      success: true,
      message: 'Nhập kho thành công',
      data: {
        previous_stock: currentStock,
        quantity_added: quantity,
        new_stock: newStock,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Stock adjustment (Điều chỉnh kho)
export const stockAdjustment = async (req: AuthRequest, res: Response) => {
  try {
    const { product_id, variant_id, new_quantity, reason } = req.body;

    if (!product_id && !variant_id) {
      return res.status(400).json({
        success: false,
        message: 'Phải cung cấp product_id hoặc variant_id',
      });
    }

    if (new_quantity === undefined || new_quantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'Số lượng mới không hợp lệ',
      });
    }

    // Get current stock
    let currentStock: number;
    let stockQuery: string;
    let stockParams: any[];

    if (variant_id) {
      stockQuery = 'SELECT stock_quantity FROM product_variants WHERE id = $1';
      stockParams = [variant_id];
    } else {
      stockQuery = 'SELECT stock_quantity FROM products WHERE id = $1';
      stockParams = [product_id];
    }

    const stockResult = await pool.query(stockQuery, stockParams);
    if (stockResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: variant_id ? 'Biến thể không tồn tại' : 'Sản phẩm không tồn tại',
      });
    }

    currentStock = parseInt(stockResult.rows[0].stock_quantity);
    const difference = new_quantity - currentStock;

    // Update stock
    if (variant_id) {
      await pool.query(
        'UPDATE product_variants SET stock_quantity = $1 WHERE id = $2',
        [new_quantity, variant_id]
      );
    } else {
      await pool.query(
        'UPDATE products SET stock_quantity = $1 WHERE id = $2',
        [new_quantity, product_id]
      );
    }

    // Create stock history
    await pool.query(
      `INSERT INTO stock_history (product_id, variant_id, type, quantity, previous_stock, new_stock, reason, created_by)
       VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, $7)`,
      [
        product_id || null,
        variant_id || null,
        Math.abs(difference),
        currentStock,
        new_quantity,
        reason || null,
        req.user!.id,
      ]
    );

    // Check and update stock alerts
    await checkAndUpdateStockAlerts(product_id, variant_id, new_quantity);

    res.json({
      success: true,
      message: 'Điều chỉnh kho thành công',
      data: {
        previous_stock: currentStock,
        new_stock: new_quantity,
        difference,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get stock history
export const getStockHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { product_id, variant_id, type, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;

    let query = 'SELECT * FROM stock_history WHERE 1=1';
    const params: any[] = [];
    let paramCount = 0;

    if (product_id) {
      paramCount++;
      query += ` AND product_id = $${paramCount}`;
      params.push(product_id);
    }

    if (variant_id) {
      paramCount++;
      query += ` AND variant_id = $${paramCount}`;
      params.push(variant_id);
    }

    if (type) {
      paramCount++;
      query += ` AND type = $${paramCount}`;
      params.push(type);
    }

    paramCount++;
    query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    params.push(limitNum);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push((pageNum - 1) * limitNum);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM stock_history WHERE 1=1';
    const countParams: any[] = [];
    let countParamCount = 0;

    if (product_id) {
      countParamCount++;
      countQuery += ` AND product_id = $${countParamCount}`;
      countParams.push(product_id);
    }
    if (variant_id) {
      countParamCount++;
      countQuery += ` AND variant_id = $${countParamCount}`;
      countParams.push(variant_id);
    }
    if (type) {
      countParamCount++;
      countQuery += ` AND type = $${countParamCount}`;
      countParams.push(type);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get stock alerts
export const getStockAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const { is_notified, page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;

    let query = `
      SELECT sa.*, 
             p.name as product_name,
             pv.variant_type, pv.variant_value
      FROM stock_alerts sa
      LEFT JOIN products p ON sa.product_id = p.id
      LEFT JOIN product_variants pv ON sa.variant_id = pv.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (is_notified !== undefined) {
      paramCount++;
      query += ` AND sa.is_notified = $${paramCount}`;
      params.push(is_notified === 'true');
    }

    paramCount++;
    query += ` ORDER BY sa.created_at DESC LIMIT $${paramCount}`;
    params.push(limitNum);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push((pageNum - 1) * limitNum);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM stock_alerts WHERE 1=1';
    const countParams: any[] = [];
    let countParamCount = 0;

    if (is_notified !== undefined) {
      countParamCount++;
      countQuery += ` AND is_notified = $${countParamCount}`;
      countParams.push(is_notified === 'true');
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Mark alert as notified
export const markAlertAsNotified = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE stock_alerts 
       SET is_notified = TRUE, notified_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cảnh báo không tồn tại',
      });
    }

    res.json({
      success: true,
      message: 'Đã đánh dấu cảnh báo',
      data: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper function to check and update stock alerts
async function checkAndUpdateStockAlerts(
  productId: number | undefined,
  variantId: number | undefined,
  currentStock: number
): Promise<void> {
  const threshold = 10; // Default threshold

  // Check if alert exists
  let alertQuery: string;
  let alertParams: any[];

  if (variantId) {
    alertQuery = 'SELECT id, threshold FROM stock_alerts WHERE variant_id = $1';
    alertParams = [variantId];
  } else if (productId) {
    alertQuery = 'SELECT id, threshold FROM stock_alerts WHERE product_id = $1 AND variant_id IS NULL';
    alertParams = [productId];
  } else {
    return;
  }

  const alertResult = await pool.query(alertQuery, alertParams);

  if (currentStock <= threshold) {
    // Create or update alert
    if (alertResult.rows.length > 0) {
      // Update existing alert
      await pool.query(
        `UPDATE stock_alerts 
         SET current_stock = $1, is_notified = FALSE, updated_at = NOW()
         WHERE id = $2`,
        [currentStock, alertResult.rows[0].id]
      );
    } else {
      // Create new alert
      await pool.query(
        `INSERT INTO stock_alerts (product_id, variant_id, threshold, current_stock, is_notified)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [productId || null, variantId || null, threshold, currentStock]
      );
    }
  } else {
    // Remove alert if stock is above threshold
    if (alertResult.rows.length > 0) {
      await pool.query('DELETE FROM stock_alerts WHERE id = $1', [alertResult.rows[0].id]);
    }
  }
}

