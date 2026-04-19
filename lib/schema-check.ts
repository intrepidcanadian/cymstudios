import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

// Columns the server *writes* to each table. If any are missing at boot, we
// want to see it in the PM2 log immediately — not later when a user's purchase
// returns a 500. The list mirrors the inserts in app/api/purchase and related
// routes; keep them in sync when a migration adds a new column.
const EXPECTED_COLUMNS: Record<string, string[]> = {
  orders: [
    'order_id',
    'product_id',
    'brand_name',
    'country_name',
    'currency',
    'price',
    'user_id',
    'user_first_name',
    'user_last_name',
    'user_email',
    'product_image',
    'status',
    'payment_from',
    'payment_network',
    'payment_value',
  ],
  used_nonces: ['from_address', 'nonce', 'network', 'order_id'],
  verified_emails: ['email'],
};

export async function checkDatabaseSchema(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.warn('[SchemaCheck] Skipping: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const { error } = await supabase.from(table).select(expected.join(',')).limit(0);

    if (error) {
      logger.error(`[SchemaCheck] Table "${table}" schema drift — purchases will fail:`, {
        code: error.code,
        message: error.message,
        hint: error.hint,
        expectedColumns: expected,
      });
      continue;
    }

    logger.info(`[SchemaCheck] Table "${table}" OK (${expected.length} columns verified)`);
  }
}
