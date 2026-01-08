import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShippingForm } from './ShippingForm';
import { OrderConfirmation } from './OrderConfirmation';
import { PaymentDisplay } from './PaymentDisplay';
import { useCart } from '@/hooks/useCart';
import { useGammaCheckout } from '@/hooks/useGammaCheckout';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import LoginDialog from '@/components/auth/LoginDialog';
import type { ShippingInfo } from '@/lib/cartTypes';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { formatPrice } from '@/lib/productUtils';

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CheckoutStep = 'shipping' | 'payment' | 'confirmation';

export function CheckoutDialog({ open, onOpenChange }: CheckoutDialogProps) {
  const { user } = useCurrentUser();
  const { totalPrice, currency, totalItems } = useCart();
  const {
    checkoutState,
    submitOrder,
    submitPaymentReceipt,
    resetCheckout,
    isSubmitting,
    isAwaitingPayment,
    isPaid,
    hasError,
  } = useGammaCheckout();

  const [step, setStep] = useState<CheckoutStep>('shipping');
  const [loginOpen, setLoginOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleShippingSubmit = async (shipping: ShippingInfo) => {
    if (!user) {
      setLoginOpen(true);
      return;
    }

    setLocalError(null);

    try {
      await submitOrder(shipping);
      setStep('payment');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit order';
      setLocalError(errorMessage);
      toast({
        title: 'Order failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handlePaymentComplete = async (invoice: string, preimage: string) => {
    try {
      await submitPaymentReceipt(invoice, preimage);
      setStep('confirmation');
      toast({
        title: 'Payment received',
        description: 'Your order has been confirmed.',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to record payment';
      setLocalError(errorMessage);
      toast({
        title: 'Payment error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after dialog closes
    setTimeout(() => {
      setStep('shipping');
      setLocalError(null);
      resetCheckout();
    }, 300);
  };

  const getDialogTitle = () => {
    switch (step) {
      case 'shipping':
        return 'Checkout';
      case 'payment':
        return 'Payment';
      case 'confirmation':
        return 'Order Complete';
      default:
        return 'Checkout';
    }
  };

  // Skip payment step if already paid
  if (isPaid && step === 'payment') {
    setStep('confirmation');
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
            <DialogDescription className="sr-only">
              Complete your order by filling in the shipping details and payment information.
            </DialogDescription>
          </DialogHeader>

          {(hasError || localError) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {checkoutState.error || localError}
              </AlertDescription>
            </Alert>
          )}

          {step === 'shipping' && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="text-sm">
                  <span className="font-medium">{totalItems} item(s)</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="font-medium">
                    {formatPrice(totalPrice, currency)}
                  </span>
                </p>
              </div>

              <ShippingForm
                onSubmit={handleShippingSubmit}
                isSubmitting={isSubmitting}
              />
            </div>
          )}

          {step === 'payment' && checkoutState.orderId && (
            <PaymentDisplay
              orderId={checkoutState.orderId}
              paymentRequest={checkoutState.paymentRequest}
              totalSats={checkoutState.paymentRequest?.amount || totalPrice}
              currency={checkoutState.paymentRequest?.amount ? 'SAT' : currency}
              onPaymentComplete={handlePaymentComplete}
              isAwaitingPayment={isAwaitingPayment}
            />
          )}

          {step === 'confirmation' && checkoutState.orderId && (
            <OrderConfirmation
              orderId={checkoutState.orderId}
              onClose={handleClose}
            />
          )}
        </DialogContent>
      </Dialog>

      <LoginDialog
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLogin={() => setLoginOpen(false)}
      />
    </>
  );
}
