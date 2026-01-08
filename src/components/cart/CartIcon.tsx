import { ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/hooks/useCart';
import { CartDrawer } from './CartDrawer';

export function CartIcon() {
  const { totalItems, setIsOpen } = useCart();

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setIsOpen(true)}
        aria-label={`Shopping cart with ${totalItems} items`}
      >
        <ShoppingCart className="h-5 w-5" />
        {totalItems > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-robotechy-orange text-white text-xs font-bold flex items-center justify-center">
            {totalItems > 99 ? '99+' : totalItems}
          </span>
        )}
      </Button>

      <CartDrawer />
    </>
  );
}
