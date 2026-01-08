import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWallet } from '@/hooks/useWallet';
import { useNWC } from '@/hooks/useNWCContext';
import { useToast } from '@/hooks/useToast';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import type { GammaPaymentRequest } from '@/lib/cartTypes';
import QRCode from 'qrcode';

interface PaymentDisplayProps {
  orderId: string;
  paymentRequest?: GammaPaymentRequest;
  totalSats: number;
  currency: string;
  originalFiatAmount?: number;
  originalCurrency?: string;
  onPaymentComplete: (invoice: string, preimage: string) => void;
  isAwaitingPayment?: boolean;
}

export function PaymentDisplay({
  orderId,
  paymentRequest,
  totalSats,
  currency,
  originalFiatAmount,
  originalCurrency,
  onPaymentComplete,
  isAwaitingPayment: _isAwaitingPayment,
}: PaymentDisplayProps) {
  const { webln, activeNWC } = useWallet();
  const { sendPayment } = useNWC();
  const { toast } = useToast();
  const { convertToSats, convertToFiat } = useExchangeRate();

  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isPaying, setIsPaying] = useState(false);

  // Use totalSats directly if currency is SAT, otherwise convert
  const satsAmount = currency === 'SAT' || currency === 'sats' ? totalSats : convertToSats(totalSats, currency);

  // Calculate fiat equivalent for display
  const fiatAmount = originalFiatAmount || convertToFiat(satsAmount, originalCurrency || 'GBP');
  const fiatCurrency = originalCurrency || 'GBP';
  const invoice = paymentRequest?.payment_options?.find((o) => o.type === 'ln' || o.type === 'lnurl')?.link;

  // Generate QR code when invoice is available
  useEffect(() => {
    let isCancelled = false;

    const generateQR = async () => {
      if (!invoice) {
        setQrCodeUrl('');
        return;
      }

      try {
        const url = await QRCode.toDataURL(invoice.toUpperCase(), {
          width: 512,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });

        if (!isCancelled) {
          setQrCodeUrl(url);
        }
      } catch (err) {
        console.error('Failed to generate QR code:', err);
      }
    };

    generateQR();

    return () => {
      isCancelled = true;
    };
  }, [invoice]);

  const handleCopy = async () => {
    if (invoice) {
      await navigator.clipboard.writeText(invoice);
      setCopied(true);
      toast({
        title: 'Invoice copied',
        description: 'Lightning invoice copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openInWallet = () => {
    if (invoice) {
      window.open(`lightning:${invoice}`, '_blank');
    }
  };

  const handlePayWithNWC = async () => {
    if (!invoice || !activeNWC) return;

    setIsPaying(true);
    try {
      const result = await sendPayment(activeNWC, invoice);
      if (result.preimage) {
        toast({
          title: 'Payment successful',
          description: 'Your order has been paid!',
        });
        onPaymentComplete(invoice, result.preimage);
      }
    } catch (error) {
      toast({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'Failed to send payment',
        variant: 'destructive',
      });
    } finally {
      setIsPaying(false);
    }
  };

  const handlePayWithWebLN = async () => {
    if (!invoice || !webln) return;

    setIsPaying(true);
    try {
      const result = await webln.sendPayment(invoice);
      if (result.preimage) {
        toast({
          title: 'Payment successful',
          description: 'Your order has been paid!',
        });
        onPaymentComplete(invoice, result.preimage);
      }
    } catch (error) {
      toast({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'Failed to send payment',
        variant: 'destructive',
      });
    } finally {
      setIsPaying(false);
    }
  };

  // Show waiting state while subscription looks for payment request
  if (!paymentRequest || !invoice) {
    return (
      <div className="flex flex-col items-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-robotechy-blue" />
        <div className="text-center space-y-2">
          <p className="font-medium">Waiting for invoice...</p>
          <p className="text-sm text-muted-foreground">
            The merchant will send a Lightning invoice shortly.
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            Order ID: {orderId.slice(0, 8)}...{orderId.slice(-8)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Amount display */}
      <div className="text-center py-2">
        <p className="text-2xl font-bold">{satsAmount.toLocaleString()} sats</p>
        {fiatAmount > 0 && (
          <p className="text-sm text-muted-foreground">
            ≈ {fiatCurrency === 'GBP' ? '£' : fiatCurrency === 'USD' ? '$' : '€'}
            {fiatAmount.toFixed(2)}
          </p>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          {paymentRequest.message || 'Please pay this invoice to complete your order'}
        </p>
      </div>

      {/* QR Code */}
      <div className="flex justify-center">
        <Card className="p-3">
          <CardContent className="p-0">
            {qrCodeUrl ? (
              <img
                src={qrCodeUrl}
                alt="Lightning Invoice QR Code"
                className="w-48 h-48 object-contain"
              />
            ) : (
              <div className="w-48 h-48 bg-muted animate-pulse rounded" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invoice input with copy */}
      <div className="space-y-2">
        <Label htmlFor="invoice">Lightning Invoice</Label>
        <div className="flex gap-2">
          <Input
            id="invoice"
            value={invoice}
            readOnly
            className="font-mono text-xs"
            onClick={(e) => e.currentTarget.select()}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={handleCopy}
            className="shrink-0"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Payment buttons */}
      <div className="space-y-3">
        {activeNWC && (
          <Button
            onClick={handlePayWithNWC}
            disabled={isPaying}
            className="w-full bg-robotechy-green hover:brightness-110 text-black"
            size="lg"
          >
            {isPaying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Pay with NWC Wallet
              </>
            )}
          </Button>
        )}

        {webln && !activeNWC && (
          <Button
            onClick={handlePayWithWebLN}
            disabled={isPaying}
            className="w-full bg-robotechy-green hover:brightness-110 text-black"
            size="lg"
          >
            {isPaying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Pay with WebLN
              </>
            )}
          </Button>
        )}

        <Button
          variant="outline"
          onClick={openInWallet}
          className="w-full"
          size="lg"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Open in Lightning Wallet
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Scan the QR code or copy the invoice to pay with any Lightning wallet.
        </p>
      </div>
    </div>
  );
}
