import { useState } from 'react';
import { Mail, LogIn } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { DMChatArea } from '@/components/dm/DMChatArea';
import LoginDialog from '@/components/auth/LoginDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMessagesDrawer } from '@/hooks/useMessagesDrawer';
import { MERCHANT_PUBKEY } from '@/hooks/useProducts';

/**
 * Right-side drawer that lets a customer message the shop and read their full
 * conversation history. The thread is scoped to the shop's pubkey and reuses
 * the existing DM stack (`DMChatArea`), which already renders both chat
 * messages (kind 14) and order/receipt commerce cards (kind 16/17).
 *
 * Mounted once globally by `MessagesDrawerProvider`; opened from the header
 * mail icon and the order-confirmation "Message" button via `useMessagesDrawer`.
 */
export function MessagesDrawer() {
  const { isOpen, setIsOpen, focusOrderId } = useMessagesDrawer();
  const { user } = useCurrentUser();
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent side="right" className="flex flex-col p-0 w-full sm:max-w-md">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Messages
          </SheetTitle>
          <SheetDescription className="sr-only">
            Your conversation with the Robotechy shop, including order and receipt history.
          </SheetDescription>
        </SheetHeader>

        {!user ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <LogIn className="w-12 h-12 text-sage-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              Sign in to message the shop
            </h3>
            <p className="text-sage-600 dark:text-sage-400 text-sm mb-4">
              Sign up / log in to message the shop and track your orders.
            </p>
            <Button
              className="bg-robotechy-green hover:brightness-110 text-black font-semibold"
              onClick={() => setShowLoginDialog(true)}
            >
              Sign In
            </Button>
            <LoginDialog
              isOpen={showLoginDialog}
              onClose={() => setShowLoginDialog(false)}
              onLogin={() => setShowLoginDialog(false)}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 p-2">
            <DMChatArea
              pubkey={MERCHANT_PUBKEY}
              highlightOrderId={focusOrderId}
              className="h-full border-0 shadow-none"
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
