import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface MessagesDrawerContextType {
  /** Whether the Messages drawer is currently open. */
  isOpen: boolean;
  /** Directly control the drawer open state (used by the Sheet). */
  setIsOpen: (open: boolean) => void;
  /**
   * Open the Messages drawer focused on the shop conversation. An optional
   * orderId highlights the matching order/receipt card in the thread.
   */
  openMessages: (orderId?: string) => void;
  /** Order id to highlight in the thread, if the drawer was opened for one. */
  focusOrderId: string | null;
}

export const MessagesDrawerContext = createContext<MessagesDrawerContextType | null>(null);

export function useMessagesDrawerInternal(): MessagesDrawerContextType {
  const [isOpen, setIsOpenState] = useState(false);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);

  const openMessages = useCallback((orderId?: string) => {
    setFocusOrderId(orderId ?? null);
    setIsOpenState(true);
  }, []);

  const setIsOpen = useCallback((open: boolean) => {
    setIsOpenState(open);
    if (!open) {
      setFocusOrderId(null);
    }
  }, []);

  return useMemo(
    () => ({ isOpen, setIsOpen, openMessages, focusOrderId }),
    [isOpen, setIsOpen, openMessages, focusOrderId]
  );
}

export function useMessagesDrawer(): MessagesDrawerContextType {
  const context = useContext(MessagesDrawerContext);
  if (!context) {
    throw new Error('useMessagesDrawer must be used within a MessagesDrawerProvider');
  }
  return context;
}
