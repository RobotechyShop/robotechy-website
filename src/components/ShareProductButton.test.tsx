import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { nip19 } from 'nostr-tools';

import { TestApp } from '@/test/TestApp';
import { parseProductEvent } from '@/lib/productUtils';
import { ShareProductButton } from './ShareProductButton';
import type { NostrEvent } from '@nostrify/nostrify';

const PUBKEY = 'a'.repeat(64);

const productEvent: NostrEvent = {
  id: 'b'.repeat(64),
  pubkey: PUBKEY,
  created_at: 0,
  kind: 30402,
  tags: [
    ['d', 'widget-3000'],
    ['title', 'Widget 3000'],
    ['price', '21000', 'sats'],
    ['image', 'https://img.example/widget.png'],
  ],
  content: 'A fine widget',
  sig: 'c'.repeat(128),
};

const product = parseProductEvent(productEvent)!;

async function renderShareButton(ui: React.ReactElement) {
  const result = render(<TestApp>{ui}</TestApp>);
  // NostrLoginProvider (@nostrify/react >= 0.5) loads persisted logins
  // asynchronously and renders nothing until that resolves; flush the
  // microtask so TestApp's children are mounted before assertions run.
  await act(async () => {});
  return result;
}

describe('ShareProductButton', () => {
  it('renders an accessible share trigger', async () => {
    await renderShareButton(<ShareProductButton product={product} />);
    expect(screen.getByRole('button', { name: /share widget 3000 on nostr/i })).toBeInTheDocument();
  });

  it('exposes the product naddr pointing at the right addressable event', async () => {
    const { container } = await renderShareButton(
      <ShareProductButton product={product} variant="icon" />
    );

    const naddr = container
      .querySelector('[data-product-naddr]')
      ?.getAttribute('data-product-naddr');
    expect(naddr).toBeTruthy();

    const decoded = nip19.decode(naddr!).data as nip19.AddressPointer;
    expect(decoded.kind).toBe(30402);
    expect(decoded.pubkey).toBe(PUBKEY);
    expect(decoded.identifier).toBe('widget-3000');
  });
});
