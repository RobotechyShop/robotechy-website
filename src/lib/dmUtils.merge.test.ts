import { describe, it, expect } from 'vitest';
import { mergeConversationMessages, type MergeableMessage } from './dmUtils';

/** Build a message with sensible defaults; override what the case needs. */
function msg(overrides: Partial<MergeableMessage> & { id: string }): MergeableMessage {
  return {
    pubkey: 'sender',
    created_at: 1_000,
    decryptedContent: 'hello',
    ...overrides,
  };
}

describe('mergeConversationMessages', () => {
  it('replaces a matching optimistic bubble instead of appending a duplicate (the poll-path dup)', () => {
    // The production bug: "Do you get this?" rendered twice — the optimistic
    // bubble (isSending, synthetic id) plus the relay-fetched wrap copy.
    const optimistic = msg({
      id: 'optimistic-123',
      isSending: true,
      decryptedContent: 'Do you get this?',
      created_at: 1_000,
      clientFirstSeen: 42,
    });
    const relayCopy = msg({
      id: 'seal-id',
      originalGiftWrapId: 'wrap-id',
      decryptedContent: 'Do you get this?',
      created_at: 1_005, // wraps land seconds later
    });

    const merged = mergeConversationMessages([optimistic], [relayCopy]);

    expect(merged).toHaveLength(1);
    expect(merged[0].originalGiftWrapId).toBe('wrap-id'); // the confirmed copy…
    expect(merged[0].isSending).toBeUndefined(); // …no longer "sending"
    expect(merged[0].created_at).toBe(1_000); // keeps optimistic stamp (no jump)
    expect(merged[0].clientFirstSeen).toBe(42); // keeps animation stamp
  });

  it('does not replace an optimistic bubble outside the 30s window', () => {
    const optimistic = msg({ id: 'optimistic-1', isSending: true, created_at: 1_000 });
    const late = msg({ id: 'real-1', originalGiftWrapId: 'wrap-1', created_at: 1_031 });

    const merged = mergeConversationMessages([optimistic], [late]);
    expect(merged).toHaveLength(2);
  });

  it('does not replace when content differs (two distinct messages sent quickly)', () => {
    const optimistic = msg({ id: 'optimistic-1', isSending: true, decryptedContent: 'first' });
    const other = msg({ id: 'real-1', originalGiftWrapId: 'wrap-1', decryptedContent: 'second' });

    const merged = mergeConversationMessages([optimistic], [other]);
    expect(merged).toHaveLength(2);
  });

  it('does not replace another author’s message even with identical content', () => {
    const optimistic = msg({ id: 'optimistic-1', isSending: true, pubkey: 'me' });
    const theirs = msg({ id: 'real-1', originalGiftWrapId: 'wrap-1', pubkey: 'them' });

    const merged = mergeConversationMessages([optimistic], [theirs]);
    expect(merged).toHaveLength(2);
  });

  it('dedupes a re-fetched NIP-17 wrap by originalGiftWrapId', () => {
    const existing = msg({ id: 'seal-a', originalGiftWrapId: 'wrap-1' });
    const refetched = msg({ id: 'seal-b', originalGiftWrapId: 'wrap-1' }); // same wrap, new decrypt

    const merged = mergeConversationMessages([existing], [refetched]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('seal-a');
  });

  it('dedupes NIP-04 / cached messages by event id', () => {
    const existing = msg({ id: 'event-1' });
    const merged = mergeConversationMessages([existing], [msg({ id: 'event-1' })]);
    expect(merged).toHaveLength(1);
  });

  it('dedupes duplicates within the incoming batch itself', () => {
    const a = msg({ id: 'seal-a', originalGiftWrapId: 'wrap-1' });
    const b = msg({ id: 'seal-b', originalGiftWrapId: 'wrap-1' });

    const merged = mergeConversationMessages([], [a, b]);
    expect(merged).toHaveLength(1);
  });

  it('replaces each optimistic bubble at most once (second identical incoming appends)', () => {
    // Pathological but possible: two REAL sends with identical content in the
    // same window. The first incoming copy consumes the optimistic bubble; the
    // second must append, not silently vanish.
    const optimistic = msg({ id: 'optimistic-1', isSending: true, created_at: 1_000 });
    const copy1 = msg({ id: 's1', originalGiftWrapId: 'w1', created_at: 1_002 });
    const copy2 = msg({ id: 's2', originalGiftWrapId: 'w2', created_at: 1_004 });

    const merged = mergeConversationMessages([optimistic], [copy1, copy2]);
    expect(merged).toHaveLength(2);
    expect(merged.some((m) => m.isSending)).toBe(false);
  });

  it('appends and sorts by created_at when nothing matches', () => {
    const merged = mergeConversationMessages(
      [msg({ id: 'a', created_at: 3_000 })],
      [msg({ id: 'b', created_at: 1_000 }), msg({ id: 'c', created_at: 2_000 })]
    );
    expect(merged.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });
});
