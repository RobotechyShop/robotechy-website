import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { buildReplyTags, isReplyToNote, sortRepliesChronologically } from './noteReplies';

function makeEvent(partial: Partial<NostrEvent>): NostrEvent {
  return {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    created_at: 0,
    kind: 1,
    tags: [],
    content: '',
    sig: 'c'.repeat(128),
    ...partial,
  };
}

describe('buildReplyTags', () => {
  it('marks the parent note as the NIP-10 root and tags its author', () => {
    const parent = makeEvent({ id: 'd'.repeat(64), pubkey: 'e'.repeat(64) });
    expect(buildReplyTags(parent)).toEqual([
      ['e', 'd'.repeat(64), '', 'root'],
      ['p', 'e'.repeat(64)],
    ]);
  });
});

describe('isReplyToNote', () => {
  const noteId = 'f'.repeat(64);

  it('is true when an e tag points at the note', () => {
    expect(isReplyToNote(makeEvent({ tags: [['e', noteId]] }), noteId)).toBe(true);
  });

  it('is true for a marked root e tag', () => {
    expect(isReplyToNote(makeEvent({ tags: [['e', noteId, '', 'root']] }), noteId)).toBe(true);
  });

  it('is true for a marked reply e tag', () => {
    expect(isReplyToNote(makeEvent({ tags: [['e', noteId, '', 'reply']] }), noteId)).toBe(true);
  });

  it('is false for a mention-marked e tag (NIP-10 non-threading reference)', () => {
    // A quote/mention of the note is not a reply and must not appear in the thread.
    expect(isReplyToNote(makeEvent({ tags: [['e', noteId, '', 'mention']] }), noteId)).toBe(false);
  });

  it('is false when no e tag references the note', () => {
    expect(isReplyToNote(makeEvent({ tags: [['e', '0'.repeat(64)]] }), noteId)).toBe(false);
  });

  it('is false when there are no e tags', () => {
    expect(isReplyToNote(makeEvent({ tags: [['p', noteId]] }), noteId)).toBe(false);
  });
});

describe('sortRepliesChronologically', () => {
  it('orders replies oldest-first without mutating the input', () => {
    const a = makeEvent({ id: 'a'.repeat(64), created_at: 300 });
    const b = makeEvent({ id: 'b'.repeat(64), created_at: 100 });
    const c = makeEvent({ id: 'c'.repeat(64), created_at: 200 });
    const input = [a, b, c];
    const sorted = sortRepliesChronologically(input);
    expect(sorted.map((e) => e.created_at)).toEqual([100, 200, 300]);
    // original array order is preserved (pure)
    expect(input.map((e) => e.created_at)).toEqual([300, 100, 200]);
  });
});
