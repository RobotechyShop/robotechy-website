import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { MessagesDrawerProvider } from '@/contexts/MessagesDrawerContext';
import { Header } from './Header';

function renderHeader() {
  return render(
    <TestApp>
      <MessagesDrawerProvider>
        <Header />
      </MessagesDrawerProvider>
    </TestApp>
  );
}

describe('Header', () => {
  it('opens the cart drawer when the cart icon is clicked (regression: dead button)', async () => {
    // Regression: the header cart button had no onClick and the CartDrawer was
    // only mounted on the product page, so the cart was unreachable elsewhere.
    renderHeader();

    const cartButton = screen.getByRole('button', { name: /shopping cart/i });
    fireEvent.click(cartButton);

    expect(await screen.findByRole('dialog')).toHaveTextContent(/shopping cart/i);
  });

  it('labels the cart button with the live item count (empty cart)', () => {
    renderHeader();
    // Empty cart: label reports 0 items (attribute assertion — the a11y-tree
    // name lookup is unreliable here while a prior test's dialog teardown
    // leaves transient aria-hidden state).
    expect(screen.getByTitle('Cart')).toHaveAttribute('aria-label', 'Shopping cart with 0 items');
  });
});
