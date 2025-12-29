import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

// Stock in (Nhập kho)
export const stockIn = async (req: AuthRequest, res: Response) => {
  let product_id: number | undefined;
  let variant_id: number | undefined;
  let quantity: number | undefined;
  const client = await pool.connect();
  try {
    const body = req.body;
    product_id = body.product_id;
    variant_id = body.variant_id;
    quantity = body.quantity;
    const reason = body.reason;

    if (!product_id && !variant_id) {
      return ResponseHandler.error(res, 'Phải cung cấp product_id hoặc variant_id', 400);
    }

    if (!quantity || quantity <= 0) {
      return ResponseHandler.error(res, 'Số lượng phải lớn hơn 0', 400);
    }

    await client.query('BEGIN');

    // Get current stock
    let currentStock: number;
    let stockQuery: string;
    let stockParams: any[];

    if (variant_id) {
      stockQuery =
        'SELECT stock_quantity FROM product_variants WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE FOR UPDATE';
      stockParams = [variant_id];
    } else {
      stockQuery =
        'SELECT stock_quantity FROM products WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE FOR UPDATE';
      stockParams = [product_id];
    }

    const stockResult = await client.query(stockQuery, stockParams);
    if (stockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ResponseHandler.notFound(res, variant_id ? 'Biến thể không tồn tại' : 'Sản phẩm không tồn tại');
    }

    currentStock = parseInt(stockResult.rows[0].stock_quantity);
    const newStock = currentStock + quantity;

    // Update stock
    if (variant_id) {
      await client.query(
        'UPDATE product_variants SET stock_quantity = $1 WHERE id = $2 AND deleted_at IS NULL AND is_active = TRUE',
        [newStock, variant_id]
      );
    } else {
      await client.query(
        'UPDATE products SET stock_quantity = $1 WHERE id = $2 AND deleted_at IS NULL AND is_active = TRUE',
        [newStock, product_id]
      );
    }

    // Create stock history
    await client.query(
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

    await client.query('COMMIT');

    // Check and update stock alerts (ngoài transaction, không quan trọng tới tính toàn vẹn đơn)
    await checkAndUpdateStockAlerts(product_id, variant_id, newStock);

    return ResponseHandler.success(
      res,
      {
      previous_stock: currentStock,
      quantity_added: quantity,
      new_stock: newStock,
      },
      'Nhập kho thành công'
    );
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error in stock in', error instanceof Error ? error : new Error(String(error)), {
      productId: product_id,
      variantId: variant_id,
      quantity,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi nhập kho', error);
  } finally {
    client.release();
  }
};

// Stock adjustment (Điều chỉnh kho)
export const stockAdjustment = async (req: AuthRequest, res: Response) => {
  let product_id: number | undefined;
  let variant_id: number | undefined;
  let new_quantity: number | undefined;
  const client = await pool.connect();
  try {
    const body = req.body;
    product_id = body.product_id;
    variant_id = body.variant_id;
    new_quantity = body.new_quantity;
    const reason = body.reason;

    if (!product_id && !variant_id) {
      return ResponseHandler.error(res, 'Phải cung cấp product_id hoặc variant_id', 400);
    }

    if (new_quantity === undefined || new_quantity < 0) {
      return ResponseHandler.error(res, 'Số lượng mới không hợp lệ', 400);
    }

    await client.query('BEGIN');

    // Get current stock
    let currentStock: number;
    let stockQuery: string;
    let stockParams: any[];

    if (variant_id) {
      stockQuery =
        'SELECT stock_quantity FROM product_variants WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE FOR UPDATE';
      stockParams = [variant_id];
    } else {
      stockQuery =
        'SELECT stock_quantity FROM products WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE FOR UPDATE';
      stockParams = [product_id];
    }

    const stockResult = await client.query(stockQuery, stockParams);
    if (stockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return ResponseHandler.notFound(res, variant_id ? 'Biến thể không tồn tại' : 'Sản phẩm không tồn tại');
    }

    currentStock = parseInt(stockResult.rows[0].stock_quantity);
    const difference = new_quantity - currentStock;

    // Update stock
    if (variant_id) {
      await client.query(
        'UPDATE product_variants SET stock_quantity = $1 WHERE id = $2 AND deleted_at IS NULL AND is_active = TRUE',
        [new_quantity, variant_id]
      );
    } else {
      await client.query(
        'UPDATE products SET stock_quantity = $1 WHERE id = $2 AND deleted_at IS NULL AND is_active = TRUE',
        [new_quantity, product_id]
      );
    }

    // Create stock history
    await client.query(
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

    await client.query('COMMIT');

    // Check and update stock alerts (ngoài transaction)
    await checkAndUpdateStockAlerts(product_id, variant_id, new_quantity);

    return ResponseHandler.success(
      res,
      {
      previous_stock: currentStock,
      new_stock: new_quantity,
      difference,
      },
      'Điều chỉnh kho thành công'
    );
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Error in stock adjustment', error instanceof Error ? error : new Error(String(error)), {
      productId: product_id,
      variantId: variant_id,
      newQuantity: new_quantity,
      userId: req.user?.id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi điều chỉnh kho', error);
  } finally {
    client.release();
  }
};

// Get stock history
export const getStockHistory = async (req: AuthRequest, res: Response) => {
  const product_id = req.query.product_id as string | undefined;
  const variant_id = req.query.variant_id as string | undefined;
  const type = req.query.type as string | undefined;
  try {
    const { page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;

    let query =
      'SELECT id, product_id, variant_id, type, quantity, previous_stock, new_stock, reason, created_by, created_at FROM stock_history WHERE 1=1';
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

    return ResponseHandler.paginated(res, result.rows, {
      page: pageNum,
      limit: limitNum,
      total,
    }, 'Lấy lịch sử kho thành công');
  } catch (error: any) {
    logger.error('Error fetching stock history', error instanceof Error ? error : new Error(String(error)), {
      productId: product_id,
      variantId: variant_id,
      type,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy lịch sử kho', error);
  }
};

// Get stock alerts
export const getStockAlerts = async (req: AuthRequest, res: Response) => {
  const is_notified = req.query.is_notified as string | undefined;
  try {
    const { page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 50;

    let query = `
      SELECT sa.*, 
             p.name as product_name,
             pv.variant_attributes
      FROM stock_alerts sa
      LEFT JOIN products p ON sa.product_id = p.id AND p.deleted_at IS NULL
      LEFT JOIN product_variants pv ON sa.variant_id = pv.id AND pv.deleted_at IS NULL
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

    return ResponseHandler.paginated(res, result.rows, {
      page: pageNum,
      limit: limitNum,
      total,
    }, 'Lấy danh sách cảnh báo kho thành công');
  } catch (error: any) {
    logger.error('Error fetching stock alerts', error instanceof Error ? error : new Error(String(error)), {
      isNotified: is_notified,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi lấy danh sách cảnh báo kho', error);
  }
};

// Mark alert as notified
export const markAlertAsNotified = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {

    const result = await pool.query(
      `UPDATE stock_alerts 
       SET is_notified = TRUE, notified_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING id, product_id, variant_id, threshold, current_stock, is_notified, notified_at, created_at, updated_at`,
      [id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Cảnh báo không tồn tại');
    }

    return ResponseHandler.success(res, result.rows[0], 'Đã đánh dấu cảnh báo');
  } catch (error: any) {
    logger.error('Error marking alert as notified', error instanceof Error ? error : new Error(String(error)), {
      alertId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi khi đánh dấu cảnh báo', error);
  }
};

// Helper function to check and update stock alerts
async function checkAndUpdateStockAlerts(
  productId: number | undefined,
  variantId: number | undefined,
  currentStock: number
): Promise<void> {
  const defaultThreshold = 10; // Ngưỡng mặc định

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

  // Nếu đã có alert thì ưu tiên dùng threshold trong DB, nếu không thì dùng mặc định
  const threshold =
    alertResult.rows.length > 0 && alertResult.rows[0].threshold != null
      ? parseInt(alertResult.rows[0].threshold)
      : defaultThreshold;

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


