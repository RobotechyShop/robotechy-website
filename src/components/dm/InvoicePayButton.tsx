import { useState, useEffect } from 'react';
import { Zap, Copy, Check, Loader2, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/hooks/useWallet';
import { useNWC } from '@/hooks/useNWCContext';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

/**
 * Compact pay affordance for a Payment Request card in the DM thread.
 * Native per app: pays with the browser wallet (NWC, else WebLN) when one is
 * connected, and always offers a QR + copy for any external Lightning wallet.
 */
export function InvoicePayButton({
  invoice,
  amountSats,
  className,
}: {
  invoice: string;
  amountSats?: number;
  className?: string;
}) {
  const { webln, activeNWC } = useWallet();
  const { sendPayment } = useNWC();
  const { toast } = useToast();

  const [isPaying, setIsPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const hasWallet = Boolean(activeNWC || webln);

  useEffect(() => {
    if (!showQr || !invoice) return;
    let cancelled = false;
    QRCode.toDataURL(invoice.toUpperCase(), { width: 320, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showQr, invoice]);

  const pay = async () => {
    setIsPaying(true);
    try {
      let result: { preimage?: string } | null = null;
      if (activeNWC) {
        result = await sendPayment(activeNWC, invoice);
      } else if (webln) {
        // WebLN must be enabled before sendPayment.
        await webln.enable();
        result = await webln.sendPayment(invoice);
      }
      if (result?.preimage) {
        setPaid(true);
        toast({ title: 'Payment sent', description: 'Your order has been paid!' });
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invoice);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable; QR is the fallback
    }
  };

  if (paid) {
    return (
      <div className={cn('flex items-center gap-1 text-xs font-medium pt-1', className)}>
        <Check className="h-3.5 w-3.5" /> Paid
      </div>
    );
  }

  const label =
    amountSats !== undefined ? `Pay ${amountSats.toLocaleString()} sats` : 'Pay invoice';

  return (
    <div className={cn('flex flex-col gap-2 pt-2', className)}>
      <div className="flex gap-2">
        {hasWallet && (
          <Button size="sm" className="h-8 flex-1 gap-1" onClick={pay} disabled={isPaying}>
            {isPaying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {label}
          </Button>
        )}
        <Button
          size="sm"
          variant={hasWallet ? 'outline' : 'default'}
          className="h-8 gap-1"
          onClick={() => setShowQr((v) => !v)}
        >
          <QrCode className="h-3.5 w-3.5" />
          {hasWallet ? 'QR' : label}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2"
          onClick={copy}
          aria-label="Copy invoice"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {showQr && qrUrl && (
        <img
          src={qrUrl}
          alt="Lightning invoice QR code"
          className="w-40 h-40 self-center rounded bg-white p-1"
        />
      )}
    </div>
  );
}
