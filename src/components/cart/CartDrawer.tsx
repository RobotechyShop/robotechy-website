import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useCart } from '@/hooks/useCart';
import { CartItem } from './CartItem';
import { CartSummary } from './CartSummary';
import { CheckoutDialog } from '@/components/checkout/CheckoutDialog';

export function CartDrawer() {
  const { items, isOpen, setIsOpen, totalItems, clearCart } = useCart();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const handleCheckout = () => {
    setIsOpen(false);
    // Delay opening checkout to allow sheet close animation to complete
    // This fixes aria-hidden focus trap issue
    setTimeout(() => {
      setCheckoutOpen(true);
    }, 350);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="right" className="flex flex-col p-0 w-full sm:max-w-md">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              Shopping Cart
              {totalItems > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({totalItems} {totalItems === 1 ? 'item' : 'items'})
                </span>
              )}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Your shopping cart items
            </SheetDescription>
          </SheetHeader>

          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <ShoppingBag className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-1">Your cart is empty</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Add some items to get started
              </p>
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Continue Shopping
              </Button>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1">
                <div className="p-4">
                  {items.map((item) => (
                    <CartItem key={item.productId} item={item} />
                  ))}
                </div>
              </ScrollArea>

              <div className="border-t">
                {items.length > 0 && (
                  <div className="px-4 pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={clearCart}
                    >
                      Clear Cart
                    </Button>
                  </div>
                )}
                <CartSummary onCheckout={handleCheckout} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} />
    </>
  );
}
