import { useState } from 'react';
import { FolderTree, PackagePlus, Truck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useIsStoreOwner } from '@/hooks/useIsStoreOwner';
import { ProductFormDialog } from '@/components/admin/ProductFormDialog';
import { ShippingOptionsDialog } from '@/components/admin/ShippingOptionsDialog';
import { CollectionsDialog } from '@/components/admin/CollectionsDialog';

/**
 * Store-owner controls shown on the storefront. Rendered only when the
 * signed-in user is the merchant (`useIsStoreOwner`), so non-owners see nothing.
 */
export function OwnerToolbar() {
  const isOwner = useIsStoreOwner();
  const [addOpen, setAddOpen] = useState(false);
  const [shippingOpen, setShippingOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);

  if (!isOwner) return null;

  return (
    <div className="border-b border-robotechy-green/40 bg-robotechy-green/10">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <span className="text-sm font-semibold text-robotechy-green-dark dark:text-robotechy-green">
          Store owner tools
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="bg-robotechy-green text-black hover:bg-robotechy-green/90"
          >
            <PackagePlus className="mr-2 h-4 w-4" />
            Add product
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShippingOpen(true)}>
            <Truck className="mr-2 h-4 w-4" />
            Shipping options
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCollectionsOpen(true)}>
            <FolderTree className="mr-2 h-4 w-4" />
            Categories &amp; collections
          </Button>
        </div>
      </div>

      <ProductFormDialog open={addOpen} onOpenChange={setAddOpen} />
      <ShippingOptionsDialog open={shippingOpen} onOpenChange={setShippingOpen} />
      <CollectionsDialog open={collectionsOpen} onOpenChange={setCollectionsOpen} />
    </div>
  );
}
