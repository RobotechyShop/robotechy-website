/**
 * loadCatalog: a partial relay failure must stay retryable rather than get the
 * order cancelled as "not in the catalogue".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../lib/catalog.js';
import { PRODUCT_KIND } from '../lib/pricing.js';
import { merchantPk, ref, shippingOption } from './helpers/shop.js';

const order = { items: [{ ref: ref('medallion') }] };

const pool = (listings, options) => ({
  querySync: async (_relays, filter) =>
    filter.kinds[0] === PRODUCT_KIND ? listings : options,
});

test('throws when shipping options arrive but the ordered listings do not', async () => {
  await assert.rejects(
    loadCatalog(pool([], [shippingOption('ship-uk', ['5.00', 'GBP'])]), ['wss://r'], order, merchantPk),
    /no relay returned the ordered listings/
  );
});

test('throws when no relay returned anything', async () => {
  await assert.rejects(
    loadCatalog(pool([], []), ['wss://r'], order, merchantPk),
    /Catalog unavailable/
  );
});
