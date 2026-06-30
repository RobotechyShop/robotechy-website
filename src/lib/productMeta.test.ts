import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import type { ProductData } from './productUtils';
import {
  buildProductMeta,
  truncateDescription,
  MAX_DESCRIPTION_LENGTH,
  SITE_NAME,
  type MetaTag,
} from './productMeta';

/** Build a minimal ProductData for tests, overriding only the fields under test. */
function makeProduct(overrides: Partial<ProductData> = {}): ProductData {
  return {
    id: 'seedsigner-case',
    title: 'SeedSigner Case',
    summary: 'A durable 3D-printed case for your SeedSigner.',
    content: 'Long markdown description body.',
    price: { amount: '15.00', currency: 'USD' },
    images: [{ url: 'https://example.com/case.png' }],
    specs: [],
    categories: [],
    collections: [],
    shippingOptions: [],
    event: {} as NostrEvent,
    ...overrides,
  };
}

/** Look up a meta tag's content by its `property` or `name` key. */
function contentOf(meta: MetaTag[], key: string): string | undefined {
  return meta.find((m) => m.property === key || m.name === key)?.content;
}

describe('truncateDescription', () => {
  it('leaves short text unchanged', () => {
    expect(truncateDescription('hello')).toBe('hello');
  });

  it('truncates long text within the budget (ellipsis included)', () => {
    const long = 'a'.repeat(300);
    const result = truncateDescription(long);
    expect(result.length).toBe(MAX_DESCRIPTION_LENGTH);
    expect(result.endsWith('…')).toBe(true);
  });

  it('respects a custom maximum (ellipsis counts toward the budget)', () => {
    const result = truncateDescription('abcdefghij', 5);
    expect(result).toBe('abcd…');
    expect(result.length).toBe(5);
  });
});

describe('buildProductMeta', () => {
  const url = 'https://robotechy.com/naddr1example';

  it('sets a branded document title', () => {
    const { title } = buildProductMeta(makeProduct(), url);
    expect(title).toBe(`SeedSigner Case | ${SITE_NAME}`);
  });

  it('emits product-typed Open Graph tags', () => {
    const { meta } = buildProductMeta(makeProduct(), url);
    expect(contentOf(meta, 'og:type')).toBe('product');
    expect(contentOf(meta, 'og:title')).toBe('SeedSigner Case');
    expect(contentOf(meta, 'og:url')).toBe(url);
    expect(contentOf(meta, 'og:site_name')).toBe(SITE_NAME);
    expect(contentOf(meta, 'og:description')).toBe(
      'A durable 3D-printed case for your SeedSigner.'
    );
  });

  it('uses the first product image for og:image and twitter:image', () => {
    const { meta } = buildProductMeta(makeProduct(), url);
    expect(contentOf(meta, 'og:image')).toBe('https://example.com/case.png');
    expect(contentOf(meta, 'twitter:image')).toBe('https://example.com/case.png');
    expect(contentOf(meta, 'og:image:alt')).toBe('SeedSigner Case');
  });

  it('omits image tags when the product has no images', () => {
    const { meta } = buildProductMeta(makeProduct({ images: [] }), url);
    expect(contentOf(meta, 'og:image')).toBeUndefined();
    expect(contentOf(meta, 'twitter:image')).toBeUndefined();
  });

  it('emits a summary_large_image Twitter card with a formatted price', () => {
    const { meta } = buildProductMeta(makeProduct(), url);
    expect(contentOf(meta, 'twitter:card')).toBe('summary_large_image');
    expect(contentOf(meta, 'twitter:title')).toBe('SeedSigner Case');
    expect(contentOf(meta, 'twitter:description')).toBe(
      'A durable 3D-printed case for your SeedSigner. — $15.00'
    );
  });

  it('emits structured product price tags', () => {
    const { meta } = buildProductMeta(makeProduct(), url);
    expect(contentOf(meta, 'product:price:amount')).toBe('15.00');
    expect(contentOf(meta, 'product:price:currency')).toBe('USD');
  });

  it('falls back to content when summary is absent and truncates it', () => {
    const product = makeProduct({ summary: undefined, content: 'x'.repeat(300) });
    const { meta } = buildProductMeta(product, url);
    const description = contentOf(meta, 'og:description')!;
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
    expect(description.endsWith('…')).toBe(true);
  });
});
