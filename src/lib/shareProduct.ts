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
 * Canonical, production storefront origin. Shared links must point here (not
 * `window.location.origin`, which is `localhost` in dev / a test host) so the
 * URL a shopper copies or posts always opens the real, branded shop.
 */
export const STORE_BASE_URL = 'https://www.robotechy.com';

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
 * The product's canonical page on the Robotechy storefront itself. The `/:nip19`
 * route resolves the naddr to the product detail page, so this is the branded,
 * works-for-everyone link (with a Buy button) — the primary thing we share.
 */
export function buildStoreUrl(naddr: string): string {
  return `${STORE_BASE_URL}/${naddr}`;
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
  storeUrl: string;
  /** Product photo. Placed in the body so clients (Primal, Damus…) render it inline. */
  imageUrl?: string;
}

/**
 * The human-readable body of the kind-1 note. The product photo goes in the body
 * (a bare image URL is what Nostr clients render inline), followed by the
 * storefront link — the branded, buy-here destination. The njump link is left
 * out of the body on purpose: clients like Primal try to inline-embed a njump
 * `naddr` link as a mentioned event, and a NIP-99 (kind-30402) listing renders
 * as "Mentioned event not found". njump is kept as an `r` tag instead (see
 * `buildShareNoteEvent`).
 */
export function buildShareNoteContent({
  title,
  priceLabel,
  storeUrl,
  imageUrl,
}: ShareNoteContentInput): string {
  const intro = `Check out ${title} on Robotechy ⚡ ${priceLabel}`;
  return [intro, imageUrl, storeUrl].filter(Boolean).join('\n\n');
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
 * Build the kind-1 note template that references a product: the body carries the
 * product photo and the storefront link, an `a` tag points at the addressable
 * product event, `r` tags carry the store and njump URLs (njump stays a tag so
 * it doesn't trigger a failed inline-embed in the body), and — when present — a
 * NIP-92 `imeta` tag describes the product photo. This is a fresh note; it never
 * edits an existing event.
 */
export function buildShareNoteEvent(input: ShareNoteEventInput): ShareNoteEventTemplate {
  const naddr = buildProductNaddr(input.pubkey, input.identifier, input.relays);
  const storeUrl = buildStoreUrl(naddr);
  const njumpUrl = buildNjumpUrl(naddr);
  const content =
    input.content ??
    buildShareNoteContent({
      title: input.title,
      priceLabel: formatPriceLabel(input.price),
      storeUrl,
      imageUrl: input.imageUrl,
    });

  const tags: string[][] = [
    ['a', buildProductAddress(input.pubkey, input.identifier)],
    ['r', storeUrl],
    ['r', njumpUrl],
  ];
  if (input.imageUrl) {
    // NIP-92: attach the image as media metadata (the URL is also in `content`,
    // which is what actually renders inline across clients).
    tags.push(['imeta', `url ${input.imageUrl}`]);
  }

  return { kind: 1, content, tags };
}
