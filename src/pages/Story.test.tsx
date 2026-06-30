import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { TestApp } from '@/test/TestApp';
import { MessagesDrawerProvider } from '@/contexts/MessagesDrawerContext';
import { useStoryNotes } from '@/hooks/useStoryNotes';
import { useAuthor } from '@/hooks/useAuthor';
import Story from './Story';

// Mock the story data hooks so the page renders deterministically and offline,
// without triggering live Nostr queries through TestApp's NostrProvider.
vi.mock('@/hooks/useStoryNotes');
vi.mock('@/hooks/useAuthor');

const mockedUseStoryNotes = vi.mocked(useStoryNotes);
const mockedUseAuthor = vi.mocked(useAuthor);

function makeNote(content: string): NostrEvent {
  return {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    created_at: Math.floor(Date.now() / 1000) - 3600,
    kind: 1,
    tags: [],
    content,
    sig: 'c'.repeat(128),
  };
}

// Minimal stand-ins for the parts of the query results the page actually reads.
function storyResult(over: Partial<ReturnType<typeof useStoryNotes>>) {
  return { data: [], isLoading: false, isError: false, ...over } as ReturnType<
    typeof useStoryNotes
  >;
}

function renderStory() {
  return render(
    <TestApp>
      <MessagesDrawerProvider>
        <Story />
      </MessagesDrawerProvider>
    </TestApp>
  );
}

describe('Story page', () => {
  beforeEach(() => {
    mockedUseAuthor.mockReturnValue({
      data: { metadata: { name: 'Isaac' } },
    } as ReturnType<typeof useAuthor>);
  });

  it('renders the story hero heading', () => {
    mockedUseStoryNotes.mockReturnValue(storyResult({ isLoading: true }));
    renderStory();
    expect(screen.getByRole('heading', { name: /our story/i, level: 1 })).toBeInTheDocument();
  });

  it('shows the loading skeleton while notes are being fetched', () => {
    mockedUseStoryNotes.mockReturnValue(storyResult({ isLoading: true }));
    renderStory();
    expect(screen.getByTestId('story-loading')).toBeInTheDocument();
  });

  it('renders fetched notes in the timeline', () => {
    mockedUseStoryNotes.mockReturnValue(
      storyResult({ data: [makeNote('Fresh print off the bed!')] })
    );
    renderStory();
    expect(screen.getByText(/fresh print off the bed/i)).toBeInTheDocument();
    expect(screen.queryByTestId('story-loading')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no notes', () => {
    mockedUseStoryNotes.mockReturnValue(storyResult({ data: [] }));
    renderStory();
    expect(screen.getByText(/no posts yet/i)).toBeInTheDocument();
  });
});
