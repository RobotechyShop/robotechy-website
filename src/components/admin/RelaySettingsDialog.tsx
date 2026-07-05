import { Loader2, RefreshCw, Radio } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RelayListManager } from '@/components/RelayListManager';
import { useRepublishCatalog } from '@/hooks/useRepublishCatalog';
import { useToast } from '@/hooks/useToast';

interface RelaySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Owner-only relay settings. Wraps the shared `RelayListManager` (which edits
 * the app's relay list and publishes it as a NIP-65 kind-10002 event) with
 * store-specific guidance, plus a one-click re-broadcast of the existing catalog
 * to the write relays.
 *
 * Rendered by `OwnerToolbar`, which is already gated on `useIsStoreOwner`, so
 * this dialog is never shown to non-owners.
 */
export function RelaySettingsDialog({ open, onOpenChange }: RelaySettingsDialogProps) {
  const { toast } = useToast();
  const { mutate: republish, isPending } = useRepublishCatalog();

  const handleRepublish = () => {
    republish(undefined, {
      onSuccess: ({ found, republished }) => {
        toast({
          title: republished > 0 ? 'Catalog re-published ✓' : 'Nothing to re-publish',
          description:
            found === 0
              ? 'No catalog events were found on your current read relays. Keep a relay that has your catalog (e.g. nos.lol) enabled for reading, then try again.'
              : `Re-broadcast ${republished} of ${found} listing${found === 1 ? '' : 's'} to your write relays.`,
        });
      },
      onError: (error) => {
        toast({
          title: 'Re-publish failed',
          description:
            error instanceof Error ? error.message : 'Could not re-broadcast the catalog.',
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-robotechy-green-dark dark:text-robotechy-green" />
            Relays
          </DialogTitle>
          <DialogDescription>
            Your products publish to the <strong>write</strong> relays below, and this list is saved
            to Nostr as your NIP-65 relay list. Some relays (e.g. Primal, Ditto) only accept reads —
            keep at least one open-write relay such as <code>nos.lol</code> or{' '}
            <code>relay.damus.io</code> so listings actually get stored.
          </DialogDescription>
        </DialogHeader>

        <RelayListManager />

        <div className="rounded-md border border-dashed border-robotechy-green/40 bg-robotechy-green/5 p-3">
          <p className="mb-2 text-sm text-sage-600 dark:text-sage-400">
            Added a new relay? Re-broadcast your existing products, collections and shipping options
            to it — existing listings don&apos;t move to new relays on their own.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRepublish}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Re-publish all products to my relays
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
