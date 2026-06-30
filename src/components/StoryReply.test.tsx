import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
