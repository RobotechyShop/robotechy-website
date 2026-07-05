import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';

import {
  PRODUCT_KIND,
  STORE_BASE_URL,
  buildProductAddress,
  buildProductNaddr,
  buildNjumpUrl,
  buildStoreUrl,
  formatPriceLabel,
  buildShareNoteContent,
  buildShareNoteEvent,
} from './shareProduct';

// A throwaway hex pubkey (32 bytes) used across the tests.
const PUBKEY = '0'.repeat(63) + '1';
const D = 'widget-3000';

describe('buildProductAddress', () => {
  it('builds a 30402:<pubkey>:<d> coordinate', () => {
    expect(buildProductAddress(PUBKEY, D)).toBe(`30402:${PUBKEY}:${D}`);
  });
});

describe('buildProductNaddr', () => {
  it('round-trips to a kind-30402 addressable pointer', () => {
    const naddr = buildProductNaddr(PUBKEY, D);
    expect(naddr.startsWith('naddr1')).toBe(true);

    const decoded = nip19.decode(naddr);
    expect(decoded.type).toBe('naddr');
    const data = decoded.data as nip19.AddressPointer;
    expect(data.kind).toBe(PRODUCT_KIND);
    expect(data.pubkey).toBe(PUBKEY);
    expect(data.identifier).toBe(D);
  });

  it('encodes relay hints when provided', () => {
    const naddr = buildProductNaddr(PUBKEY, D, ['wss://relay.example']);
    const data = nip19.decode(naddr).data as nip19.AddressPointer;
    expect(data.relays).toEqual(['wss://relay.example']);
  });
});

describe('buildNjumpUrl', () => {
  it('prefixes the naddr with njump.me', () => {
    expect(buildNjumpUrl('naddr1abc')).toBe('https://njump.me/naddr1abc');
  });
});

describe('buildStoreUrl', () => {
  it('prefixes the naddr with the canonical storefront origin', () => {
    // Pin the production origin once so a stray edit to the constant is caught,
    // then assert the helper composes the URL from it.
    expect(STORE_BASE_URL).toBe('https://www.robotechy.com');
    expect(buildStoreUrl('naddr1abc')).toBe(`${STORE_BASE_URL}/naddr1abc`);
  });
});

describe('formatPriceLabel', () => {
  it('renders whole sats with thousands separators', () => {
    expect(formatPriceLabel({ amount: '21000', currency: 'sats' })).toBe('21,000 sats');
  });

  it('rounds fractional sats to whole numbers', () => {
    expect(formatPriceLabel({ amount: '999.6', currency: 'SAT' })).toBe('1,000 sats');
  });

  it('falls back to the shared formatter for fiat', () => {
    expect(formatPriceLabel({ amount: '49', currency: 'USD' })).toBe('$49.00');
  });
});

describe('buildShareNoteContent', () => {
  it('composes the body with the product photo then the store link, no njump', () => {
    expect(
      buildShareNoteContent({
        title: 'Widget 3000',
        priceLabel: '21,000 sats',
        storeUrl: 'https://www.robotechy.com/naddr1abc',
        imageUrl: 'https://img.example/widget.png',
      })
    ).toBe(
      'Check out Widget 3000 on Robotechy ⚡ 21,000 sats\n\n' +
        'https://img.example/widget.png\n\n' +
        'https://www.robotechy.com/naddr1abc'
    );
  });

  it('drops the image line when there is no photo', () => {
    expect(
      buildShareNoteContent({
        title: 'No Photo',
        priceLabel: '1,000 sats',
        storeUrl: 'https://www.robotechy.com/naddr1abc',
      })
    ).toBe('Check out No Photo on Robotechy ⚡ 1,000 sats\n\nhttps://www.robotechy.com/naddr1abc');
  });
});

describe('buildShareNoteEvent', () => {
  it('puts the photo + store link in the body, njump as an r tag, image as imeta', () => {
    const event = buildShareNoteEvent({
      pubkey: PUBKEY,
      identifier: D,
      title: 'Widget 3000',
      price: { amount: '21000', currency: 'sats' },
      imageUrl: 'https://img.example/widget.png',
    });

    expect(event.kind).toBe(1);

    const naddr = buildProductNaddr(PUBKEY, D);
    const storeUrl = buildStoreUrl(naddr);
    const njumpUrl = buildNjumpUrl(naddr);
    expect(event.content).toBe(
      `Check out Widget 3000 on Robotechy ⚡ 21,000 sats\n\nhttps://img.example/widget.png\n\n${storeUrl}`
    );
    // njump is referenced but never appears in the body (avoids Primal's
    // "Mentioned event not found" for the kind-30402 listing).
    expect(event.content).not.toContain('njump.me');

    expect(event.tags).toContainEqual(['a', `30402:${PUBKEY}:${D}`]);
    expect(event.tags).toContainEqual(['r', storeUrl]);
    expect(event.tags).toContainEqual(['r', njumpUrl]);
    expect(event.tags).toContainEqual(['imeta', 'url https://img.example/widget.png']);
    // No non-standard bare `image` tag.
    expect(event.tags.some(([name]) => name === 'image')).toBe(false);
  });

  it('omits the imeta tag when there is no image', () => {
    const event = buildShareNoteEvent({
      pubkey: PUBKEY,
      identifier: D,
      title: 'No Photo',
      price: { amount: '1000', currency: 'sats' },
    });
    expect(event.tags.some(([name]) => name === 'imeta')).toBe(false);
  });

  it('honours an edited body but keeps the product tags', () => {
    const event = buildShareNoteEvent({
      pubkey: PUBKEY,
      identifier: D,
      title: 'Widget 3000',
      price: { amount: '21000', currency: 'sats' },
      content: 'My own words about this',
    });
    expect(event.content).toBe('My own words about this');
    expect(event.tags).toContainEqual(['a', `30402:${PUBKEY}:${D}`]);
  });
});
