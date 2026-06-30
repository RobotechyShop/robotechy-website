/**
 * Store-owner product management helpers.
 *
 * Pure builders that turn form data into unsigned Nostr event templates for the
 * NIP-99 + Gamma Markets catalog. Signing/publishing is done by the app's
 * existing publish path (`useNostrPublish`), so these functions never touch a
 * signer and are trivially unit-testable.
 *
 * Gamma Markets terminology (verified against the spec):
 *   - kind 30402 — product listing (NIP-99 classified listing).
 *   - kind 30405 — collection: an addressable grouping of products. This is the
 *     storefront's browsable taxonomy (the "Categories" filter dropdown).
 *   - kind 30406 — shipping option (method / zones / cost).
 *   - `t` tags  — free-text *categories* attached to an individual product.
 *
 * So a product carries `t` categories (edited in the product dialog), while
 * *collections* (kind 30405) are the persistent taxonomy that groups products
 * and drives the storefront filter (managed in the collections dialog).
 *
 * Spec: https://github.com/GammaMarkets/market-spec/blob/main/spec.md
 */
import type { NostrEvent } from '@nostrify/nostrify';

export const PRODUCT_KIND = 30402;
export const COLLECTION_KIND = 30405;
export const SHIPPING_OPTION_KIND = 30406;
export const DELETE_KIND = 5; // NIP-09 deletion request

/** Tag names that the product form owns and fully rebuilds on every save. */
const MANAGED_PRODUCT_TAGS = new Set([
  'd',
  'title',
  'summary',
  'price',
  'image',
  'type',
  'visibility',
  'stock',
  'location',
  't',
  'published_at',
  'client',
]);
// NOTE: NIP-99 `status` ("active"/"sold") is intentionally NOT managed here — the
// form edits Gamma `visibility`, not `status`. Leaving it unmanaged means an
// existing `status` tag is preserved on edit rather than silently dropped.

export type ProductVisibility = 'hidden' | 'on-sale' | 'pre-order';
export type ProductFormatType = 'simple' | 'variable' | 'variation';
export type ProductMedium = 'digital' | 'physical';

export interface ProductFormData {
  /** d-tag identifier. Omitted/empty when creating; reused verbatim when editing. */
  id?: string;
  title: string;
  summary?: string;
  /** Markdown description -> event content. */
  description?: string;
  priceAmount: string;
  priceCurrency: string;
  priceFrequency?: string;
  /** Image URLs in display order. */
  images: string[];
  visibility?: ProductVisibility;
  /** Stock count as a string; blank = no stock tag (unlimited). */
  stock?: string;
  productType?: ProductFormatType;
  medium?: ProductMedium;
  location?: string;
  /** Free-text `t` categories. */
  categories: string[];
}

/** The addressable `d` identifier of an event, or undefined if absent. */
export function getDTag(event: NostrEvent): string | undefined {
  return event.tags.find(([name]) => name === 'd')?.[1];
}

/** Slugify a title into a stable, URL-safe d-tag identifier. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'product'
  );
}

/** A short, cryptographically-random hex suffix for uniquifying d-tags. */
function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

/** Generate a fresh, collision-resistant d-tag for a new listing. */
export function generateProductId(title: string): string {
  return `${slugify(title)}-${randomSuffix()}`;
}

/** Validate product form input; returns a list of human-readable errors. */
export function validateProductForm(data: ProductFormData): string[] {
  const errors: string[] = [];
  if (!data.title?.trim()) errors.push('Title is required.');
  const amount = Number(data.priceAmount);
  if (data.priceAmount?.trim() === '' || !Number.isFinite(amount) || amount < 0) {
    errors.push('Price must be a non-negative number.');
  }
  if (!data.priceCurrency?.trim()) errors.push('Currency is required.');
  for (const url of data.images) {
    if (url.trim() && !/^https?:\/\//i.test(url.trim())) {
      errors.push(`Image URL must start with http(s): "${url}"`);
    }
  }
  if (data.stock !== undefined && data.stock.trim() !== '') {
    const stock = Number(data.stock);
    if (!Number.isInteger(stock) || stock < 0) errors.push('Stock must be a non-negative integer.');
  }
  return errors;
}

/**
 * Build the unsigned event template for a product listing (kind 30402).
 *
 * On edit, pass the existing event so unmanaged tags (spec, weight, dim,
 * geohash, collection `a` refs, shipping_option refs) are preserved and the
 * original `published_at` is kept — the new event replaces the old one because
 * it carries the same `d` tag (addressable/replaceable).
 */
export function buildProductEvent(
  data: ProductFormData,
  existing?: NostrEvent
): { kind: number; content: string; tags: string[][]; created_at: number } {
  const now = Math.floor(Date.now() / 1000);
  const dTag =
    data.id?.trim() ||
    existing?.tags.find(([name]) => name === 'd')?.[1] ||
    generateProductId(data.title);

  const publishedAt =
    existing?.tags.find(([name]) => name === 'published_at')?.[1] || now.toString();

  const tags: string[][] = [['d', dTag]];
  tags.push(['title', data.title.trim()]);

  if (data.summary?.trim()) tags.push(['summary', data.summary.trim()]);

  const price: string[] = ['price', data.priceAmount.trim(), data.priceCurrency.trim()];
  if (data.priceFrequency?.trim()) price.push(data.priceFrequency.trim());
  tags.push(price);

  // Images: ["image", url, dimensions, sort-order]. Dimensions unknown -> "".
  data.images
    .map((u) => u.trim())
    .filter(Boolean)
    .forEach((url, index) => tags.push(['image', url, '', index.toString()]));

  if (data.productType || data.medium) {
    tags.push(['type', data.productType || 'simple', data.medium || 'physical']);
  }

  if (data.visibility) tags.push(['visibility', data.visibility]);

  if (data.stock !== undefined && data.stock.trim() !== '') {
    tags.push(['stock', data.stock.trim()]);
  }

  if (data.location?.trim()) tags.push(['location', data.location.trim()]);

  // De-duplicated, non-empty category `t` tags.
  Array.from(new Set(data.categories.map((c) => c.trim()).filter(Boolean))).forEach((category) =>
    tags.push(['t', category])
  );

  tags.push(['published_at', publishedAt]);

  // Preserve tags the form does not manage (spec, weight, dim, g, a, shipping_option, ...).
  if (existing) {
    for (const tag of existing.tags) {
      if (!MANAGED_PRODUCT_TAGS.has(tag[0])) tags.push(tag);
    }
  }

  return {
    kind: PRODUCT_KIND,
    content: data.description ?? existing?.content ?? '',
    tags,
    created_at: now,
  };
}

/**
 * Build a NIP-09 deletion request (kind 5) that tombstones a product.
 *
 * Mirrors PlebeianApp/market: a single kind 5 event whose only reference is the
 * addressable coordinate `a = 30402:<pubkey>:<d>`. Addressable/replaceable
 * events MUST be deleted by `a` coordinate (not `e`/event id) so every version
 * sharing that `d` tag is removed. We additionally include the recommended
 * NIP-09 `k` (kind) hint. No `expiration` tag and no `status=sold` step.
 */
export function buildProductDeleteEvent(event: NostrEvent): {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
} {
  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  if (!dTag) {
    throw new Error('Cannot delete a product without a d tag (addressable identifier).');
  }
  const coordinate = `${PRODUCT_KIND}:${event.pubkey}:${dTag}`;
  return {
    kind: DELETE_KIND,
    content: 'Product deleted',
    tags: [
      ['a', coordinate],
      ['k', PRODUCT_KIND.toString()],
    ],
    created_at: Math.floor(Date.now() / 1000),
  };
}

// ---------------------------------------------------------------------------
// Shipping options (kind 30406)
// ---------------------------------------------------------------------------

export type ShippingService = 'standard' | 'express' | 'overnight' | 'pickup';

export interface ShippingFormData {
  id?: string;
  title: string;
  priceAmount: string;
  priceCurrency: string;
  /** ISO 3166-1 alpha-2 country codes. */
  countries: string[];
  service: ShippingService;
  carrier?: string;
}

export function validateShippingForm(data: ShippingFormData): string[] {
  const errors: string[] = [];
  if (!data.title?.trim()) errors.push('Shipping title is required.');
  const amount = Number(data.priceAmount);
  if (data.priceAmount?.trim() === '' || !Number.isFinite(amount) || amount < 0) {
    errors.push('Shipping price must be a non-negative number.');
  }
  if (!data.priceCurrency?.trim()) errors.push('Currency is required.');
  if (data.countries.filter((c) => c.trim()).length === 0) {
    errors.push('At least one destination country is required.');
  }
  return errors;
}

/** Build the unsigned event template for a shipping option (kind 30406). */
export function buildShippingOptionEvent(
  data: ShippingFormData,
  existing?: NostrEvent
): { kind: number; content: string; tags: string[][]; created_at: number } {
  const now = Math.floor(Date.now() / 1000);
  const dTag =
    data.id?.trim() ||
    existing?.tags.find(([name]) => name === 'd')?.[1] ||
    `ship-${slugify(data.title)}-${randomSuffix()}`;

  const countries = Array.from(
    new Set(data.countries.map((c) => c.trim().toUpperCase()).filter(Boolean))
  );

  const tags: string[][] = [
    ['d', dTag],
    ['title', data.title.trim()],
    ['price', data.priceAmount.trim(), data.priceCurrency.trim()],
    // Gamma encodes destination countries as a single multi-value tag.
    ['country', ...countries],
    ['service', data.service],
  ];
  if (data.carrier?.trim()) tags.push(['carrier', data.carrier.trim()]);

  // Preserve Gamma tags the form does not manage (region, duration, location,
  // g, weight-*/dim-*/price-* …) so editing an option keeps its other zones and
  // semantics instead of silently dropping them.
  if (existing) {
    const managed = new Set(['d', 'title', 'price', 'country', 'service', 'carrier', 'client']);
    for (const tag of existing.tags) {
      if (!managed.has(tag[0])) tags.push(tag);
    }
  }

  return {
    kind: SHIPPING_OPTION_KIND,
    content: existing?.content ?? '',
    tags,
    created_at: now,
  };
}

// ---------------------------------------------------------------------------
// Collections (kind 30405) — the storefront's category taxonomy
// ---------------------------------------------------------------------------

export interface CollectionFormData {
  id?: string;
  title: string;
  description?: string;
  image?: string;
  /** d-tags of the products that belong to this collection. */
  productIds: string[];
}

export function validateCollectionForm(data: CollectionFormData): string[] {
  const errors: string[] = [];
  if (!data.title?.trim()) errors.push('Collection title is required.');
  return errors;
}

/**
 * Build the unsigned event template for a collection (kind 30405).
 *
 * Membership is stored on the collection as `a` references to products
 * (`30402:<merchantPubkey>:<productD>`) — the same direction the storefront's
 * `useCollections`/Index filter already reads.
 */
export function buildCollectionEvent(
  data: CollectionFormData,
  merchantPubkey: string,
  existing?: NostrEvent
): { kind: number; content: string; tags: string[][]; created_at: number } {
  const now = Math.floor(Date.now() / 1000);
  // New collections get a unique suffix so two collections with the same title
  // don't collide on the same addressable `d` (which would silently replace the
  // first). Edits keep the existing `d` stable.
  const dTag =
    data.id?.trim() ||
    existing?.tags.find(([name]) => name === 'd')?.[1] ||
    `collection-${slugify(data.title)}-${randomSuffix()}`;

  const tags: string[][] = [
    ['d', dTag],
    ['title', data.title.trim()],
  ];
  if (data.image?.trim()) tags.push(['image', data.image.trim()]);

  Array.from(new Set(data.productIds.map((id) => id.trim()).filter(Boolean))).forEach((productId) =>
    tags.push(['a', `${PRODUCT_KIND}:${merchantPubkey}:${productId}`])
  );

  // Preserve unmanaged tags (summary, location, g, shipping_option) on edit.
  if (existing) {
    const managed = new Set(['d', 'title', 'image', 'a', 'client']);
    for (const tag of existing.tags) {
      if (!managed.has(tag[0])) tags.push(tag);
    }
  }

  return {
    kind: COLLECTION_KIND,
    content: data.description ?? existing?.content ?? '',
    tags,
    created_at: now,
  };
}

/** Build a NIP-09 deletion request (kind 5) for a collection. */
export function buildCollectionDeleteEvent(event: NostrEvent): {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
} {
  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  if (!dTag) {
    throw new Error('Cannot delete a collection without a d tag (addressable identifier).');
  }
  return {
    kind: DELETE_KIND,
    content: 'Collection deleted',
    tags: [
      ['a', `${COLLECTION_KIND}:${event.pubkey}:${dTag}`],
      ['k', COLLECTION_KIND.toString()],
    ],
    created_at: Math.floor(Date.now() / 1000),
  };
}

/** Build a NIP-09 deletion request (kind 5) for a shipping option. */
export function buildShippingOptionDeleteEvent(event: NostrEvent): {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
} {
  const dTag = event.tags.find(([name]) => name === 'd')?.[1];
  if (!dTag) {
    throw new Error('Cannot delete a shipping option without a d tag (addressable identifier).');
  }
  return {
    kind: DELETE_KIND,
    content: 'Shipping option deleted',
    tags: [
      ['a', `${SHIPPING_OPTION_KIND}:${event.pubkey}:${dTag}`],
      ['k', SHIPPING_OPTION_KIND.toString()],
    ],
    created_at: Math.floor(Date.now() / 1000),
  };
}

/** Map a parsed product event into editable form data. */
export function productEventToFormData(event: NostrEvent): ProductFormData {
  const get = (name: string) => event.tags.find(([n]) => n === name)?.[1];
  const priceTag = event.tags.find(([n]) => n === 'price');
  const typeTag = event.tags.find(([n]) => n === 'type');
  return {
    id: get('d') || '',
    title: get('title') || '',
    summary: get('summary') || '',
    description: event.content || '',
    priceAmount: priceTag?.[1] || '',
    priceCurrency: priceTag?.[2] || 'USD',
    priceFrequency: priceTag?.[3] || '',
    // Order images by the NIP-99/Gamma sort-order field (4th element), matching
    // parseProductEvent, so opening a product for edit preserves image order.
    images: event.tags
      .filter(([n]) => n === 'image')
      .map(([, url, , sortOrder]) => ({ url, sortOrder: sortOrder ? parseInt(sortOrder, 10) : 0 }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ url }) => url),
    visibility: (get('visibility') as ProductVisibility) || 'on-sale',
    stock: get('stock') || '',
    productType: (typeTag?.[1] as ProductFormatType) || 'simple',
    medium: (typeTag?.[2] as ProductMedium) || 'physical',
    location: get('location') || '',
    categories: event.tags.filter(([n]) => n === 't').map(([, t]) => t),
  };
}
