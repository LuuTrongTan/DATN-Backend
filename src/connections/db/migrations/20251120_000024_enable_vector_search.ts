import { Pool } from 'pg';
import { Migration } from './types';

export const migration: Migration = {
  async up(pool: Pool) {
    // Lưu ý: CREATE EXTENSION không thể chạy trong transaction
    // Nếu extension chưa được cài, migration sẽ bỏ qua phần vector nhưng vẫn chạy phần full-text search
    
    // Check if pgvector extension exists
    let pgvectorAvailable = false;
    try {
      const extResult = await pool.query(
        "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') as exists"
      );
      pgvectorAvailable = extResult.rows[0]?.exists || false;
    } catch (error: any) {
      // Ignore error, assume extension not available
      pgvectorAvailable = false;
    }

    // Thêm search_vector column cho full-text search (không cần extension)
    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS search_vector tsvector
    `);

    // Tạo GIN index cho search_vector
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_products_search_vector 
      ON products USING GIN(search_vector)
    `);

    // Thêm vector column cho products (chỉ nếu pgvector đã được enable)
    if (pgvectorAvailable) {
      try {
        await pool.query(`
          ALTER TABLE products 
          ADD COLUMN IF NOT EXISTS embedding vector(1536)
        `);
        
        // Index cho vector search (HNSW index - hiệu quả hơn cho large datasets)
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_products_embedding 
          ON products USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64)
        `);
        
        console.log('Vector embedding column and index created');
      } catch (error: any) {
        console.warn('Could not add vector column:', error.message);
        console.warn('This is normal if pgvector extension is not installed');
      }
    } else {
      console.log('pgvector extension not available - skipping vector column creation');
      console.log('To enable vector search, install pgvector extension:');
      console.log('  - For PostgreSQL installed via package manager: sudo apt-get install postgresql-XX-pgvector');
      console.log('  - Or compile from source: https://github.com/pgvector/pgvector');
      console.log('  - Then run: CREATE EXTENSION vector; (as superuser)');
    }

    // Thêm vector column cho products (chỉ nếu pgvector đã được enable)
    if (pgvectorAvailable) {
      try {
        await pool.query(`
          ALTER TABLE products 
          ADD COLUMN IF NOT EXISTS embedding vector(1536)
        `);
        
        // Index cho vector search (HNSW index - hiệu quả hơn cho large datasets)
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_products_embedding 
          ON products USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64)
        `);
        
        console.log('Vector embedding column and index created');
      } catch (error: any) {
        console.warn('Could not add vector column:', error.message);
        console.warn('This is normal if pgvector extension is not installed');
      }
    } else {
      console.log('Skipping vector column creation (pgvector not available)');
    }

    // Tạo trigger function để tự động cập nhật search_vector
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_product_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.search_vector := 
          setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
          setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'B') ||
          setweight(to_tsvector('simple', COALESCE(NEW.brand, '')), 'C') ||
          setweight(to_tsvector('simple', COALESCE(NEW.sku, '')), 'C');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Tạo trigger
    await pool.query(`
      DROP TRIGGER IF EXISTS product_search_vector_update ON products;
      CREATE TRIGGER product_search_vector_update
      BEFORE INSERT OR UPDATE OF name, description, brand, sku ON products
      FOR EACH ROW
      EXECUTE FUNCTION update_product_search_vector();
    `);

    // Cập nhật search_vector cho các sản phẩm hiện có
    await pool.query(`
      UPDATE products 
      SET search_vector = 
        setweight(to_tsvector('simple', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(description, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(brand, '')), 'C') ||
        setweight(to_tsvector('simple', COALESCE(sku, '')), 'C')
      WHERE search_vector IS NULL;
    `);

    console.log('Full-text search vector trigger created and data updated');
  },

  async down(pool: Pool) {
    await pool.query('DROP TRIGGER IF EXISTS product_search_vector_update ON products');
    await pool.query('DROP FUNCTION IF EXISTS update_product_search_vector()');
    await pool.query('DROP INDEX IF EXISTS idx_products_embedding');
    await pool.query('ALTER TABLE products DROP COLUMN IF EXISTS embedding');
    // Không drop extension vì có thể được dùng bởi bảng khác
  },
};

