import { describe, it, expect, vi } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';

import { republishCatalog, CATALOG_KINDS, type RepublishNostr } from './useRepublishCatalog';
import { MERCHANT_PUBKEY } from './useProducts';
import { PRODUCT_KIND, COLLECTION_KIND, SHIPPING_OPTION_KIND } from '@/lib/productAdmin';

function ev(kind: number, id: string): NostrEvent {
  return {
    id,
    kind,
    pubkey: MERCHANT_PUBKEY,
    created_at: 1,
    tags: [['d', id]],
    content: '',
    sig: 'x'.repeat(128),
  };
}

describe('republishCatalog', () => {
  it('queries the merchant catalog kinds and re-broadcasts each event', async () => {
    const events = [ev(PRODUCT_KIND, 'p1'), ev(PRODUCT_KIND, 'p2'), ev(COLLECTION_KIND, 'c1')];
    const query = vi.fn().mockResolvedValue(events);
    const event = vi.fn().mockResolvedValue(undefined);
    const nostr: RepublishNostr = { query, event };

    const result = await republishCatalog(nostr);

    // Queries exactly the catalog kinds, authored by the merchant.
    const filter = query.mock.calls[0][0][0];
    expect(filter.kinds).toEqual(CATALOG_KINDS);
    expect(filter.authors).toEqual([MERCHANT_PUBKEY]);

    // Re-broadcasts each existing event verbatim (no re-signing).
    expect(event).toHaveBeenCalledTimes(3);
    expect(event.mock.calls.map((c) => c[0].id)).toEqual(['p1', 'p2', 'c1']);

    expect(result).toEqual({
      found: 3,
      republished: 3,
      byKind: { [PRODUCT_KIND]: 2, [COLLECTION_KIND]: 1 },
    });
  });

  it('counts only successful re-broadcasts when a relay publish rejects', async () => {
    const events = [ev(PRODUCT_KIND, 'p1'), ev(SHIPPING_OPTION_KIND, 's1')];
    const query = vi.fn().mockResolvedValue(events);
    const event = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('relay rejected'));
    const nostr: RepublishNostr = { query, event };

    const result = await republishCatalog(nostr);

    expect(result).toEqual({
      found: 2,
      republished: 1,
      byKind: { [PRODUCT_KIND]: 1 },
    });
  });

  it('reports nothing found when the catalog query is empty', async () => {
    const nostr: RepublishNostr = {
      query: vi.fn().mockResolvedValue([]),
      event: vi.fn(),
    };

    const result = await republishCatalog(nostr);

    expect(result).toEqual({ found: 0, republished: 0, byKind: {} });
    expect(nostr.event).not.toHaveBeenCalled();
  });
});
