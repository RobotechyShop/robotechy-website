import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { parseShippingOptionEvent, parseCollectionEvent, parseProductEvent } from './productUtils';
import { buildShippingOptionEvent, buildCollectionEvent, buildProductEvent } from './productAdmin';

const toEvent = (
  tpl: { kind: number; content: string; tags: string[][] },
  pubkey = 'PK'
): NostrEvent => ({ id: 'x', sig: 's', created_at: 1, pubkey, ...tpl }) as NostrEvent;

describe('shipping option country round-trip (multi-value tag)', () => {
  it('parses every country from the single multi-value tag the builder emits', () => {
    const built = buildShippingOptionEvent({
      title: 'EU',
      priceAmount: '500',
      priceCurrency: 'SATS',
      countries: ['GB', 'IE', 'FR'],
      service: 'standard',
    });
    // Builder emits one multi-value tag.
    expect(built.tags.find(([n]) => n === 'country')).toEqual(['country', 'GB', 'IE', 'FR']);
    // Parser recovers all three (previously dropped all but the first).
    const parsed = parseShippingOptionEvent(toEvent(built));
    expect(parsed?.countries).toEqual(['GB', 'IE', 'FR']);
  });

  it('still handles one tag per country', () => {
    const event = toEvent({
      kind: 30406,
      content: '',
      tags: [
        ['d', 's1'],
        ['title', 'x'],
        ['price', '1', 'SATS'],
        ['country', 'GB'],
        ['country', 'IE'],
      ],
    });
    expect(parseShippingOptionEvent(event)?.countries).toEqual(['GB', 'IE']);
  });
});

describe('collection product membership round-trip', () => {
  it('recovers product refs from a built collection (a-tag value, not name)', () => {
    const built = buildCollectionEvent(
      { title: 'Seed Signers', productIds: ['p1', 'p2'] },
      'MERCHANT'
    );
    const parsed = parseCollectionEvent(toEvent(built, 'MERCHANT'));
    expect(parsed?.products).toEqual(['30402:MERCHANT:p1', '30402:MERCHANT:p2']);
  });
});

describe('product collection refs parse', () => {
  it('reads 30405 collection refs from a product a-tag', () => {
    const built = buildProductEvent(
      {
        title: 'Widget',
        priceAmount: '1',
        priceCurrency: 'SATS',
        images: [],
        categories: [],
      },
      toEvent({
        kind: 30402,
        content: '',
        tags: [
          ['d', 'widget'],
          ['a', '30405:MERCHANT:seed-signers'],
        ],
      })
    );
    expect(parseProductEvent(toEvent(built))?.collections).toEqual(['30405:MERCHANT:seed-signers']);
  });
});
