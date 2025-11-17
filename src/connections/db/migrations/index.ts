import { MigrationInfo } from './types';

// Import all migrations
import * as migration001 from './001_create_users_table';
import * as migration002 from './002_create_verification_codes_table';
import * as migration003 from './003_create_categories_table';
import * as migration004 from './004_create_products_table';
import * as migration005 from './005_create_product_variants_table';
import * as migration006 from './006_create_cart_items_table';
import * as migration007 from './007_create_orders_table';
import * as migration008 from './008_create_order_items_table';
import * as migration009 from './009_create_order_status_history_table';
import * as migration010 from './010_create_reviews_table';
import * as migration011 from './011_create_daily_statistics_table';

export const migrations: MigrationInfo[] = [
  { name: '001_create_users_table', migration: migration001.migration },
  { name: '002_create_verification_codes_table', migration: migration002.migration },
  { name: '003_create_categories_table', migration: migration003.migration },
  { name: '004_create_products_table', migration: migration004.migration },
  { name: '005_create_product_variants_table', migration: migration005.migration },
  { name: '006_create_cart_items_table', migration: migration006.migration },
  { name: '007_create_orders_table', migration: migration007.migration },
  { name: '008_create_order_items_table', migration: migration008.migration },
  { name: '009_create_order_status_history_table', migration: migration009.migration },
  { name: '010_create_reviews_table', migration: migration010.migration },
  { name: '011_create_daily_statistics_table', migration: migration011.migration },
];

