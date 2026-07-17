import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { TestApp } from '@/test/TestApp';
import { useNoteReplies } from '@/hooks/useNoteReplies';
import { StoryNote } from './StoryNote';

// Replies come from a live Nostr query; mock it so the component renders offline.
vi.mock('@/hooks/useNoteReplies');
const mockedUseNoteReplies = vi.mocked(useNoteReplies);

function makeNote(): NostrEvent {
  return {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    created_at: Math.floor(Date.now() / 1000) - 3600,
    kind: 1,
    tags: [],
    content: 'Behind the scenes at the shop',
    sig: 'c'.repeat(128),
  };
}

async function renderNote() {
  const result = render(
    <TestApp>
      <ol>
        <StoryNote event={makeNote()} />
      </ol>
    </TestApp>
  );
  // NostrLoginProvider (@nostrify/react >= 0.5) loads persisted logins
  // asynchronously and renders nothing until that resolves; flush the
  // microtask so TestApp's children are mounted before assertions run.
  await act(async () => {});
  return result;
}

describe('StoryNote interactions (signed out)', () => {
  beforeEach(() => {
    mockedUseNoteReplies.mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<
      typeof useNoteReplies
    >);
  });

  it('renders the post text and a zap affordance', async () => {
    await renderNote();
    expect(screen.getByText(/behind the scenes at the shop/i)).toBeInTheDocument();
    // Signed-out users get a Zap affordance (which prompts sign-in on click).
    expect(screen.getByRole('button', { name: /zap/i })).toBeInTheDocument();
  });

  it('shows the replies thread with a sign-in-gated composer', async () => {
    await renderNote();
    expect(screen.getByText(/no replies yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to reply/i })).toBeInTheDocument();
  });
});
