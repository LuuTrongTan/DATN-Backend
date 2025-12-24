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

    await client.query('COMMIT');

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

    await client.query('COMMIT');

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


