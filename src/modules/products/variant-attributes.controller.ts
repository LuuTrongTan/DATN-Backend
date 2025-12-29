import { Response } from 'express';
import { AuthRequest } from '../../types/request.types';
import { pool } from '../../connections';
import { createAttributeDefinitionSchema, createAttributeValueSchema } from './product-variants.validation';
import { ResponseHandler } from '../../utils/response';
import { logger } from '../../utils/logging';

// Tạo định nghĩa thuộc tính biến thể (Size, Color, Material...)
export const createAttributeDefinition = async (req: AuthRequest, res: Response) => {
  const { product_id } = req.params;
  try {
    const validated = createAttributeDefinitionSchema.parse(req.body);

    // Kiểm tra sản phẩm tồn tại
    const productCheck = await pool.query(
      'SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL',
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm không tồn tại');
    }

    // Kiểm tra attribute_name đã tồn tại chưa
    const existingCheck = await pool.query(
      `SELECT id FROM variant_attribute_definitions 
       WHERE product_id = $1 AND attribute_name = $2`,
      [product_id, validated.attribute_name]
    );

    if (existingCheck.rows.length > 0) {
      return ResponseHandler.badRequest(
        res,
        'Thuộc tính này đã được định nghĩa cho sản phẩm này'
      );
    }

    const result = await pool.query(
      `INSERT INTO variant_attribute_definitions (product_id, attribute_name, display_name, display_order, is_required)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, product_id, attribute_name, display_name, display_order, is_required, created_at`,
      [
        product_id,
        validated.attribute_name,
        validated.display_name,
        validated.display_order || 0,
        validated.is_required || false,
      ]
    );

    return ResponseHandler.success(res, {
      message: 'Tạo định nghĩa thuộc tính thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.badRequest(res, 'Dữ liệu không hợp lệ', error.errors);
    }
    logger.error('Error creating attribute definition', error instanceof Error ? error : new Error(String(error)), {
      productId: product_id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi tạo định nghĩa thuộc tính', error);
  }
};

// Lấy tất cả định nghĩa thuộc tính của sản phẩm
export const getAttributeDefinitionsByProduct = async (req: AuthRequest, res: Response) => {
  const { product_id } = req.params;
  try {
    const result = await pool.query(
      `SELECT vad.id, vad.product_id, vad.attribute_name, vad.display_name, vad.display_order, vad.is_required, vad.created_at,
       (SELECT json_agg(json_build_object(
         'id', vav.id,
         'value', vav.value,
         'display_order', vav.display_order,
         'created_at', vav.created_at
       ) ORDER BY vav.display_order, vav.value) 
       FROM variant_attribute_values vav 
       WHERE vav.definition_id = vad.id) as values
       FROM variant_attribute_definitions vad
       WHERE vad.product_id = $1
       ORDER BY vad.display_order, vad.attribute_name`,
      [product_id]
    );

    return ResponseHandler.success(res, result.rows);
  } catch (error: any) {
    logger.error('Error fetching attribute definitions', error instanceof Error ? error : new Error(String(error)), {
      productId: product_id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi lấy danh sách định nghĩa thuộc tính', error);
  }
};

// Thêm giá trị cho thuộc tính
export const createAttributeValue = async (req: AuthRequest, res: Response) => {
  const { definition_id } = req.params;
  try {
    const validated = createAttributeValueSchema.parse(req.body);

    // Kiểm tra definition tồn tại
    const definitionCheck = await pool.query(
      'SELECT id FROM variant_attribute_definitions WHERE id = $1',
      [definition_id]
    );

    if (definitionCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Định nghĩa thuộc tính không tồn tại');
    }

    // Kiểm tra value đã tồn tại chưa
    const existingCheck = await pool.query(
      `SELECT id FROM variant_attribute_values 
       WHERE definition_id = $1 AND value = $2`,
      [definition_id, validated.value]
    );

    if (existingCheck.rows.length > 0) {
      return ResponseHandler.badRequest(
        res,
        'Giá trị này đã tồn tại cho thuộc tính này'
      );
    }

    const result = await pool.query(
      `INSERT INTO variant_attribute_values (definition_id, value, display_order)
       VALUES ($1, $2, $3)
       RETURNING id, definition_id, value, display_order, created_at`,
      [
        definition_id,
        validated.value,
        validated.display_order || 0,
      ]
    );

    return ResponseHandler.success(res, {
      message: 'Thêm giá trị thuộc tính thành công',
      data: result.rows[0],
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return ResponseHandler.badRequest(res, 'Dữ liệu không hợp lệ', error.errors);
    }
    logger.error('Error creating attribute value', error instanceof Error ? error : new Error(String(error)), {
      definitionId: definition_id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi thêm giá trị thuộc tính', error);
  }
};

// Xóa định nghĩa thuộc tính
export const deleteAttributeDefinition = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    // Kiểm tra có variant nào đang sử dụng thuộc tính này không
    const variantCheck = await pool.query(
      `SELECT COUNT(*) FROM product_variants pv, variant_attribute_definitions vad
       WHERE vad.id = $1 AND vad.attribute_name = ANY(SELECT jsonb_object_keys(pv.variant_attributes))
       AND pv.deleted_at IS NULL`,
      [id]
    );

    if (parseInt(variantCheck.rows[0].count) > 0) {
      return ResponseHandler.badRequest(
        res,
        'Không thể xóa thuộc tính đang được sử dụng trong biến thể'
      );
    }

    const result = await pool.query(
      'DELETE FROM variant_attribute_definitions WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Định nghĩa thuộc tính không tồn tại');
    }

    return ResponseHandler.success(res, {
      message: 'Xóa định nghĩa thuộc tính thành công',
    });
  } catch (error: any) {
    logger.error('Error deleting attribute definition', error instanceof Error ? error : new Error(String(error)), {
      definitionId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi xóa định nghĩa thuộc tính', error);
  }
};

// Lấy tất cả định nghĩa thuộc tính từ các sản phẩm khác (để dùng lại)
export const getAllAttributeDefinitions = async (req: AuthRequest, res: Response) => {
  try {
    const { category_id, exclude_product_id } = req.query;

    let query = `
      SELECT DISTINCT 
        vad.attribute_name,
        vad.display_name,
        vad.is_required,
        COUNT(DISTINCT vad.product_id) as product_count,
        json_agg(DISTINCT jsonb_build_object(
          'product_id', vad.product_id,
          'product_name', p.name
        )) as products,
        json_agg(DISTINCT jsonb_build_object(
          'value', vav.value,
          'display_order', vav.display_order
        ) ORDER BY vav.display_order, vav.value) as values
      FROM variant_attribute_definitions vad
      LEFT JOIN products p ON p.id = vad.product_id
      LEFT JOIN variant_attribute_values vav ON vav.definition_id = vad.id
      WHERE p.deleted_at IS NULL
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (exclude_product_id) {
      query += ` AND vad.product_id != $${paramIndex}`;
      params.push(exclude_product_id);
      paramIndex++;
    }

    if (category_id) {
      query += ` AND p.category_id = $${paramIndex}`;
      params.push(category_id);
      paramIndex++;
    }

    query += `
      GROUP BY vad.attribute_name, vad.display_name, vad.is_required
      ORDER BY vad.display_name, vad.attribute_name
    `;

    const result = await pool.query(query, params);

    return ResponseHandler.success(res, result.rows);
  } catch (error: any) {
    logger.error('Error fetching all attribute definitions', error instanceof Error ? error : new Error(String(error)), {
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi lấy danh sách thuộc tính', error);
  }
};

// Copy thuộc tính từ sản phẩm khác
export const copyAttributesFromProduct = async (req: AuthRequest, res: Response) => {
  const { product_id } = req.params;
  const { source_product_id, attribute_names } = req.body;

  try {
    // Kiểm tra sản phẩm đích tồn tại
    const targetCheck = await pool.query(
      'SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL',
      [product_id]
    );

    if (targetCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm đích không tồn tại');
    }

    // Kiểm tra sản phẩm nguồn tồn tại
    const sourceCheck = await pool.query(
      'SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL',
      [source_product_id]
    );

    if (sourceCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Sản phẩm nguồn không tồn tại');
    }

    // Lấy định nghĩa từ sản phẩm nguồn
    let query = `
      SELECT vad.id, vad.attribute_name, vad.display_name, vad.display_order, vad.is_required
      FROM variant_attribute_definitions vad
      WHERE vad.product_id = $1
    `;

    const params: any[] = [source_product_id];

    if (attribute_names && Array.isArray(attribute_names) && attribute_names.length > 0) {
      query += ` AND vad.attribute_name = ANY($2)`;
      params.push(attribute_names);
    }

    const sourceDefinitions = await pool.query(query, params);

    if (sourceDefinitions.rows.length === 0) {
      return ResponseHandler.badRequest(res, 'Không tìm thấy thuộc tính nào để copy');
    }

    const copiedDefinitions = [];

    // Copy từng định nghĩa và giá trị
    for (const sourceDef of sourceDefinitions.rows) {
      // Kiểm tra đã tồn tại chưa
      const existingCheck = await pool.query(
        `SELECT id FROM variant_attribute_definitions 
         WHERE product_id = $1 AND attribute_name = $2`,
        [product_id, sourceDef.attribute_name]
      );

      if (existingCheck.rows.length > 0) {
        // Đã tồn tại, bỏ qua
        continue;
      }

      // Tạo định nghĩa mới
      const newDefResult = await pool.query(
        `INSERT INTO variant_attribute_definitions (product_id, attribute_name, display_name, display_order, is_required)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          product_id,
          sourceDef.attribute_name,
          sourceDef.display_name,
          sourceDef.display_order,
          sourceDef.is_required,
        ]
      );

      const newDefId = newDefResult.rows[0].id;

      // Copy các giá trị
      const sourceValues = await pool.query(
        `SELECT value, display_order 
         FROM variant_attribute_values 
         WHERE definition_id = $1`,
        [sourceDef.id]
      );

      for (const sourceValue of sourceValues.rows) {
        await pool.query(
          `INSERT INTO variant_attribute_values (definition_id, value, display_order)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [newDefId, sourceValue.value, sourceValue.display_order]
        );
      }

      copiedDefinitions.push({
        attribute_name: sourceDef.attribute_name,
        display_name: sourceDef.display_name,
      });
    }

    return ResponseHandler.success(res, {
      message: `Đã copy ${copiedDefinitions.length} thuộc tính thành công`,
      data: copiedDefinitions,
    });
  } catch (error: any) {
    logger.error('Error copying attributes', error instanceof Error ? error : new Error(String(error)), {
      productId: product_id,
      sourceProductId: req.body.source_product_id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi copy thuộc tính', error);
  }
};

// Xóa giá trị thuộc tính
export const deleteAttributeValue = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    // Kiểm tra có variant nào đang sử dụng giá trị này không
    const valueCheck = await pool.query(
      'SELECT value, definition_id FROM variant_attribute_values WHERE id = $1',
      [id]
    );

    if (valueCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Giá trị thuộc tính không tồn tại');
    }

    const value = valueCheck.rows[0].value;
    const definitionId = valueCheck.rows[0].definition_id;

    const definitionCheck = await pool.query(
      'SELECT attribute_name FROM variant_attribute_definitions WHERE id = $1',
      [definitionId]
    );

    if (definitionCheck.rows.length === 0) {
      return ResponseHandler.notFound(res, 'Định nghĩa thuộc tính không tồn tại');
    }

    const attributeName = definitionCheck.rows[0].attribute_name;

    const variantCheck = await pool.query(
      `SELECT COUNT(*) FROM product_variants 
       WHERE variant_attributes->>$1 = $2 AND deleted_at IS NULL`,
      [attributeName, value]
    );

    if (parseInt(variantCheck.rows[0].count) > 0) {
      return ResponseHandler.badRequest(
        res,
        'Không thể xóa giá trị đang được sử dụng trong biến thể'
      );
    }

    const result = await pool.query(
      'DELETE FROM variant_attribute_values WHERE id = $1 RETURNING id',
      [id]
    );

    return ResponseHandler.success(res, {
      message: 'Xóa giá trị thuộc tính thành công',
    });
  } catch (error: any) {
    logger.error('Error deleting attribute value', error instanceof Error ? error : new Error(String(error)), {
      valueId: id,
      ip: req.ip,
    });
    return ResponseHandler.internalError(res, 'Lỗi xóa giá trị thuộc tính', error);
  }
};


