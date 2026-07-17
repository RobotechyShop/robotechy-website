import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { NoteContent } from './NoteContent';
import type { NostrEvent } from '@nostrify/nostrify';

async function renderNoteContent(event: NostrEvent) {
  const result = render(
    <TestApp>
      <NoteContent event={event} />
    </TestApp>
  );
  // NostrLoginProvider (@nostrify/react >= 0.5) loads persisted logins
  // asynchronously and renders nothing until that resolves; flush the
  // microtask so TestApp's children are mounted before assertions run.
  await act(async () => {});
  return result;
}

describe('NoteContent', () => {
  it('linkifies URLs in kind 1 events', async () => {
    const event: NostrEvent = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'Check out this link: https://example.com',
      sig: 'test-sig',
    };

    await renderNoteContent(event);

    const link = screen.getByRole('link', { name: 'https://example.com' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('linkifies URLs in kind 1111 events (comments)', async () => {
    const event: NostrEvent = {
      id: 'test-comment-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1111,
      tags: [
        ['a', '30040:pubkey:identifier'],
        ['k', '30040'],
        ['p', 'pubkey'],
      ],
      content:
        'I think the log events should be different kind numbers instead of having a `log-type` tag. That way you can use normal Nostr filters to filter the log types. Also, the `note` type should just b a kind 1111: https://nostrbook.dev/kinds/1111',
      sig: 'test-sig',
    };

    await renderNoteContent(event);

    const link = screen.getByRole('link', { name: 'https://nostrbook.dev/kinds/1111' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://nostrbook.dev/kinds/1111');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('handles text without URLs correctly', async () => {
    const event: NostrEvent = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1111,
      tags: [],
      content: 'This is just plain text without any links.',
      sig: 'test-sig',
    };

    await renderNoteContent(event);

    expect(screen.getByText('This is just plain text without any links.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders hashtags as links', async () => {
    const event: NostrEvent = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'This is a post about #nostr and #bitcoin development.',
      sig: 'test-sig',
    };

    await renderNoteContent(event);

    const nostrHashtag = screen.getByRole('link', { name: '#nostr' });
    const bitcoinHashtag = screen.getByRole('link', { name: '#bitcoin' });

    expect(nostrHashtag).toBeInTheDocument();
    expect(bitcoinHashtag).toBeInTheDocument();
    expect(nostrHashtag).toHaveAttribute('href', '/t/nostr');
    expect(bitcoinHashtag).toHaveAttribute('href', '/t/bitcoin');
  });

  it('generates deterministic names for users without metadata and styles them differently', async () => {
    // Use a valid npub for testing
    const event: NostrEvent = {
      id: 'test-id',
      pubkey: 'test-pubkey',
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: `Mentioning nostr:npub1zg69v7ys40x77y352eufp27daufrg4ncjz4ummcjx3t83y9tehhsqepuh0`,
      sig: 'test-sig',
    };

    await renderNoteContent(event);

    // The mention should be rendered with a deterministic name
    const mention = screen.getByRole('link');
    expect(mention).toBeInTheDocument();

    // Should have muted styling for generated names (gray instead of blue)
    expect(mention).toHaveClass('text-gray-500');
    expect(mention).not.toHaveClass('text-blue-500');

    // The text should start with @ and contain a generated name (not a truncated npub)
    const linkText = mention.textContent;
    expect(linkText).not.toMatch(/^@npub1/); // Should not be a truncated npub
    expect(linkText).toEqual('@Swift Falcon');
  });
});
