import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { MessagesDrawerProvider } from '@/contexts/MessagesDrawerContext';
import Story from './Story';

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
  it('renders the story hero heading', () => {
    renderStory();
    expect(screen.getByRole('heading', { name: /our story/i, level: 1 })).toBeInTheDocument();
  });

  it('shows the loading skeleton while notes are being fetched', () => {
    renderStory();
    expect(screen.getByTestId('story-loading')).toBeInTheDocument();
  });
});
