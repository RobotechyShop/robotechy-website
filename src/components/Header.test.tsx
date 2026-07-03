import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { Header } from './Header';

describe('Header', () => {
  it('opens the cart drawer when the cart icon is clicked (regression: dead button)', async () => {
    // Regression: the header cart button had no onClick and the CartDrawer was
    // only mounted on the product page, so the cart was unreachable elsewhere.
    render(
      <TestApp>
        <Header />
      </TestApp>
    );

    const cartButton = screen.getByRole('button', { name: /shopping cart/i });
    fireEvent.click(cartButton);

    expect(await screen.findByRole('dialog')).toHaveTextContent(/shopping cart/i);
  });

  it('shows the item count badge only when the cart has items', () => {
    render(
      <TestApp>
        <Header />
      </TestApp>
    );
    // Empty cart: label reports 0 items and no badge is rendered.
    expect(screen.getByRole('button', { name: /shopping cart with 0 items/i })).toBeInTheDocument();
  });
});
