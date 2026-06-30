import { Loader2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/useToast';
import { useProductAdmin } from '@/hooks/useProductAdmin';
import { parseProductEvent } from '@/lib/productUtils';

interface DeleteProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: NostrEvent | null;
  /** Called after a successful deletion (e.g. to navigate away). */
  onDeleted?: () => void;
}

/**
 * Confirms and performs a NIP-09 product removal.
 *
 * Mirrors PlebeianApp/market: a single kind 5 deletion request referencing the
 * product's addressable coordinate (`a = 30402:<pubkey>:<d>`). No expiration
 * step, no soft-delete — relays drop every version carrying that `d` tag.
 */
export function DeleteProductDialog({
  open,
  onOpenChange,
  event,
  onDeleted,
}: DeleteProductDialogProps) {
  const { toast } = useToast();
  const { deleteProduct } = useProductAdmin();
  const product = event ? parseProductEvent(event) : null;

  const handleDelete = async () => {
    if (!event) return;
    try {
      await deleteProduct.mutateAsync(event);
      toast({
        title: 'Product removed',
        description: `"${product?.title ?? 'Product'}" was deleted from your store.`,
      });
      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      console.error('Failed to delete product:', error);
      toast({
        title: 'Delete failed',
        description: 'Could not remove the product. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this product?</AlertDialogTitle>
          <AlertDialogDescription>
            This publishes a Nostr deletion request (NIP-09) for
            {product?.title ? ` "${product.title}"` : ' this product'}. Relays will drop the
            listing. This cannot be undone, though you can always publish the product again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={deleteProduct.isPending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {deleteProduct.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Remove product
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
