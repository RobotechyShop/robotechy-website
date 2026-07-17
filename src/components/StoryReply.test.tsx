import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { TestApp } from '@/test/TestApp';
import { StoryReply } from './StoryReply';

async function renderReply(onRequireLogin: () => void) {
  const result = render(
    <TestApp>
      <StoryReply event={makeReply()} onRequireLogin={onRequireLogin} />
    </TestApp>
  );
  // NostrLoginProvider (@nostrify/react >= 0.5) loads persisted logins
  // asynchronously and renders nothing until that resolves; flush the
  // microtask so TestApp's children are mounted before assertions run.
  await act(async () => {});
  return result;
}

function makeReply(): NostrEvent {
  return {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    created_at: Math.floor(Date.now() / 1000) - 1800,
    kind: 1,
    tags: [],
    content: 'Looks great — nice print!',
    sig: 'c'.repeat(128),
  };
}

describe('StoryReply (signed out)', () => {
  it('renders the reply text and a sign-in-gated Zap affordance', async () => {
    await renderReply(() => {});
    expect(screen.getByText(/looks great — nice print/i)).toBeInTheDocument();
    // Signed-out visitors get a Zap affordance (which prompts sign-in on click),
    // matching the per-post and hero zap pattern rather than rendering nothing.
    expect(screen.getByRole('button', { name: /zap/i })).toBeInTheDocument();
  });

  it('calls onRequireLogin when a signed-out visitor clicks Zap', async () => {
    const onRequireLogin = vi.fn();
    await renderReply(onRequireLogin);
    // Clicking the signed-out Zap affordance asks the parent (which owns the one
    // shared LoginDialog) to prompt sign-in — proving the gating, since a
    // signed-in render would show the real ZapButton instead.
    fireEvent.click(screen.getByRole('button', { name: /zap/i }));
    expect(onRequireLogin).toHaveBeenCalledTimes(1);
  });
});
