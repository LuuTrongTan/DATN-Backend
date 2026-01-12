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
import * as migration009 from './20251120_000009_create_reviews_table';
import * as migration010 from './20251120_000010_create_user_addresses_table';
import * as migration011 from './20251120_000011_create_wishlist_table';
import * as migration012 from './20251120_000012_create_shipping_table';
import * as migration013 from './20251120_000013_create_refunds_table';
import * as migration014 from './20251120_000014_create_refund_items_table';
import * as migration015 from './20251120_000015_enable_vector_search';
import * as migration016 from './20251120_000016_create_payment_transactions_table';
import * as migration017 from './20251120_000017_create_notifications_table';
import * as migration018 from './20251120_000018_create_product_tags_table';
import * as migration020 from './20251120_000020_create_product_media_table';
import * as migration021 from './20251222_000001_add_variant_id_to_product_media';
import * as migration022 from './20251222_000002_add_order_items_snapshot';

export const migrations: MigrationInfo[] = [
  { name: '20251120_000001_create_users_table', migration: migration001.migration },
  { name: '20251120_000002_create_verification_codes_table', migration: migration002.migration },
  { name: '20251120_000003_create_categories_table', migration: migration003.migration },
  { name: '20251120_000004_create_products_table', migration: migration004.migration },
  { name: '20251120_000005_create_product_variants_table', migration: migration005.migration },
  { name: '20251120_000006_create_cart_items_table', migration: migration006.migration },
  { name: '20251120_000007_create_orders_table', migration: migration007.migration },
  { name: '20251120_000008_create_order_items_table', migration: migration008.migration },
  { name: '20251120_000009_create_reviews_table', migration: migration009.migration },
  { name: '20251120_000010_create_user_addresses_table', migration: migration010.migration },
  { name: '20251120_000011_create_wishlist_table', migration: migration011.migration },
  { name: '20251120_000012_create_shipping_table', migration: migration012.migration },
  { name: '20251120_000013_create_refunds_table', migration: migration013.migration },
  { name: '20251120_000014_create_refund_items_table', migration: migration014.migration },
  { name: '20251120_000015_enable_vector_search', migration: migration015.migration },
  { name: '20251120_000016_create_payment_transactions_table', migration: migration016.migration },
  { name: '20251120_000017_create_notifications_table', migration: migration017.migration },
  { name: '20251120_000018_create_product_tags_table', migration: migration018.migration },
  { name: '20251120_000020_create_product_media_table', migration: migration020.migration },
  { name: '20251222_000001_add_variant_id_to_product_media', migration: migration021.migration },
  { name: '20251222_000002_add_order_items_snapshot', migration: migration022.migration },
];
