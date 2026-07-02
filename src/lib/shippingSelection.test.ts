import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import type { ShippingOptionData } from '@/lib/productUtils';
import {
  shipsToCountry,
  filterShippingOptions,
  shippingCostFor,
  shippingOptionRef,
  productShippingRefs,
  collectCartShippingRefs,
} from './shippingSelection';

function option(overrides: Partial<ShippingOptionData> = {}): ShippingOptionData {
  return {
    id: 'uk-standard',
    title: 'UK Standard',
    price: { amount: '3.50', currency: 'GBP' },
    countries: ['GB'],
    regions: [],
    pubkey: 'merchant-pubkey',
    ...overrides,
  };
}

function productEvent(tags: string[][]): NostrEvent {
  return {
    id: 'e',
    kind: 30402,
    pubkey: 'merchant-pubkey',
    created_at: 0,
    content: '',
    sig: '',
    tags,
  };
}

describe('shipsToCountry', () => {
  it('matches a listed country (case-insensitively)', () => {
    expect(shipsToCountry(option({ countries: ['GB', 'IE'] }), 'gb')).toBe(true);
    expect(shipsToCountry(option({ countries: ['gb'] }), 'GB')).toBe(true);
  });

  it('rejects an unlisted country', () => {
    expect(shipsToCountry(option({ countries: ['GB'] }), 'AU')).toBe(false);
  });

  it('treats an option with no country restriction as worldwide', () => {
    expect(shipsToCountry(option({ countries: [] }), 'AU')).toBe(true);
  });

  it('matches alpha-3 codes from real-world events against the alpha-2 picker code', () => {
    // The shop's own published options carry alpha-3 ("GBR", "IRL") even though
    // the Gamma spec mandates alpha-2 — normalisation must bridge them.
    expect(shipsToCountry(option({ countries: ['GBR', 'IRL'] }), 'GB')).toBe(true);
    expect(shipsToCountry(option({ countries: ['GBR', 'IRL'] }), 'IE')).toBe(true);
    expect(shipsToCountry(option({ countries: ['GBR', 'IRL'] }), 'AU')).toBe(false);
    expect(shipsToCountry(option({ countries: ['DEU'] }), 'DE')).toBe(true);
  });

  it('rejects unrecognisable codes rather than accidentally matching', () => {
    expect(shipsToCountry(option({ countries: ['GB'] }), 'BRITAIN')).toBe(false);
    expect(shipsToCountry(option({ countries: ['NOTACODE'] }), 'GB')).toBe(false);
    // Unassigned 2-letter pairs must not pass validation either — "ZZ" is the
    // right length but is not an ISO 3166-1 assigned code.
    expect(shipsToCountry(option({ countries: ['ZZ'] }), 'GB')).toBe(false);
    expect(shipsToCountry(option({ countries: ['GB'] }), 'ZZ')).toBe(false);
  });
});

describe('filterShippingOptions', () => {
  const uk = option({ id: 'uk', countries: ['GB'] });
  const eu = option({ id: 'eu', countries: ['FR', 'DE', 'IE'] });
  const world = option({ id: 'world', countries: [] });

  it('keeps only options covering the selected country (worldwide always kept)', () => {
    expect(filterShippingOptions([uk, eu, world], 'GB').map((o) => o.id)).toEqual(['uk', 'world']);
    expect(filterShippingOptions([uk, eu, world], 'AU').map((o) => o.id)).toEqual(['world']);
  });

  it('returns everything when no country is chosen yet', () => {
    expect(filterShippingOptions([uk, eu], undefined)).toHaveLength(2);
  });
});

describe('shippingCostFor', () => {
  it('returns the base price in the option currency', () => {
    expect(shippingCostFor(option())).toEqual({ amount: 3.5, currency: 'GBP' });
  });

  it('adds the product extra-cost', () => {
    expect(shippingCostFor(option({ extraCost: '1.25' })).amount).toBeCloseTo(4.75);
  });

  it('treats unparseable numbers as 0 instead of NaN', () => {
    expect(shippingCostFor(option({ price: { amount: 'oops', currency: 'GBP' } })).amount).toBe(0);
    expect(shippingCostFor(option({ extraCost: 'oops' })).amount).toBeCloseTo(3.5);
  });
});

describe('shippingOptionRef', () => {
  it('builds the Gamma order shipping tag value', () => {
    expect(shippingOptionRef(option())).toBe('30406:merchant-pubkey:uk-standard');
  });
});

describe('productShippingRefs', () => {
  it('keeps the extra-cost element that ProductData drops', () => {
    const refs = productShippingRefs(
      productEvent([
        ['shipping_option', '30406:pk:uk', '2.00'],
        ['shipping_option', '30406:pk:eu'],
        ['title', 'not shipping'],
      ])
    );
    expect(refs).toEqual([
      { ref: '30406:pk:uk', extraCost: '2.00' },
      { ref: '30406:pk:eu', extraCost: undefined },
    ]);
  });
});

describe('collectCartShippingRefs', () => {
  it('dedupes refs across products, keeping the largest extra cost', () => {
    const refs = collectCartShippingRefs([
      productEvent([['shipping_option', '30406:pk:uk', '1.00']]),
      productEvent([
        ['shipping_option', '30406:pk:uk', '2.50'],
        ['shipping_option', '30406:pk:eu'],
      ]),
    ]);
    expect(refs).toEqual([
      { ref: '30406:pk:uk', extraCost: '2.50' },
      { ref: '30406:pk:eu', extraCost: undefined },
    ]);
  });
});
