import { CheckCircle, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface OrderConfirmationProps {
  orderId: string;
  onClose: () => void;
}

export function OrderConfirmation({ orderId, onClose }: OrderConfirmationProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyOrderId = async () => {
    await navigator.clipboard.writeText(orderId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center text-center py-8 space-y-6">
      <div className="w-16 h-16 bg-robotechy-green/20 rounded-full flex items-center justify-center">
        <CheckCircle className="w-10 h-10 text-robotechy-green" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Payment Received!</h2>
        <p className="text-muted-foreground">
          Thank you for your order. You will receive updates via Nostr direct messages.
        </p>
      </div>

      <div className="bg-muted rounded-lg p-4 w-full">
        <p className="text-sm text-muted-foreground mb-2">Order ID</p>
        <div className="flex items-center justify-center gap-2">
          <code className="text-sm font-mono bg-background px-3 py-1 rounded">
            {orderId.slice(0, 8)}...{orderId.slice(-8)}
          </code>
          <Button variant="ghost" size="sm" onClick={handleCopyOrderId} className="h-8 w-8 p-0">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        {copied && <p className="text-xs text-robotechy-green mt-2">Copied to clipboard!</p>}
      </div>

      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          <strong>What happens next?</strong>
        </p>
        <ul className="text-left space-y-1">
          <li className="flex items-start gap-2">
            <span className="text-robotechy-green">1.</span>
            <span>We'll process your order shortly</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-robotechy-green">2.</span>
            <span>You'll receive shipping updates via Nostr DM</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-robotechy-green">3.</span>
            <span>Your item will be on its way!</span>
          </li>
        </ul>
      </div>

      <div className="pt-4">
        <Button className="bg-robotechy-green hover:brightness-110 text-black" onClick={onClose}>
          Continue Shopping
        </Button>
      </div>
    </div>
  );
}
