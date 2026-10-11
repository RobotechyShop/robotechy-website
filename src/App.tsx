// NOTE: This file should normally not be modified unless you are adding a new provider.
// To add new routes, edit the AppRouter.tsx file.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHead, UnheadProvider } from '@unhead/react/client';
import { InferSeoMetaPlugin } from '@unhead/addons';
import { Suspense } from 'react';
import NostrProvider from '@/components/NostrProvider';
import { NostrSync } from '@/components/NostrSync';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NostrLoginProvider } from '@nostrify/react/login';
import { AppProvider } from '@/components/AppProvider';
import { NWCProvider } from '@/contexts/NWCContext';
import { CartProvider } from '@/contexts/CartContext';
import { MessagesDrawerProvider } from '@/contexts/MessagesDrawerContext';
import { DMProvider } from '@/components/DMProvider';
import { AppConfig } from '@/contexts/AppContext';
import { shopRelayMetadata } from '@/lib/shopRelays';
import AppRouter from './AppRouter';

const head = createHead({
  plugins: [InferSeoMetaPlugin()],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60000, // 1 minute
      gcTime: Infinity,
    },
  },
});

// Shop relays (src/lib/shopRelays.ts): family relay first, then Ditto, Primal,
// Damus and Plebeian Market. nos.lol / relay.nostr.band / relay.nostr.net were
// removed — dead, or never held the shop's events.
const defaultConfig: AppConfig = {
  theme: 'light',
  relayMetadata: shopRelayMetadata(),
};

export function App() {
  return (
    <UnheadProvider head={head}>
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig}>
        <QueryClientProvider client={queryClient}>
          <NostrLoginProvider storageKey="nostr:login">
            <NostrProvider>
              <NostrSync />
              <NWCProvider>
                <DMProvider config={{ enabled: true }}>
                  <CartProvider>
                    <TooltipProvider>
                      <MessagesDrawerProvider>
                        <Toaster />
                        <Suspense>
                          <AppRouter />
                        </Suspense>
                      </MessagesDrawerProvider>
                    </TooltipProvider>
                  </CartProvider>
                </DMProvider>
              </NWCProvider>
            </NostrProvider>
          </NostrLoginProvider>
        </QueryClientProvider>
      </AppProvider>
    </UnheadProvider>
  );
}

export default App;
