import type { ProductData } from './productUtils';
import { formatPriceFromTag } from './productUtils';

// Canonical production origin. Used as a fallback when a fully-qualified URL
// cannot be derived from the browser (e.g. SSR / pre-render contexts, tests).
export const SITE_URL = 'https://robotechy.com';
export const SITE_NAME = 'Robotechy';

// Social platforms truncate long descriptions; keep ours within the widely-used
// ~160 character budget so previews don't get clipped mid-word.
export const MAX_DESCRIPTION_LENGTH = 160;

/** A single `<meta>` tag, keyed by either `property` (Open Graph) or `name` (Twitter / standard). */
export interface MetaTag {
  property?: string;
  name?: string;
  content: string;
}

/** Head input accepted by `useHead` — a document title plus a flat list of meta tags. */
export interface ProductHead {
  title: string;
  meta: MetaTag[];
}

/**
 * Truncate `text` to at most `max` characters, appending an ellipsis (counted
 * within the budget) when the text is longer. Mirrors PlebeianApp/market#459.
 */
export function truncateDescription(text: string, max: number = MAX_DESCRIPTION_LENGTH): string {
  if (text.length <= max) return text;
  // Reserve one character for the single-glyph ellipsis so the result never
  // exceeds `max` (trailing whitespace before the ellipsis is trimmed).
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Build the Open Graph / Twitter Card meta tags for a product detail page.
 *
 * Ported from the user's own PlebeianApp/market#459, adapted to Robotechy's
 * NIP-99 (`ProductData`) shape and `@unhead/react` head management. Emits the
 * same tag family: `og:*` (type=product, title, description, url, site_name,
 * image), `product:price:*`, and `twitter:*` (summary_large_image).
 *
 * NOTE: Robotechy is a client-rendered SPA, so these tags are injected at
 * runtime and are visible to in-app navigation, native share sheets and any
 * future SSR/pre-render — but NOT to social crawlers, which read the raw HTML
 * shell. Store-level previews are handled statically in index.html. See the PR
 * "Limitations / follow-up" section.
 *
 * @param product Parsed NIP-99 product.
 * @param url     Fully-qualified page URL (e.g. `window.location.href`).
 */
export function buildProductMeta(product: ProductData, url: string): ProductHead {
  const title = product.title;
  const rawDescription = product.summary || product.content || '';
  const description = truncateDescription(rawDescription);
  const image = product.images[0]?.url;
  const priceText = formatPriceFromTag(product.price);

  const meta: MetaTag[] = [
    { name: 'description', content: description },

    // Open Graph
    { property: 'og:type', content: 'product' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:site_name', content: SITE_NAME },

    // Twitter Card
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    {
      name: 'twitter:description',
      content: priceText ? `${description} — ${priceText}` : description,
    },
  ];

  if (image) {
    meta.push(
      { property: 'og:image', content: image },
      { property: 'og:image:alt', content: title },
      { name: 'twitter:image', content: image }
    );
  }

  // Structured product price (Open Graph product namespace).
  meta.push(
    { property: 'product:price:amount', content: product.price.amount },
    { property: 'product:price:currency', content: product.price.currency }
  );

  return {
    title: `${title} | ${SITE_NAME}`,
    meta,
  };
}
