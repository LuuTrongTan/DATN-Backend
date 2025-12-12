import { MigrationInfo } from './types';

// Import all migrations
import * as migration001 from './20251120_000001_create_users_table';
import * as migration002 from './20251120_000002_create_verification_codes_table';
import * as migration003 from './20251120_000003_create_categories_table';
import * as migration004 from './20251120_000004_create_products_table';
import * as migration005 from './20251120_000005_create_product_variants_table';
import * as migration006 from './20251120_000006_create_cart_items_table';
import * as migration007 from './20251120_000007_create_orders_table';
import * as migration008 from './20251120_000008_create_order_items_table';
import * as migration009 from './20251120_000009_create_order_status_history_table';
import * as migration010 from './20251120_000010_create_reviews_table';
import * as migration011 from './20251120_000011_create_daily_statistics_table';
import * as migration012 from './20251120_000012_create_user_addresses_table';
import * as migration013 from './20251120_000013_create_wishlist_table';
import * as migration014 from './20251120_000014_create_stock_history_table';
import * as migration015 from './20251120_000015_create_stock_alerts_table';

export const migrations: MigrationInfo[] = [
  { name: '20251120_000001_create_users_table', migration: migration001.migration },
  { name: '20251120_000002_create_verification_codes_table', migration: migration002.migration },
  { name: '20251120_000003_create_categories_table', migration: migration003.migration },
  { name: '20251120_000004_create_products_table', migration: migration004.migration },
  { name: '20251120_000005_create_product_variants_table', migration: migration005.migration },
  { name: '20251120_000006_create_cart_items_table', migration: migration006.migration },
  { name: '20251120_000007_create_orders_table', migration: migration007.migration },
  { name: '20251120_000008_create_order_items_table', migration: migration008.migration },
  { name: '20251120_000009_create_order_status_history_table', migration: migration009.migration },
  { name: '20251120_000010_create_reviews_table', migration: migration010.migration },
  { name: '20251120_000011_create_daily_statistics_table', migration: migration011.migration },
  { name: '20251120_000012_create_user_addresses_table', migration: migration012.migration },
  { name: '20251120_000013_create_wishlist_table', migration: migration013.migration },
  { name: '20251120_000014_create_stock_history_table', migration: migration014.migration },
  { name: '20251120_000015_create_stock_alerts_table', migration: migration015.migration },
];
