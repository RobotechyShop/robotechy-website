import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  getDTag,
  buildProductEvent,
  buildProductDeleteEvent,
  buildShippingOptionEvent,
  buildCollectionEvent,
  buildCollectionDeleteEvent,
  buildShippingOptionDeleteEvent,
  productEventToFormData,
  validateProductForm,
  validateShippingForm,
  validateCollectionForm,
  slugify,
  generateProductId,
  type ProductFormData,
} from './productAdmin';

const tagVal = (tags: string[][], name: string) => tags.find(([n]) => n === name)?.[1];
const tagsNamed = (tags: string[][], name: string) => tags.filter(([n]) => n === name);

const baseProduct: ProductFormData = {
  title: 'Seed Signer Case',
  summary: 'A sturdy case',
  description: 'Long **markdown** description',
  priceAmount: '21000',
  priceCurrency: 'SATS',
  images: ['https://img.example/a.png', 'https://img.example/b.png'],
  visibility: 'on-sale',
  stock: '5',
  productType: 'simple',
  medium: 'physical',
  location: 'UK',
  categories: ['seedsigner', 'cases', 'seedsigner'],
};

describe('getDTag', () => {
  it('returns the d-tag value, or undefined when absent', () => {
    expect(getDTag({ tags: [['d', 'abc']] } as unknown as NostrEvent)).toBe('abc');
    expect(getDTag({ tags: [['title', 'x']] } as unknown as NostrEvent)).toBeUndefined();
  });
});

describe('slugify / generateProductId', () => {
  it('produces url-safe slugs', () => {
    expect(slugify('Seed Signer Case!')).toBe('seed-signer-case');
    expect(slugify('   ')).toBe('product');
  });

  it('generates ids that start with the slug', () => {
    expect(generateProductId('Nostr Badge')).toMatch(/^nostr-badge-[0-9a-f]{8}$/);
  });
});

describe('buildProductEvent (create)', () => {
  const event = buildProductEvent(baseProduct);

  it('uses kind 30402 and carries the description as content', () => {
    expect(event.kind).toBe(30402);
    expect(event.content).toBe('Long **markdown** description');
  });

  it('generates a d tag and sets published_at', () => {
    expect(tagVal(event.tags, 'd')).toMatch(/^seed-signer-case-/);
    expect(tagVal(event.tags, 'published_at')).toBeTruthy();
  });

  it('builds the price tag with currency', () => {
    expect(event.tags.find(([n]) => n === 'price')).toEqual(['price', '21000', 'SATS']);
  });

  it('emits ordered image tags', () => {
    const images = tagsNamed(event.tags, 'image');
    expect(images).toHaveLength(2);
    expect(images[0]).toEqual(['image', 'https://img.example/a.png', '', '0']);
    expect(images[1]).toEqual(['image', 'https://img.example/b.png', '', '1']);
  });

  it('de-duplicates category t tags', () => {
    const cats = tagsNamed(event.tags, 't').map(([, c]) => c);
    expect(cats).toEqual(['seedsigner', 'cases']);
  });

  it('includes stock, visibility, type and location', () => {
    expect(tagVal(event.tags, 'stock')).toBe('5');
    expect(tagVal(event.tags, 'visibility')).toBe('on-sale');
    expect(event.tags.find(([n]) => n === 'type')).toEqual(['type', 'simple', 'physical']);
    expect(tagVal(event.tags, 'location')).toBe('UK');
  });
});

describe('buildProductEvent (edit)', () => {
  const existing: NostrEvent = {
    id: 'abc',
    pubkey: 'merchantpubkey',
    created_at: 1000,
    kind: 30402,
    content: 'old',
    sig: 'sig',
    tags: [
      ['d', 'fixed-id'],
      ['title', 'Old title'],
      ['price', '1', 'USD'],
      ['published_at', '900'],
      ['spec', 'color', 'black'],
      ['weight', '50', 'g'],
      ['shipping_option', '30406:merchantpubkey:ship-1', '0'],
      ['status', 'sold'],
      ['client', 'example.com'],
    ],
  };

  const event = buildProductEvent({ ...baseProduct, id: undefined }, existing);

  it('reuses the existing d tag (replaceable, same address)', () => {
    expect(tagVal(event.tags, 'd')).toBe('fixed-id');
  });

  it('preserves the original published_at', () => {
    expect(tagVal(event.tags, 'published_at')).toBe('900');
  });

  it('preserves unmanaged tags (spec, weight, shipping_option) but drops client', () => {
    expect(event.tags.find(([n]) => n === 'spec')).toEqual(['spec', 'color', 'black']);
    expect(event.tags.find(([n]) => n === 'weight')).toEqual(['weight', '50', 'g']);
    expect(event.tags.find(([n]) => n === 'shipping_option')?.[1]).toBe(
      '30406:merchantpubkey:ship-1'
    );
    expect(tagsNamed(event.tags, 'client')).toHaveLength(0);
  });

  it('preserves a NIP-99 status tag the form does not manage', () => {
    expect(event.tags.find(([n]) => n === 'status')).toEqual(['status', 'sold']);
  });

  it('does not duplicate managed tags from the original', () => {
    expect(tagsNamed(event.tags, 'title')).toHaveLength(1);
    expect(tagsNamed(event.tags, 'price')).toHaveLength(1);
  });
});

describe('buildProductDeleteEvent', () => {
  it('builds a NIP-09 kind 5 referencing the addressable coordinate', () => {
    const existing = {
      pubkey: 'PK',
      tags: [['d', 'fixed-id']],
    } as unknown as NostrEvent;
    const del = buildProductDeleteEvent(existing);
    expect(del.kind).toBe(5);
    expect(del.tags).toContainEqual(['a', '30402:PK:fixed-id']);
    expect(del.tags).toContainEqual(['k', '30402']);
    expect(del.content).toBe('Product deleted');
  });
});

describe('delete builders fail fast without a d tag', () => {
  const noD = { pubkey: 'PK', tags: [] } as unknown as NostrEvent;
  it('throws for products, collections and shipping options', () => {
    expect(() => buildProductDeleteEvent(noD)).toThrow(/d tag/);
    expect(() => buildCollectionDeleteEvent(noD)).toThrow(/d tag/);
    expect(() => buildShippingOptionDeleteEvent(noD)).toThrow(/d tag/);
  });
});

describe('productEventToFormData round-trips through buildProductEvent', () => {
  it('keeps the d tag and key fields stable', () => {
    const created = buildProductEvent({ ...baseProduct, id: 'stable-id' });
    const asEvent = {
      id: 'x',
      pubkey: 'PK',
      sig: 's',
      created_at: created.created_at,
      kind: created.kind,
      content: created.content,
      tags: created.tags,
    } as NostrEvent;

    const form = productEventToFormData(asEvent);
    expect(form.id).toBe('stable-id');
    expect(form.title).toBe('Seed Signer Case');
    expect(form.priceAmount).toBe('21000');
    expect(form.priceCurrency).toBe('SATS');
    expect(form.images).toEqual(['https://img.example/a.png', 'https://img.example/b.png']);
    expect(form.categories).toEqual(['seedsigner', 'cases']);

    const rebuilt = buildProductEvent(form, asEvent);
    expect(tagVal(rebuilt.tags, 'd')).toBe('stable-id');
  });

  it('orders images by sort-order, not raw tag order', () => {
    const event = {
      pubkey: 'PK',
      content: '',
      tags: [
        ['d', 'p'],
        ['title', 't'],
        ['price', '1', 'SATS'],
        ['image', 'https://img/second.png', '', '1'],
        ['image', 'https://img/first.png', '', '0'],
      ],
    } as unknown as NostrEvent;
    expect(productEventToFormData(event).images).toEqual([
      'https://img/first.png',
      'https://img/second.png',
    ]);
  });
});

describe('shipping options', () => {
  const event = buildShippingOptionEvent({
    title: 'UK Standard',
    priceAmount: '500',
    priceCurrency: 'SATS',
    countries: ['gb', 'GB', 'ie'],
    service: 'standard',
    carrier: 'Royal Mail',
  });

  it('uses kind 30406 with a country multi-value tag (uppercased, deduped)', () => {
    expect(event.kind).toBe(30406);
    expect(event.tags.find(([n]) => n === 'country')).toEqual(['country', 'GB', 'IE']);
    expect(event.tags.find(([n]) => n === 'service')).toEqual(['service', 'standard']);
    expect(tagVal(event.tags, 'carrier')).toBe('Royal Mail');
  });

  it('preserves unmanaged tags (region, duration) when editing', () => {
    const existing = {
      pubkey: 'PK',
      content: '',
      tags: [
        ['d', 'ship-uk'],
        ['title', 'old'],
        ['price', '1', 'SATS'],
        ['country', 'GB'],
        ['service', 'standard'],
        ['region', 'GB-ENG', 'GB-SCT'],
        ['duration', '2', '3', 'D'],
        ['client', 'example.com'],
      ],
    } as unknown as NostrEvent;
    const edited = buildShippingOptionEvent(
      {
        id: 'ship-uk',
        title: 'UK Standard',
        priceAmount: '500',
        priceCurrency: 'SATS',
        countries: ['GB'],
        service: 'standard',
      },
      existing
    );
    expect(edited.tags.find(([n]) => n === 'region')).toEqual(['region', 'GB-ENG', 'GB-SCT']);
    expect(edited.tags.find(([n]) => n === 'duration')).toEqual(['duration', '2', '3', 'D']);
    expect(tagsNamed(edited.tags, 'client')).toHaveLength(0);
    // Managed tags are still rebuilt, not duplicated.
    expect(tagsNamed(edited.tags, 'title')).toHaveLength(1);
    expect(tagVal(edited.tags, 'title')).toBe('UK Standard');
  });

  it('builds a kind 5 deletion for shipping options', () => {
    const del = buildShippingOptionDeleteEvent({
      pubkey: 'PK',
      tags: [['d', 's1']],
    } as unknown as NostrEvent);
    expect(del.kind).toBe(5);
    expect(del.tags).toContainEqual(['a', '30406:PK:s1']);
  });
});

describe('collections', () => {
  const event = buildCollectionEvent(
    { title: 'Seed Signers', description: 'group', productIds: ['p1', 'p2', 'p1'] },
    'MERCHANT'
  );

  it('uses kind 30405 and references products via a tags', () => {
    expect(event.kind).toBe(30405);
    const refs = tagsNamed(event.tags, 'a').map(([, r]) => r);
    expect(refs).toEqual(['30402:MERCHANT:p1', '30402:MERCHANT:p2']);
    expect(event.content).toBe('group');
  });

  it('gives new collections a unique d so same-title ones do not collide', () => {
    const a = buildCollectionEvent({ title: 'Seed Signers', productIds: [] }, 'MERCHANT');
    const b = buildCollectionEvent({ title: 'Seed Signers', productIds: [] }, 'MERCHANT');
    const dA = tagVal(a.tags, 'd');
    const dB = tagVal(b.tags, 'd');
    expect(dA).toMatch(/^collection-seed-signers-[0-9a-f]{8}$/);
    expect(dA).not.toBe(dB);
  });

  it('keeps the existing d stable when editing a collection', () => {
    const existing = {
      pubkey: 'MERCHANT',
      content: '',
      tags: [
        ['d', 'collection-seed-signers-deadbeef'],
        ['title', 'Old'],
      ],
    } as unknown as NostrEvent;
    const edited = buildCollectionEvent(
      { title: 'Seed Signers', productIds: ['p1'] },
      'MERCHANT',
      existing
    );
    expect(tagVal(edited.tags, 'd')).toBe('collection-seed-signers-deadbeef');
  });

  it('builds a kind 5 deletion for collections', () => {
    const del = buildCollectionDeleteEvent({
      pubkey: 'PK',
      tags: [['d', 'c1']],
    } as unknown as NostrEvent);
    expect(del.tags).toContainEqual(['a', '30405:PK:c1']);
  });
});

describe('validation', () => {
  it('rejects empty product title and bad price', () => {
    const errs = validateProductForm({ ...baseProduct, title: '', priceAmount: '-1' });
    expect(errs).toContain('Title is required.');
    expect(errs).toContain('Price must be a non-negative number.');
  });

  it('rejects non-http image URLs', () => {
    const errs = validateProductForm({ ...baseProduct, images: ['ftp://nope'] });
    expect(errs.some((e) => e.includes('http'))).toBe(true);
  });

  it('accepts a valid product', () => {
    expect(validateProductForm(baseProduct)).toEqual([]);
  });

  it('requires a shipping destination country', () => {
    const errs = validateShippingForm({
      title: 'x',
      priceAmount: '1',
      priceCurrency: 'SATS',
      countries: [],
      service: 'standard',
    });
    expect(errs).toContain('At least one destination country is required.');
  });

  it('requires a collection title', () => {
    expect(validateCollectionForm({ title: '', productIds: [] })).toContain(
      'Collection title is required.'
    );
  });
});
