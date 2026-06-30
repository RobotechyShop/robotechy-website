import { describe, it, expect } from 'vitest';
import { addFollow, isFollowing } from './contactList';

const SHOP = 'shoppubkey';
const A = 'aaaa';
const B = 'bbbb';

describe('isFollowing', () => {
  it('returns false for an empty contact list', () => {
    expect(isFollowing([], SHOP)).toBe(false);
  });

  it('returns true when the pubkey is present', () => {
    expect(
      isFollowing(
        [
          ['p', A],
          ['p', SHOP],
        ],
        SHOP
      )
    ).toBe(true);
  });

  it('ignores non-p tags with a matching value', () => {
    expect(isFollowing([['e', SHOP]], SHOP)).toBe(false);
  });
});

describe('addFollow', () => {
  it('adds a p tag to an empty list', () => {
    expect(addFollow([], SHOP)).toEqual([['p', SHOP]]);
  });

  it('preserves all existing follows when adding a new one', () => {
    const tags = [
      ['p', A],
      ['p', B],
    ];
    expect(addFollow(tags, SHOP)).toEqual([
      ['p', A],
      ['p', B],
      ['p', SHOP],
    ]);
  });

  it('is a no-op (no duplicate) when already following', () => {
    const tags = [
      ['p', A],
      ['p', SHOP],
    ];
    const result = addFollow(tags, SHOP);
    expect(result).toEqual(tags);
    expect(result.filter(([name, value]) => name === 'p' && value === SHOP)).toHaveLength(1);
  });

  it('preserves relay/petname columns and other tag types', () => {
    const tags = [
      ['p', A, 'wss://relay.example', 'alice'],
      ['client', 'robotechy'],
    ];
    expect(addFollow(tags, SHOP)).toEqual([
      ['p', A, 'wss://relay.example', 'alice'],
      ['client', 'robotechy'],
      ['p', SHOP],
    ]);
  });

  it('does not mutate the input array', () => {
    const tags = [['p', A]];
    addFollow(tags, SHOP);
    expect(tags).toEqual([['p', A]]);
  });
});
