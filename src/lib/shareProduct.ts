/**
 * Pure helpers for sharing a NIP-99 (kind 30402) product to Nostr.
 *
 * These build the shareable identifiers and the kind-1 note that the
 * `<ShareProductButton>` publishes, kept free of React/Nostrify so they can be
 * unit-tested in isolation.
 */
import { nip19 } from 'nostr-tools';

import { formatPriceFromTag, type ProductData } from '@/lib/productUtils';

/** NIP-99 / Gamma Markets product event kind. */
export const PRODUCT_KIND = 30402;

/**
 * The addressable-event coordinate for a product, used as the value of an `a`
 * tag (NIP-01): `30402:<merchant-pubkey>:<d-identifier>`.
 */
export function buildProductAddress(pubkey: string, identifier: string): string {
  return `${PRODUCT_KIND}:${pubkey}:${identifier}`;
}

/**
 * Encode a product as an `naddr` (NIP-19), the portable pointer to an
 * addressable event that njump and other clients can resolve.
 */
export function buildProductNaddr(pubkey: string, identifier: string, relays?: string[]): string {
  return nip19.naddrEncode({
    kind: PRODUCT_KIND,
    pubkey,
    identifier,
    ...(relays && relays.length ? { relays } : {}),
  });
}

/** A shareable web link that renders the product via njump. */
export function buildNjumpUrl(naddr: string): string {
  return `https://njump.me/${naddr}`;
}

/**
 * Format a product price for the share note. Sats are shown as whole numbers
 * (no fractional sats); every other currency falls back to the storefront's
 * shared price formatter so the wording matches what the card/detail show.
 */
export function formatPriceLabel(price: ProductData['price']): string {
  const currency = price.currency?.toUpperCase();
  if (currency === 'SAT' || currency === 'SATS') {
    const sats = Math.round(parseFloat(price.amount) || 0);
    return `${sats.toLocaleString('en-US')} sats`;
  }
  return formatPriceFromTag(price);
}

export interface ShareNoteContentInput {
  title: string;
  priceLabel: string;
  njumpUrl: string;
}

/**
 * The human-readable body of the kind-1 note, e.g.
 * `Check out Widget on Robotechy ⚡ 21,000 sats\n\nhttps://njump.me/naddr1…`.
 */
export function buildShareNoteContent({
  title,
  priceLabel,
  njumpUrl,
}: ShareNoteContentInput): string {
  return `Check out ${title} on Robotechy ⚡ ${priceLabel}\n\n${njumpUrl}`;
}

export interface ShareNoteEventInput {
  pubkey: string;
  identifier: string;
  title: string;
  price: ProductData['price'];
  imageUrl?: string;
  relays?: string[];
  /** Override the note body (e.g. when the user edits it before posting). */
  content?: string;
}

export interface ShareNoteEventTemplate {
  kind: number;
  content: string;
  tags: string[][];
}

/**
 * Build the kind-1 note template that references a product: the body links to
 * the product via njump, an `a` tag points at the addressable product event, an
 * `r` tag carries the njump URL, and (when present) an `image` tag carries the
 * product photo. This is a fresh note — it never edits an existing event.
 */
export function buildShareNoteEvent(input: ShareNoteEventInput): ShareNoteEventTemplate {
  const naddr = buildProductNaddr(input.pubkey, input.identifier, input.relays);
  const njumpUrl = buildNjumpUrl(naddr);
  const content =
    input.content ??
    buildShareNoteContent({
      title: input.title,
      priceLabel: formatPriceLabel(input.price),
      njumpUrl,
    });

  const tags: string[][] = [
    ['a', buildProductAddress(input.pubkey, input.identifier)],
    ['r', njumpUrl],
  ];
  if (input.imageUrl) {
    tags.push(['image', input.imageUrl]);
  }

  return { kind: 1, content, tags };
}
