import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { useIsStoreOwner } from '@/hooks/useIsStoreOwner';
import { ProductFormDialog } from '@/components/admin/ProductFormDialog';
import { DeleteProductDialog } from '@/components/admin/DeleteProductDialog';

interface OwnerProductActionsProps {
  event: NostrEvent;
  /** Called after the product is deleted (e.g. navigate back to the storefront). */
  onDeleted?: () => void;
}

/**
 * Edit / Remove controls for a single product, shown only to the store owner.
 */
export function OwnerProductActions({ event, onDeleted }: OwnerProductActionsProps) {
  const isOwner = useIsStoreOwner();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!isOwner) return null;

  return (
    <div className="flex gap-3 rounded-lg border border-robotechy-green/40 bg-robotechy-green/10 p-3">
      <span className="self-center text-sm font-semibold text-robotechy-green-dark dark:text-robotechy-green">
        Owner
      </span>
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <Pencil className="mr-2 h-4 w-4" />
        Edit product
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Remove
      </Button>

      <ProductFormDialog open={editOpen} onOpenChange={setEditOpen} event={event} />
      <DeleteProductDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        event={event}
        onDeleted={onDeleted}
      />
    </div>
  );
}
