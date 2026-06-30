import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Product reviews with ratings — kind 31555 (NIP-99 / Gamma Markets spec).
 *
 * A review is an addressable event keyed by a `d` tag holding the reviewed
 * product's coordinate (`a:30402:<merchantPubkey>:<productDTag>`). Because the
 * `d` tag is the product coordinate, each reviewer's review of a given product
 * is replaceable — re-publishing with the same `d` edits their review.
 *
 * Tags:
 *   ['d', 'a:30402:<merchantPubkey>:<productDTag>']  (REQUIRED — product ref)
 *   ['rating', '<0..1>', 'thumb']                    (REQUIRED — overall rating)
 *   ['rating', '<0..1>', '<category>']               (OPTIONAL — per category)
 * content: free-text review.
 *
 * Ratings are stored on a 0..1 scale (so 4/5 stars → 0.8). The UI works in
 * 1..5 stars and converts at the boundary.
 */

/** Nostr event kind for product reviews (Gamma Markets spec). */
export const REVIEW_KIND = 31555;

/** Product listing kind these reviews reference (NIP-99 classified listing). */
export const PRODUCT_KIND = 30402;

/** Maximum number of stars in the rating UI. */
export const STARS_MAX = 5;

/** A single category rating, in stars (1..5). */
export interface CategoryStars {
  category: string;
  stars: number;
}

/** A parsed, display-ready review. */
export interface ParsedReview {
  id: string;
  pubkey: string;
  /** Overall ("thumb") rating in stars, 0..5. */
  stars: number;
  /** Overall ("thumb") rating on the raw 0..1 scale. */
  rating: number;
  /** Optional per-category ratings, in stars. */
  categories: CategoryStars[];
  text: string;
  createdAt: number;
}

/** Aggregate rating summary for a product. */
export interface ReviewAggregate {
  /** Mean overall rating in stars, 0..5 (0 when there are no reviews). */
  average: number;
  /** Number of distinct reviewers. */
  count: number;
}

/**
 * Build the `d`-tag coordinate that identifies a reviewed product:
 * `a:30402:<merchantPubkey>:<productDTag>`.
 */
export function productReviewCoord(merchantPubkey: string, productDTag: string): string {
  return `a:${PRODUCT_KIND}:${merchantPubkey}:${productDTag}`;
}

/**
 * True when `value` is a well-formed product-review coordinate:
 * `a:30402:<64-hex pubkey>:<non-empty dTag>`. The dTag itself may contain
 * colons, so everything after the pubkey is treated as the identifier.
 */
export function isProductReviewCoord(value: string): boolean {
  const parts = value.split(':');
  return (
    parts.length >= 4 &&
    parts[0] === 'a' &&
    parts[1] === String(PRODUCT_KIND) &&
    /^[0-9a-f]{64}$/i.test(parts[2]) &&
    parts.slice(3).join(':').length > 0
  );
}

/** Convert a 1..5 star value to the stored 0..1 rating (clamped). */
export function starsToRating(stars: number): number {
  if (!Number.isFinite(stars)) return 0;
  const clamped = Math.max(0, Math.min(STARS_MAX, stars));
  return clamped / STARS_MAX;
}

/** Convert a stored 0..1 rating to a 0..5 star value (clamped, tolerant). */
export function ratingToStars(rating: number): number {
  if (!Number.isFinite(rating)) return 0;
  const clamped = Math.max(0, Math.min(1, rating));
  return clamped * STARS_MAX;
}

/** Format a 0..1 rating as a compact, relay-friendly string (e.g. 0.8, 1). */
function formatRating(rating: number): string {
  // Trim floating-point noise (e.g. 0.30000000000000004) while staying within 0..1.
  return parseFloat(Math.max(0, Math.min(1, rating)).toFixed(4)).toString();
}

export interface BuildReviewInput {
  /** Product coordinate: `a:30402:<merchantPubkey>:<productDTag>`. */
  coord: string;
  /** Overall rating, 1..5 stars. */
  stars: number;
  /** Free-text review (may be empty). */
  content?: string;
  /** Optional per-category ratings, in stars. */
  categories?: CategoryStars[];
}

/** Template for a kind-31555 review event (unsigned). */
export interface ReviewEventTemplate {
  kind: typeof REVIEW_KIND;
  content: string;
  tags: string[][];
}

/**
 * Build an unsigned kind-31555 review event template. Re-publishing with the
 * same `coord` (same `d` tag) replaces the author's previous review.
 */
export function buildReviewEvent(input: BuildReviewInput): ReviewEventTemplate {
  const tags: string[][] = [
    ['d', input.coord],
    ['rating', formatRating(starsToRating(input.stars)), 'thumb'],
  ];

  for (const cr of input.categories ?? []) {
    if (!cr.category || cr.category === 'thumb' || cr.stars <= 0) continue;
    tags.push(['rating', formatRating(starsToRating(cr.stars)), cr.category]);
  }

  return {
    kind: REVIEW_KIND,
    content: input.content?.trim() ?? '',
    tags,
  };
}

/**
 * Parse a kind-31555 event into a display-ready review. Tolerant of malformed
 * tags: an event without a well-formed `d` product coordinate yields `null`; a
 * missing/invalid `thumb` rating yields `null` (skipped); non-numeric category
 * ratings are dropped.
 */
export function parseReviewEvent(event: NostrEvent): ParsedReview | null {
  if (!event || event.kind !== REVIEW_KIND) return null;

  // The `d` tag is the product coordinate and is REQUIRED (see module docstring).
  // Without a well-formed `a:30402:<pubkey>:<dTag>` coordinate the event can't be
  // attributed to a product, so drop it rather than treating a stray kind-31555
  // event that merely carries a `thumb` rating as a valid review.
  const dTag = event.tags.find((t) => t[0] === 'd');
  if (!dTag || typeof dTag[1] !== 'string' || !isProductReviewCoord(dTag[1])) return null;

  const ratingTags = event.tags.filter((t) => t[0] === 'rating' && typeof t[1] === 'string');

  const thumbTag = ratingTags.find((t) => t[2] === 'thumb');
  if (!thumbTag) return null; // a review without an overall rating is unusable

  // A non-numeric overall rating makes the review unusable — skip it rather
  // than counting it as 0 stars (which would unfairly drag aggregates down).
  const parsedThumb = parseFloat(thumbTag[1]);
  if (!Number.isFinite(parsedThumb)) return null;
  const rating = Math.max(0, Math.min(1, parsedThumb));

  const categories: CategoryStars[] = ratingTags
    .filter((t) => t[2] && t[2] !== 'thumb')
    .map((t) => ({ category: t[2], parsed: parseFloat(t[1]) }))
    // Drop non-numeric category ratings rather than coercing them to 0 stars,
    // so malformed relay data never leaks into the parsed output.
    .filter((c) => Number.isFinite(c.parsed))
    .map((c) => ({
      category: c.category,
      stars: ratingToStars(Math.max(0, Math.min(1, c.parsed))),
    }));

  return {
    id: event.id,
    pubkey: event.pubkey,
    rating,
    stars: ratingToStars(rating),
    categories,
    text: event.content ?? '',
    createdAt: event.created_at ?? 0,
  };
}

/**
 * Keep only the newest event per author (reviews are replaceable per reviewer
 * per product). Relays should already enforce this, but we de-dupe defensively.
 */
export function dedupeNewestPerAuthor(events: NostrEvent[]): NostrEvent[] {
  const byAuthor = new Map<string, NostrEvent>();
  for (const e of events) {
    const existing = byAuthor.get(e.pubkey);
    // Treat a missing `created_at` as 0 so malformed events without a timestamp
    // never win over (or unpredictably tie with) a well-formed newer event.
    if (!existing || (e.created_at ?? 0) > (existing.created_at ?? 0)) {
      byAuthor.set(e.pubkey, e);
    }
  }
  return [...byAuthor.values()];
}

/**
 * Parse a batch of review events: de-dupe to the newest per author, drop
 * malformed events, and sort newest first.
 */
export function parseReviews(events: NostrEvent[]): ParsedReview[] {
  return dedupeNewestPerAuthor(events)
    .map(parseReviewEvent)
    .filter((r): r is ParsedReview => r !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Aggregate parsed reviews into an average (in stars, 0..5) and a count. */
export function aggregateReviews(reviews: ParsedReview[]): ReviewAggregate {
  if (reviews.length === 0) return { average: 0, count: 0 };
  const sum = reviews.reduce((acc, r) => acc + r.stars, 0);
  return { average: sum / reviews.length, count: reviews.length };
}
