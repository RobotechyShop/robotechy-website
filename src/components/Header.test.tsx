import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { MessagesDrawerProvider } from '@/contexts/MessagesDrawerContext';
import { Header } from './Header';

async function renderHeader() {
  const result = render(
    <TestApp>
      <MessagesDrawerProvider>
        <Header />
      </MessagesDrawerProvider>
    </TestApp>
  );
  // NostrLoginProvider (@nostrify/react >= 0.5) loads persisted logins
  // asynchronously and renders nothing until that resolves; flush the
  // microtask so TestApp's children are mounted before assertions run.
  await act(async () => {});
  return result;
}

describe('Header', () => {
  // Unmount between tests AND clear the persisted drawer state: the cart's
  // isOpen is deliberately kept in localStorage (so the drawer survives the
  // header's full-page navigations), which would otherwise leak an open
  // drawer into the next test and aria-hide the header from the a11y tree.
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('opens the cart drawer when the cart icon is clicked (regression: dead button)', async () => {
    // Regression: the header cart button had no onClick and the CartDrawer was
    // only mounted on the product page, so the cart was unreachable elsewhere.
    await renderHeader();

    const cartButton = screen.getByRole('button', { name: /shopping cart/i });
    fireEvent.click(cartButton);

    expect(await screen.findByRole('dialog')).toHaveTextContent(/shopping cart/i);
  });

  it('labels the cart button with the live item count (empty cart)', async () => {
    await renderHeader();
    expect(screen.getByRole('button', { name: 'Shopping cart with 0 items' })).toBeInTheDocument();
  });
});
