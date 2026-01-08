import type { NostrEvent } from '@nostrify/nostrify';

// Gamma Markets Kind 30406 Shipping Option
export interface ShippingOptionData {
  id: string;                    // d-tag identifier
  title: string;
  price: {
    amount: string;
    currency: string;
  };
  countries: string[];           // ISO 3166-1 alpha-2 codes
  regions: string[];             // ISO 3166-2 codes
  service?: 'standard' | 'express' | 'overnight' | 'pickup';
  duration?: {
    min: string;
    max: string;
    unit: string;                // H, D, W (ISO 8601)
  };
  carrier?: string;
  pubkey: string;                // Publisher pubkey for naddr reference
  extraCost?: string;            // Product-specific extra cost
}

export function parseShippingOptionEvent(event: NostrEvent, extraCost?: string): ShippingOptionData | null {
  const d = event.tags.find(([name]) => name === 'd')?.[1];
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  const priceTag = event.tags.find(([name]) => name === 'price');

  if (!d || !title || !priceTag) return null;

  const countries = event.tags
    .filter(([name]) => name === 'country')
    .map(([, code]) => code);

  const regions = event.tags
    .filter(([name]) => name === 'region')
    .map(([, code]) => code);

  const serviceTag = event.tags.find(([name]) => name === 'service')?.[1];
  const durationTag = event.tags.find(([name]) => name === 'duration');
  const carrier = event.tags.find(([name]) => name === 'carrier')?.[1];

  return {
    id: d,
    title,
    price: {
      amount: priceTag[1] || '0',
      currency: priceTag[2] || 'USD',
    },
    countries,
    regions,
    service: serviceTag as ShippingOptionData['service'],
    duration: durationTag ? {
      min: durationTag[1],
      max: durationTag[2],
      unit: durationTag[3],
    } : undefined,
    carrier,
    pubkey: event.pubkey,
    extraCost,
  };
}

export interface ProductData {
  id: string;
  title: string;
  summary?: string;
  content: string;
  price: {
    amount: string;
    currency: string;
    frequency?: string;
  };
  images: Array<{
    url: string;
    dimensions?: string;
    sortOrder?: number;
  }>;
  type?: {
    productType: 'simple' | 'variable' | 'variation';
    format: 'digital' | 'physical';
  };
  visibility?: 'hidden' | 'on-sale' | 'pre-order';
  stock?: number;
  specs: [string, string][];
  weight?: {
    value: string;
    unit: string;
  };
  dimensions?: {
    value: string;
    unit: string;
  };
  location?: string;
  geohash?: string;
  categories: string[];
  collections: string[];
  shippingOptions: string[];
  event: NostrEvent;
}

export function parseProductEvent(event: NostrEvent): ProductData | null {
  const d = event.tags.find(([name]) => name === 'd')?.[1];
  const title = event.tags.find(([name]) => name === 'title')?.[1];
  const priceTag = event.tags.find(([name]) => name === 'price');

  if (!d || !title || !priceTag) return null;

  const summary = event.tags.find(([name]) => name === 'summary')?.[1];
  const visibility = event.tags.find(([name]) => name === 'visibility')?.[1] as 'hidden' | 'on-sale' | 'pre-order' | undefined;
  const stockTag = event.tags.find(([name]) => name === 'stock')?.[1];
  const location = event.tags.find(([name]) => name === 'location')?.[1];
  const geohash = event.tags.find(([name]) => name === 'g')?.[1];

  const price = {
    amount: priceTag[1] || '0',
    currency: priceTag[2] || 'USD',
    frequency: priceTag[3],
  };

  // Parse type tag
  const typeTag = event.tags.find(([name]) => name === 'type');
  const type = typeTag ? {
    productType: (typeTag[1] || 'simple') as 'simple' | 'variable' | 'variation',
    format: (typeTag[2] || 'digital') as 'digital' | 'physical',
  } : undefined;

  // Parse images with dimensions and sort order
  const imageTags = event.tags.filter(([name]) => name === 'image');

  const images = imageTags
    .map(([, url, dimensions, sortOrder]) => ({
      url,
      dimensions: dimensions || undefined,
      sortOrder: sortOrder ? parseInt(sortOrder) : undefined,
    }))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  // Parse specs
  const specs = event.tags
    .filter(([name]) => name === 'spec')
    .map(([, key, value]) => [key, value] as [string, string]);

  // Parse weight
  const weightTag = event.tags.find(([name]) => name === 'weight');
  const weight = weightTag ? {
    value: weightTag[1],
    unit: weightTag[2],
  } : undefined;

  // Parse dimensions
  const dimTag = event.tags.find(([name]) => name === 'dim');
  const dimensions = dimTag ? {
    value: dimTag[1],
    unit: dimTag[2],
  } : undefined;

  const categories = event.tags
    .filter(([name]) => name === 't')
    .map(([, category]) => category);

  const collections = event.tags
    .filter(([name]) => name === 'a' && name.startsWith('30405:'))
    .map(([, ref]) => ref);

  const shippingOptions = event.tags
    .filter(([name]) => name === 'shipping_option')
    .map(([, ref]) => ref);

  return {
    id: d,
    title,
    summary,
    content: event.content,
    price,
    images,
    type,
    visibility,
    stock: stockTag ? parseInt(stockTag) : undefined,
    specs,
    weight,
    dimensions,
    location,
    geohash,
    categories,
    collections,
    shippingOptions,
    event,
  };
}

export function formatPrice(price: number, currency: string): string {
  const amount = price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  switch (currency.toUpperCase()) {
    case 'USD':
      return `$${amount}`;
    case 'EUR':
      return `€${amount}`;
    case 'GBP':
      return `£${amount}`;
    case 'BTC':
      return `₿${amount}`;
    case 'SATS':
    case 'SAT':
      return `${amount} sats`;
    default:
      return `${amount} ${currency}`;
  }
}

export function formatPriceFromTag(priceTag: { amount: string; currency: string; frequency?: string }): string {
  const amount = parseFloat(priceTag.amount);
  let formatted = formatPrice(amount, priceTag.currency);

  if (priceTag.frequency) {
    formatted += ` / ${priceTag.frequency}`;
  }

  return formatted;
}

export interface CollectionData {
  id: string;
  title: string;
  description?: string;
  summary?: string;
  image?: string;
  location?: string;
  geohash?: string;
  products: string[];
  shippingOptions: string[];
}

export function parseCollectionEvent(event: NostrEvent): CollectionData | null {
  const d = event.tags.find(([name]) => name === 'd')?.[1];
  const title = event.tags.find(([name]) => name === 'title')?.[1];

  if (!d || !title) return null;

  const summary = event.tags.find(([name]) => name === 'summary')?.[1];
  const image = event.tags.find(([name]) => name === 'image')?.[1];
  const location = event.tags.find(([name]) => name === 'location')?.[1];
  const geohash = event.tags.find(([name]) => name === 'g')?.[1];

  const products = event.tags
    .filter(([name]) => name === 'a' && name.startsWith('30402:'))
    .map(([, ref]) => ref);

  const shippingOptions = event.tags
    .filter(([name]) => name === 'shipping_option')
    .map(([, ref]) => ref);

  return {
    id: d,
    title,
    description: event.content || undefined,
    summary,
    image,
    location,
    geohash,
    products,
    shippingOptions,
  };
}
