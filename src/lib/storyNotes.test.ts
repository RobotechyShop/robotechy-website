import { describe, it, expect } from 'vitest';
import type { NostrEvent } from '@nostrify/nostrify';
import { extractImageUrls, isReply, stripImageUrls } from './storyNotes';

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

describe('extractImageUrls', () => {
  it('extracts URLs from imeta tags', () => {
    const event = makeEvent({
      tags: [['imeta', 'url https://img.example/a.png', 'm image/png']],
    });
    expect(extractImageUrls(event)).toEqual(['https://img.example/a.png']);
  });

  it('extracts bare image URLs from content', () => {
    const event = makeEvent({
      content: 'Check this out https://img.example/b.jpg and more text',
    });
    expect(extractImageUrls(event)).toEqual(['https://img.example/b.jpg']);
  });

  it('honours a query string on a content image URL', () => {
    const event = makeEvent({ content: 'https://img.example/c.webp?width=800 nice' });
    expect(extractImageUrls(event)).toEqual(['https://img.example/c.webp?width=800']);
  });

  it('dedupes a URL declared in both an imeta tag and the content', () => {
    const event = makeEvent({
      tags: [['imeta', 'url https://img.example/a.png']],
      content: 'See https://img.example/a.png',
    });
    expect(extractImageUrls(event)).toEqual(['https://img.example/a.png']);
  });

  it('returns an empty array when there are no images', () => {
    expect(extractImageUrls(makeEvent({ content: 'just words, no pics' }))).toEqual([]);
  });

  it('ignores non-image links', () => {
    const event = makeEvent({ content: 'visit https://example.com/page for info' });
    expect(extractImageUrls(event)).toEqual([]);
  });

  it('skips imeta attachments whose mime is not an image', () => {
    const event = makeEvent({
      tags: [['imeta', 'url https://media.example/clip.mp4', 'm video/mp4']],
    });
    expect(extractImageUrls(event)).toEqual([]);
  });

  it('keeps an imeta image whose extension is unusual but mime says image', () => {
    const event = makeEvent({
      tags: [['imeta', 'url https://media.example/pic', 'm image/png']],
    });
    expect(extractImageUrls(event)).toEqual(['https://media.example/pic']);
  });

  it('falls back to the URL extension when imeta declares no mime', () => {
    const event = makeEvent({ tags: [['imeta', 'url https://img.example/d.png']] });
    expect(extractImageUrls(event)).toEqual(['https://img.example/d.png']);
  });

  it('does not treat an image extension mid-path as an image (no declared mime)', () => {
    const event = makeEvent({ tags: [['imeta', 'url https://example.com/a.png/extra']] });
    expect(extractImageUrls(event)).toEqual([]);
  });

  it('rejects non-http(s) imeta image URLs', () => {
    const event = makeEvent({
      tags: [['imeta', 'url data:image/png;base64,iVBORw0KGgo=', 'm image/png']],
    });
    expect(extractImageUrls(event)).toEqual([]);
  });
});

describe('isReply', () => {
  it('is true when the note has an e tag', () => {
    expect(isReply(makeEvent({ tags: [['e', 'd'.repeat(64)]] }))).toBe(true);
  });

  it('is false for a top-level note', () => {
    expect(isReply(makeEvent({ tags: [['t', 'robotechy']] }))).toBe(false);
  });

  it('is false when the only e tag is a NIP-10 mention marker', () => {
    const event = makeEvent({ tags: [['e', 'd'.repeat(64), '', 'mention']] });
    expect(isReply(event)).toBe(false);
  });

  it('is true for a NIP-10 reply marker', () => {
    const event = makeEvent({ tags: [['e', 'd'.repeat(64), '', 'reply']] });
    expect(isReply(event)).toBe(true);
  });
});

describe('stripImageUrls', () => {
  it('removes image URLs and trims surrounding whitespace', () => {
    const event = 'New print!\n\nhttps://img.example/a.png';
    expect(stripImageUrls(event)).toBe('New print!');
  });

  it('collapses blank lines left behind by removed images', () => {
    const text = 'First line\nhttps://img.example/a.png\n\n\nSecond line';
    expect(stripImageUrls(text)).toBe('First line\n\nSecond line');
  });

  it('leaves text without images unchanged', () => {
    expect(stripImageUrls('plain note')).toBe('plain note');
  });
});
