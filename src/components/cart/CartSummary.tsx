import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCart } from '@/hooks/useCart';
import { formatPrice } from '@/lib/productUtils';

interface CartSummaryProps {
  onCheckout: () => void;
}

export function CartSummary({ onCheckout }: CartSummaryProps) {
  const { totalItems, totalPrice, currency } = useCart();

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="p-4 border-t bg-background">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal ({totalItems} items)</span>
          <span className="font-medium">{formatPrice(totalPrice, currency)}</span>
        </div>
        <Separator />
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span className="text-robotechy-green-dark">{formatPrice(totalPrice, currency)}</span>
        </div>
      </div>

      <Button
        className="w-full mt-4 bg-robotechy-green hover:brightness-110 text-black font-semibold"
        onClick={onCheckout}
      >
        Proceed to Checkout
      </Button>
    </div>
  );
}
