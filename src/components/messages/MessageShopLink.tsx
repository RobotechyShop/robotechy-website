import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useMessagesDrawer } from '@/hooks/useMessagesDrawer';

interface MessageShopLinkProps {
  children: ReactNode;
  className?: string;
}

/**
 * Inline text link that opens the Messages drawer scoped to the shop
 * conversation. Used in body copy (e.g. policy pages) where a "contact us"
 * call to action previously opened the ContactDialog.
 */
export function MessageShopLink({ children, className }: MessageShopLinkProps) {
  const { openMessages } = useMessagesDrawer();
  return (
    <button
      type="button"
      onClick={() => openMessages()}
      className={cn('text-robotechy-green-dark hover:underline inline', className)}
    >
      {children}
    </button>
  );
}
