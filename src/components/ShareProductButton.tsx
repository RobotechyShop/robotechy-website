import { useMemo, useState } from 'react';
import { Check, Copy, Loader2, Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { NostrIcon } from '@/components/NostrIcon';
import LoginDialog from '@/components/auth/LoginDialog';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import type { ProductData } from '@/lib/productUtils';
import {
  buildNjumpUrl,
  buildProductNaddr,
  buildShareNoteContent,
  buildShareNoteEvent,
  formatPriceLabel,
} from '@/lib/shareProduct';

interface ShareProductButtonProps {
  product: ProductData;
  /** `button` = labelled CTA (detail page); `icon` = compact overlay (card). */
  variant?: 'button' | 'icon';
  /** Forwarded to the shadcn Button. */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Extra classes for the trigger button. */
  className?: string;
}

/** True when the browser exposes the native Web Share API. */
function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * A "Share" button (Nostr ostrich icon) for a NIP-99 (kind 30402) product.
 *
 * The menu always offers "Copy link" and — where supported — the native
 * "Share…" sheet, both of which work signed out. "Share to Nostr" opens a small
 * composer that publishes a fresh kind-1 note referencing the product; signed
 * out it prompts sign-in via the LoginDialog instead of doing nothing.
 */
export function ShareProductButton({
  product,
  variant = 'button',
  size,
  className,
}: ShareProductButtonProps) {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { toast } = useToast();

  const [showCompose, setShowCompose] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [composeAfterLogin, setComposeAfterLogin] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [justShared, setJustShared] = useState(false);

  const pubkey = product.event.pubkey;
  const imageUrl = product.images[0]?.url;

  // Up to two read relays as naddr hints so clients (njump, etc.) can resolve
  // the shared product. Read relays are where the storefront fetched the
  // catalog from, so they're where the merchant's product event is actually
  // readable — unlike the shopper's personal write/publish relays.
  const relayHints = useMemo(
    () =>
      config.relayMetadata.relays
        .filter((r) => r.read)
        .map((r) => r.url)
        .slice(0, 2),
    [config.relayMetadata.relays]
  );

  // The product's portable pointer and the human-facing njump link. Memoised so
  // every menu action (copy / native share / Nostr note) uses the same URL.
  const { naddr, njumpUrl, defaultNote } = useMemo(() => {
    const naddr = buildProductNaddr(pubkey, product.id, relayHints);
    const njumpUrl = buildNjumpUrl(naddr);
    const defaultNote = buildShareNoteContent({
      title: product.title,
      priceLabel: formatPriceLabel(product.price),
      njumpUrl,
    });
    return { naddr, njumpUrl, defaultNote };
  }, [pubkey, product.id, product.title, product.price, relayHints]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(njumpUrl);
      toast({ title: 'Link copied', description: 'Product link copied to clipboard.' });
    } catch {
      toast({
        title: 'Could not copy',
        description: njumpUrl,
        variant: 'destructive',
      });
    }
  };

  const nativeShare = async () => {
    if (!canNativeShare()) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: product.title,
        text: product.summary || product.title,
        url: njumpUrl,
      });
    } catch (error) {
      // AbortError = the user dismissed the share sheet; not worth a toast.
      if (error instanceof Error && error.name === 'AbortError') return;
      await copyLink();
    }
  };

  const openComposer = () => {
    setNoteText(defaultNote);
    setJustShared(false);
    setShowCompose(true);
  };

  const handleShareToNostr = () => {
    if (!user) {
      // Signed out: prompt sign-in, then open the composer automatically.
      setComposeAfterLogin(true);
      setShowLogin(true);
      return;
    }
    openComposer();
  };

  const publishNote = async () => {
    try {
      const event = buildShareNoteEvent({
        pubkey,
        identifier: product.id,
        title: product.title,
        price: product.price,
        imageUrl,
        relays: relayHints,
        content: noteText.trim() || defaultNote,
      });
      await publishEvent(event);
      setJustShared(true);
      toast({
        title: 'Shared to Nostr ✓',
        description: `${product.title} was posted to your Nostr feed.`,
      });
      setShowCompose(false);
    } catch (error) {
      toast({
        title: 'Could not share',
        description: error instanceof Error ? error.message : 'Failed to publish your note.',
        variant: 'destructive',
      });
    }
  };

  const isIcon = variant === 'icon';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={isIcon ? 'secondary' : 'outline'}
            size={size ?? (isIcon ? 'icon' : 'lg')}
            aria-label={`Share ${product.title} on Nostr`}
            className={cn(
              isIcon
                ? 'rounded-full bg-white/90 text-slate-700 shadow-sm backdrop-blur hover:bg-white hover:text-robotechy-green-dark dark:bg-neutral-900/80 dark:text-slate-200'
                : 'w-full',
              className
            )}
          >
            <Share2 className={cn('h-5 w-5', !isIcon && 'mr-2')} aria-hidden="true" />
            {!isIcon && 'Share'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={handleShareToNostr} className="cursor-pointer">
            <NostrIcon className="h-4 w-4 mr-2 text-robotechy-green-dark dark:text-robotechy-green" />
            Share to Nostr
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyLink()} className="cursor-pointer">
            <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
            Copy link
          </DropdownMenuItem>
          {canNativeShare() && (
            <DropdownMenuItem onSelect={() => void nativeShare()} className="cursor-pointer">
              <Share2 className="h-4 w-4 mr-2" aria-hidden="true" />
              Share…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <NostrIcon className="h-5 w-5 text-robotechy-green-dark dark:text-robotechy-green" />
              Share to Nostr
            </DialogTitle>
            <DialogDescription>
              Post a note about this product to your Nostr feed. The product is linked so your
              followers can open it on njump.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-3">
            {imageUrl && (
              <img
                src={imageUrl}
                alt={product.title}
                className="h-20 w-20 flex-none rounded-md object-cover border border-slate-200 dark:border-slate-800"
              />
            )}
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={5}
              aria-label="Note text"
              className="flex-1 resize-none"
            />
          </div>

          <p className="text-xs text-sage-500 dark:text-sage-400 break-all">{njumpUrl}</p>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => void copyLink()} type="button">
              <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
              Copy link
            </Button>
            <Button
              type="button"
              onClick={() => void publishNote()}
              disabled={isPublishing || justShared}
              className="bg-robotechy-green text-black hover:brightness-110"
            >
              {isPublishing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              ) : justShared ? (
                <Check className="h-4 w-4 mr-2" aria-hidden="true" />
              ) : (
                <NostrIcon className="h-4 w-4 mr-2" />
              )}
              {justShared ? 'Shared' : 'Post to Nostr'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LoginDialog
        isOpen={showLogin}
        onClose={() => {
          setShowLogin(false);
        }}
        onLogin={() => {
          setShowLogin(false);
          if (composeAfterLogin) {
            setComposeAfterLogin(false);
            openComposer();
          }
        }}
      />

      {/* naddr kept in the DOM (visually hidden) so e2e / tooling can assert the
          product's addressable pointer without opening the menu. */}
      <span className="sr-only" data-product-naddr={naddr} />
    </>
  );
}
