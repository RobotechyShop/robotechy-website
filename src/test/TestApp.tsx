import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHead, UnheadProvider } from '@unhead/react/client';
import { BrowserRouter } from 'react-router-dom';
import { NostrLoginProvider } from '@nostrify/react/login';
import NostrProvider from '@/components/NostrProvider';
import { AppProvider } from '@/components/AppProvider';
import { NWCProvider } from '@/contexts/NWCContext';
import { CartProvider } from '@/contexts/CartContext';
import { AppConfig } from '@/contexts/AppContext';
import { shopRelayMetadata } from '@/lib/shopRelays';

interface TestAppProps {
  children: React.ReactNode;
}

export function TestApp({ children }: TestAppProps) {
  const head = createHead();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const defaultConfig: AppConfig = {
    theme: 'light',
    // Same relays as production. No socket is ever opened in tests: setup.ts
    // installs an inert WebSocket, so nothing here touches a real relay.
    relayMetadata: shopRelayMetadata(),
  };

  return (
    <UnheadProvider head={head}>
      <AppProvider storageKey="test-app-config" defaultConfig={defaultConfig}>
        <QueryClientProvider client={queryClient}>
          <NostrLoginProvider storageKey="test-login">
            <NostrProvider>
              <NWCProvider>
                {/* Header (rendered by most pages) uses useCart, so the test
                    harness mirrors App's CartProvider. */}
                <CartProvider>
                  <BrowserRouter>{children}</BrowserRouter>
                </CartProvider>
              </NWCProvider>
            </NostrProvider>
          </NostrLoginProvider>
        </QueryClientProvider>
      </AppProvider>
    </UnheadProvider>
  );
}

export default TestApp;
