import { ReactNode } from 'react';
import { MessagesDrawerContext, useMessagesDrawerInternal } from '@/hooks/useMessagesDrawer';
import { MessagesDrawer } from '@/components/messages/MessagesDrawer';

/**
 * Provides shared open-state for the storefront Messages drawer and mounts the
 * drawer itself once, so both the header mail icon and the order-confirmation
 * "Message" button can open the same conversation.
 */
export function MessagesDrawerProvider({ children }: { children: ReactNode }) {
  const value = useMessagesDrawerInternal();
  return (
    <MessagesDrawerContext.Provider value={value}>
      {children}
      <MessagesDrawer />
    </MessagesDrawerContext.Provider>
  );
}
