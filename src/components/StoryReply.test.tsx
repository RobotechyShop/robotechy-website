import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { TestApp } from '@/test/TestApp';
import { StoryReply } from './StoryReply';

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
  it('renders the reply text and a sign-in-gated Zap affordance', () => {
    render(
      <TestApp>
        <StoryReply event={makeReply()} />
      </TestApp>
    );
    expect(screen.getByText(/looks great — nice print/i)).toBeInTheDocument();
    // Signed-out visitors get a Zap affordance (which prompts sign-in on click),
    // matching the per-post and hero zap pattern rather than rendering nothing.
    expect(screen.getByRole('button', { name: /zap/i })).toBeInTheDocument();
  });

  it('opens the sign-in dialog when a signed-out visitor clicks Zap', async () => {
    render(
      <TestApp>
        <StoryReply event={makeReply()} />
      </TestApp>
    );
    // Clicking the signed-out Zap affordance must open LoginDialog (not zap) —
    // proving the gating, since a signed-in render would show the real ZapButton.
    fireEvent.click(screen.getByRole('button', { name: /zap/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Confirm it's the login dialog specifically (offers a sign-up path).
    expect(within(dialog).getByRole('button', { name: /sign up/i })).toBeInTheDocument();
  });
});
