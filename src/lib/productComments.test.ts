import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  COMMENT_KIND,
  addressableCoord,
  buildCommentTags,
  commentFilterForRoot,
  commentRootRef,
  dTagOf,
  getTagValue,
  isTopLevelComment,
} from './productComments';

const MERCHANT = 'f'.repeat(64);
const COMMENTER = 'a'.repeat(64);
const D_TAG = 'cool-widget-123';
const PRODUCT_COORD = `30402:${MERCHANT}:${D_TAG}`;

/** A kind-30402 addressable product event. */
function makeProduct(partial: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'product-id',
    kind: 30402,
    pubkey: MERCHANT,
    created_at: 1000,
    content: '',
    tags: [['d', D_TAG]],
    sig: '',
    ...partial,
  } as NostrEvent;
}

// Deterministic, collision-free id generator for test comments — avoids
// Math.random() so failures reproduce identically.
let commentSeq = 0;

/** A kind-1111 comment event. */
function makeComment(tags: string[][], partial: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: `comment-${++commentSeq}`,
    kind: COMMENT_KIND,
    pubkey: COMMENTER,
    created_at: 2000,
    content: 'nice product',
    tags,
    sig: '',
    ...partial,
  } as NostrEvent;
}

describe('getTagValue / dTagOf', () => {
  it('reads the first value of a tag and falls back to undefined', () => {
    const product = makeProduct();
    expect(getTagValue(product, 'd')).toBe(D_TAG);
    expect(getTagValue(product, 'missing')).toBeUndefined();
  });

  it('dTagOf returns the d tag, or empty string when absent', () => {
    expect(dTagOf(makeProduct())).toBe(D_TAG);
    expect(dTagOf(makeProduct({ tags: [] }))).toBe('');
  });
});

describe('addressableCoord', () => {
  it('builds <kind>:<pubkey>:<d> for an addressable product', () => {
    expect(addressableCoord(makeProduct())).toBe(PRODUCT_COORD);
  });

  it('uses an empty d segment for events without a d tag', () => {
    expect(addressableCoord(makeProduct({ kind: 0, tags: [] }))).toBe(`0:${MERCHANT}:`);
  });
});

describe('commentRootRef', () => {
  it('uses the coordinate (not the event id) for an addressable product', () => {
    expect(commentRootRef(makeProduct())).toBe(PRODUCT_COORD);
  });

  it('is stable across listing edits that change the event id', () => {
    const v1 = makeProduct({ id: 'id-v1' });
    const v2 = makeProduct({ id: 'id-v2' });
    expect(commentRootRef(v1)).toBe(commentRootRef(v2));
  });

  it('uses an empty d segment for a replaceable root', () => {
    expect(commentRootRef(makeProduct({ kind: 0, tags: [] }))).toBe(`0:${MERCHANT}:`);
  });

  it('uses the event id for a regular (non-addressable) root', () => {
    expect(commentRootRef(makeProduct({ kind: 1, id: 'note1', tags: [] }))).toBe('note1');
  });

  it('uses the href for a URL root', () => {
    expect(commentRootRef(new URL('https://shop.example/p/1'))).toBe('https://shop.example/p/1');
  });
});

describe('commentFilterForRoot', () => {
  it('filters by #A for an addressable product root', () => {
    const filter = commentFilterForRoot(makeProduct());
    expect(filter.kinds).toEqual([COMMENT_KIND]);
    expect(filter['#A']).toEqual([PRODUCT_COORD]);
    expect(filter.limit).toBeUndefined();
  });

  it('passes through a numeric limit', () => {
    expect(commentFilterForRoot(makeProduct(), 50).limit).toBe(50);
  });

  it('filters by #I for a URL root', () => {
    const filter = commentFilterForRoot(new URL('https://shop.example/p/1'));
    expect(filter['#I']).toEqual(['https://shop.example/p/1']);
    expect(filter['#A']).toBeUndefined();
  });

  it('filters by #A with an empty d for a replaceable root', () => {
    const filter = commentFilterForRoot(makeProduct({ kind: 0, tags: [] }));
    expect(filter['#A']).toEqual([`0:${MERCHANT}:`]);
  });

  it('filters by #E for a regular (non-addressable) root', () => {
    const filter = commentFilterForRoot(makeProduct({ kind: 1, id: 'note1', tags: [] }));
    expect(filter['#E']).toEqual(['note1']);
  });
});

describe('isTopLevelComment', () => {
  const product = makeProduct();

  it('is true when the lowercase a tag points at the product coordinate', () => {
    const comment = makeComment([['a', PRODUCT_COORD]]);
    expect(isTopLevelComment(comment, product)).toBe(true);
  });

  it('is false for a reply whose lowercase parent tag is an e tag (the parent comment), not the product a tag', () => {
    const comment = makeComment([
      ['A', PRODUCT_COORD], // uppercase root scope still points at the product
      ['e', 'some-parent-comment'], // lowercase parent is another comment → not top-level
    ]);
    expect(isTopLevelComment(comment, product)).toBe(false);
  });

  it('matches the i tag for a URL root', () => {
    const root = new URL('https://shop.example/p/1');
    expect(isTopLevelComment(makeComment([['i', root.toString()]]), root)).toBe(true);
    expect(isTopLevelComment(makeComment([['i', 'https://other/']]), root)).toBe(false);
  });

  it('matches the e tag for a regular root', () => {
    const root = makeProduct({ kind: 1, id: 'note1', tags: [] });
    expect(isTopLevelComment(makeComment([['e', 'note1']]), root)).toBe(true);
  });
});

describe('buildCommentTags', () => {
  it('builds NIP-22 tags for a top-level comment on an addressable product', () => {
    const tags = buildCommentTags(makeProduct());
    // Uppercase root scope.
    expect(tags).toContainEqual(['A', PRODUCT_COORD]);
    expect(tags).toContainEqual(['K', '30402']);
    expect(tags).toContainEqual(['P', MERCHANT]);
    // Lowercase parent scope mirrors the root for a top-level comment.
    expect(tags).toContainEqual(['a', PRODUCT_COORD]);
    expect(tags).toContainEqual(['k', '30402']);
    expect(tags).toContainEqual(['p', MERCHANT]);
  });

  it('points the lowercase parent tags at the reply target when replying', () => {
    const root = makeProduct();
    const parentComment = makeComment([['a', PRODUCT_COORD]], {
      id: 'parent-comment-id',
      pubkey: COMMENTER,
    });
    const tags = buildCommentTags(root, parentComment);

    // Root stays the product (uppercase).
    expect(tags).toContainEqual(['A', PRODUCT_COORD]);
    // Parent is the comment being replied to (lowercase e/k/p).
    expect(tags).toContainEqual(['e', 'parent-comment-id']);
    expect(tags).toContainEqual(['k', String(COMMENT_KIND)]);
    expect(tags).toContainEqual(['p', COMMENTER]);
    // The reply's own a-tag must NOT equal the product coord, so it is not
    // mistaken for a top-level comment.
    expect(getTagValue(parentComment, 'a')).toBe(PRODUCT_COORD);
    expect(isTopLevelComment(makeComment(tags), root)).toBe(false);
  });

  it('uses hostname for K/k and the href for I/i on a URL root', () => {
    const root = new URL('https://shop.example/p/1');
    const tags = buildCommentTags(root);
    expect(tags).toContainEqual(['I', 'https://shop.example/p/1']);
    expect(tags).toContainEqual(['K', 'shop.example']);
    expect(tags).toContainEqual(['i', 'https://shop.example/p/1']);
    expect(tags).toContainEqual(['k', 'shop.example']);
  });

  it('round-trips: a freshly built top-level comment is recognised as top-level', () => {
    const root = makeProduct();
    const comment = makeComment(buildCommentTags(root));
    expect(isTopLevelComment(comment, root)).toBe(true);
  });
});
