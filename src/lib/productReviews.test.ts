import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  REVIEW_KIND,
  STARS_MAX,
  productReviewCoord,
  starsToRating,
  ratingToStars,
  buildReviewEvent,
  parseReviewEvent,
  dedupeNewestPerAuthor,
  parseReviews,
  aggregateReviews,
} from './productReviews';

const MERCHANT = 'f'.repeat(64);
const D_TAG = 'cool-widget-123';
const COORD = `a:30402:${MERCHANT}:${D_TAG}`;

function makeReview(
  partial: Partial<NostrEvent> & { tags?: string[][]; pubkey?: string }
): NostrEvent {
  return {
    id: Math.random().toString(36).slice(2),
    kind: REVIEW_KIND,
    pubkey: 'a'.repeat(64),
    created_at: 1000,
    content: '',
    tags: [],
    sig: '',
    ...partial,
  } as NostrEvent;
}

describe('productReviewCoord', () => {
  it('builds the a:30402:<pubkey>:<d> coordinate', () => {
    expect(productReviewCoord(MERCHANT, D_TAG)).toBe(COORD);
  });
});

describe('starsToRating / ratingToStars', () => {
  it('maps 5 stars to 1.0 and back', () => {
    expect(starsToRating(5)).toBe(1);
    expect(ratingToStars(1)).toBe(5);
  });

  it('maps 4 stars to 0.8 (the spec example)', () => {
    expect(starsToRating(4)).toBeCloseTo(0.8, 10);
    expect(ratingToStars(0.8)).toBeCloseTo(4, 10);
  });

  it('round-trips every whole-star value', () => {
    for (let s = 0; s <= STARS_MAX; s++) {
      expect(ratingToStars(starsToRating(s))).toBeCloseTo(s, 10);
    }
  });

  it('clamps out-of-range and tolerates NaN', () => {
    expect(starsToRating(9)).toBe(1);
    expect(starsToRating(-2)).toBe(0);
    expect(starsToRating(NaN)).toBe(0);
    expect(ratingToStars(5)).toBe(5); // 0..1 clamp → 1 → 5 stars
    expect(ratingToStars(-1)).toBe(0);
    expect(ratingToStars(NaN)).toBe(0);
  });
});

describe('buildReviewEvent', () => {
  it('builds a kind-31555 event with required d and thumb tags', () => {
    const evt = buildReviewEvent({ coord: COORD, stars: 4, content: '  Great!  ' });
    expect(evt.kind).toBe(REVIEW_KIND);
    expect(evt.content).toBe('Great!'); // trimmed
    expect(evt.tags).toContainEqual(['d', COORD]);
    expect(evt.tags).toContainEqual(['rating', '0.8', 'thumb']);
  });

  it('encodes 5 stars as rating 1', () => {
    const evt = buildReviewEvent({ coord: COORD, stars: 5, content: '' });
    expect(evt.tags).toContainEqual(['rating', '1', 'thumb']);
  });

  it('appends optional category ratings and skips empty ones', () => {
    const evt = buildReviewEvent({
      coord: COORD,
      stars: 4,
      content: '',
      categories: [
        { category: 'quality', stars: 5 },
        { category: 'delivery', stars: 0 }, // skipped (no rating given)
        { category: 'thumb', stars: 3 }, // skipped (reserved literal)
      ],
    });
    expect(evt.tags).toContainEqual(['rating', '1', 'quality']);
    expect(evt.tags.filter((t) => t[0] === 'rating')).toHaveLength(2); // thumb + quality
  });
});

describe('parseReviewEvent', () => {
  it('parses stars, rating, text and time', () => {
    const evt = makeReview({
      pubkey: 'b'.repeat(64),
      created_at: 1700,
      content: 'Solid build',
      tags: [
        ['d', COORD],
        ['rating', '0.8', 'thumb'],
        ['rating', '0.6', 'quality'],
      ],
    });
    const parsed = parseReviewEvent(evt);
    expect(parsed).not.toBeNull();
    expect(parsed!.pubkey).toBe('b'.repeat(64));
    expect(parsed!.rating).toBeCloseTo(0.8, 10);
    expect(parsed!.stars).toBeCloseTo(4, 10);
    expect(parsed!.text).toBe('Solid build');
    expect(parsed!.createdAt).toBe(1700);
    expect(parsed!.categories).toEqual([{ category: 'quality', stars: 3 }]);
  });

  it('drops non-numeric category ratings rather than coercing them to 0', () => {
    const evt = makeReview({
      tags: [
        ['d', COORD],
        ['rating', '1', 'thumb'],
        ['rating', '0.6', 'quality'],
        ['rating', 'bogus', 'delivery'], // dropped, not 0 stars
      ],
    });
    expect(parseReviewEvent(evt)!.categories).toEqual([{ category: 'quality', stars: 3 }]);
  });

  it('returns null for the wrong kind', () => {
    expect(parseReviewEvent(makeReview({ kind: 1 }))).toBeNull();
  });

  it('drops a kind-31555 event with no d tag', () => {
    const evt = makeReview({
      tags: [['rating', '0.8', 'thumb']], // a thumb rating but no product coordinate
    });
    expect(parseReviewEvent(evt)).toBeNull();
  });

  it('drops a d tag that is not a 30402 product coordinate', () => {
    const evt = makeReview({
      tags: [
        ['d', 'just-an-identifier'],
        ['rating', '0.8', 'thumb'],
      ],
    });
    expect(parseReviewEvent(evt)).toBeNull();
  });

  it('returns null when the thumb rating is missing', () => {
    const evt = makeReview({
      tags: [
        ['d', COORD],
        ['rating', '0.5', 'quality'],
      ],
    });
    expect(parseReviewEvent(evt)).toBeNull();
  });

  it('returns null for a malformed (non-numeric) thumb rating', () => {
    const evt = makeReview({
      tags: [
        ['d', COORD],
        ['rating', 'not-a-number', 'thumb'],
      ],
    });
    expect(parseReviewEvent(evt)).toBeNull();
  });

  it('clamps an out-of-range rating into 0..1', () => {
    const evt = makeReview({
      tags: [
        ['d', COORD],
        ['rating', '7', 'thumb'],
      ],
    });
    expect(parseReviewEvent(evt)!.rating).toBe(1);
  });
});

describe('dedupeNewestPerAuthor', () => {
  it('keeps only the newest event per author', () => {
    const old = makeReview({ id: 'old', pubkey: 'x'.repeat(64), created_at: 100 });
    const fresh = makeReview({ id: 'fresh', pubkey: 'x'.repeat(64), created_at: 200 });
    const other = makeReview({ id: 'other', pubkey: 'y'.repeat(64), created_at: 150 });
    const deduped = dedupeNewestPerAuthor([old, fresh, other]);
    expect(deduped).toHaveLength(2);
    expect(deduped.find((e) => e.pubkey === 'x'.repeat(64))!.id).toBe('fresh');
  });

  it('treats a missing created_at as 0 so a timestamped event still wins', () => {
    const noTs = makeReview({ id: 'no-ts', pubkey: 'z'.repeat(64) });
    delete (noTs as { created_at?: number }).created_at;
    const dated = makeReview({ id: 'dated', pubkey: 'z'.repeat(64), created_at: 50 });
    // Order the missing-timestamp event last to prove it doesn't overwrite the dated one.
    const deduped = dedupeNewestPerAuthor([dated, noTs]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('dated');
  });
});

describe('parseReviews', () => {
  it('de-dupes newest-per-author, drops malformed, and sorts newest first', () => {
    const events: NostrEvent[] = [
      makeReview({
        id: 'a1',
        pubkey: 'a'.repeat(64),
        created_at: 100,
        tags: [
          ['d', COORD],
          ['rating', '0.6', 'thumb'],
        ],
      }),
      makeReview({
        id: 'a2',
        pubkey: 'a'.repeat(64),
        created_at: 300, // newer edit by same author — wins
        tags: [
          ['d', COORD],
          ['rating', '1', 'thumb'],
        ],
      }),
      makeReview({
        id: 'b1',
        pubkey: 'b'.repeat(64),
        created_at: 200,
        tags: [
          ['d', COORD],
          ['rating', '0.4', 'thumb'],
        ],
      }),
      makeReview({
        id: 'bad',
        pubkey: 'c'.repeat(64),
        created_at: 250,
        tags: [['d', COORD]], // no thumb → dropped
      }),
    ];
    const reviews = parseReviews(events);
    expect(reviews.map((r) => r.id)).toEqual(['a2', 'b1']); // newest first, c dropped
    expect(reviews[0].stars).toBe(5);
  });
});

describe('aggregateReviews', () => {
  it('returns zeroes for no reviews', () => {
    expect(aggregateReviews([])).toEqual({ average: 0, count: 0 });
  });

  it('averages the star ratings and counts reviewers', () => {
    const reviews = parseReviews([
      makeReview({
        pubkey: 'a'.repeat(64),
        tags: [
          ['d', COORD],
          ['rating', '1', 'thumb'],
        ], // 5 stars
      }),
      makeReview({
        pubkey: 'b'.repeat(64),
        tags: [
          ['d', COORD],
          ['rating', '0.6', 'thumb'],
        ], // 3 stars
      }),
    ]);
    const agg = aggregateReviews(reviews);
    expect(agg.count).toBe(2);
    expect(agg.average).toBeCloseTo(4, 10); // (5 + 3) / 2
  });
});
