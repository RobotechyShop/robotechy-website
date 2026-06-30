import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';
import { TestApp } from '@/test/TestApp';
import { MessagesDrawerProvider } from '@/contexts/MessagesDrawerContext';
import { useStoryNotes } from '@/hooks/useStoryNotes';
import { useAuthor } from '@/hooks/useAuthor';
import { useNoteReplies } from '@/hooks/useNoteReplies';
import Story from './Story';

// Mock the data hooks so the page renders deterministically and offline, without
// triggering live Nostr queries through TestApp's NostrProvider.
vi.mock('@/hooks/useStoryNotes');
vi.mock('@/hooks/useAuthor');
vi.mock('@/hooks/useNoteReplies');

const mockedUseStoryNotes = vi.mocked(useStoryNotes);
const mockedUseAuthor = vi.mocked(useAuthor);
const mockedUseNoteReplies = vi.mocked(useNoteReplies);

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
      data: { metadata: { name: 'Robotechy', about: 'A Bitcoin 3D printing shop.' } },
    } as ReturnType<typeof useAuthor>);
    mockedUseNoteReplies.mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<
      typeof useNoteReplies
    >);
  });

  it('renders the shop profile hero (name + about + Our Story label)', () => {
    mockedUseStoryNotes.mockReturnValue(storyResult({ isLoading: true }));
    renderStory();
    expect(screen.getByRole('heading', { name: /robotechy/i, level: 1 })).toBeInTheDocument();
    // About appears in the hero (and again in the footer's About Me) — at least one.
    expect(screen.getAllByText(/a bitcoin 3d printing shop/i).length).toBeGreaterThan(0);
    // "Our Story" appears as the hero label (and again as a footer nav link).
    expect(screen.getAllByText(/our story/i).length).toBeGreaterThan(0);
  });

  it('renders a Message button that targets the shop drawer', () => {
    mockedUseStoryNotes.mockReturnValue(storyResult({ isLoading: true }));
    renderStory();
    // Exact "Message" (the hero CTA), distinct from the Header's "Messages" icon.
    expect(screen.getByRole('button', { name: /^message$/i })).toBeInTheDocument();
  });

  it('shows the loading skeleton while notes are being fetched', () => {
    mockedUseStoryNotes.mockReturnValue(storyResult({ isLoading: true }));
    renderStory();
    expect(screen.getByTestId('story-loading')).toBeInTheDocument();
  });

  it('renders fetched notes with a replies affordance', () => {
    mockedUseStoryNotes.mockReturnValue(
      storyResult({ data: [makeNote('Fresh print off the bed!')] })
    );
    renderStory();
    expect(screen.getByText(/fresh print off the bed/i)).toBeInTheDocument();
    expect(screen.getByText(/no replies yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('story-loading')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no notes', () => {
    mockedUseStoryNotes.mockReturnValue(storyResult({ data: [] }));
    renderStory();
    expect(screen.getByText(/no posts yet/i)).toBeInTheDocument();
  });
});
