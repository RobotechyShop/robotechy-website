import { useEffect, useState } from 'react';
import { FolderTree, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/useToast';
import { useProductAdmin } from '@/hooks/useProductAdmin';
import { useProducts, useCollections, MERCHANT_PUBKEY } from '@/hooks/useProducts';
import { parseProductEvent, parseCollectionEvent } from '@/lib/productUtils';
import { validateCollectionForm, type CollectionFormData } from '@/lib/productAdmin';

interface CollectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY: CollectionFormData = { id: '', title: '', description: '', image: '', productIds: [] };

/**
 * Amend categories — manage the storefront's collection taxonomy (kind 30405).
 *
 * In Gamma Markets, collections are the addressable groupings that drive the
 * storefront's "Categories" filter. (Free-text `t` categories live on each
 * product and are edited in the product dialog.)
 */
export function CollectionsDialog({ open, onOpenChange }: CollectionsDialogProps) {
  const { toast } = useToast();
  const { data: collections, isLoading } = useCollections();
  const { data: products } = useProducts({ limit: 100 });
  const { saveCollection, deleteCollection } = useProductAdmin();

  const [form, setForm] = useState<CollectionFormData>(EMPTY);
  const [editing, setEditing] = useState<NostrEvent | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY);
      setEditing(null);
    }
  }, [open]);

  const set = <K extends keyof CollectionFormData>(key: K, value: CollectionFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const startEdit = (event: NostrEvent) => {
    const parsed = parseCollectionEvent(event);
    if (!parsed) return;
    setEditing(event);
    setForm({
      id: parsed.id,
      title: parsed.title,
      description: parsed.description || '',
      image: parsed.image || '',
      // Collection 'a' refs are "30402:<pubkey>:<d>" — keep the product d-tag.
      // slice(2).join(':') preserves d-tags that themselves contain ':'.
      productIds: parsed.products.map((ref) => ref.split(':').slice(2).join(':')).filter(Boolean),
    });
  };

  const resetForm = () => {
    setEditing(null);
    setForm(EMPTY);
  };

  const toggleProduct = (productId: string, checked: boolean) =>
    set(
      'productIds',
      checked ? [...form.productIds, productId] : form.productIds.filter((id) => id !== productId)
    );

  const handleSave = async () => {
    const errors = validateCollectionForm(form);
    if (errors.length > 0) {
      toast({ title: 'Please fix the form', description: errors[0], variant: 'destructive' });
      return;
    }
    try {
      await saveCollection.mutateAsync({
        data: form,
        merchantPubkey: MERCHANT_PUBKEY,
        existing: editing ?? undefined,
      });
      toast({
        title: editing ? 'Collection updated' : 'Collection created',
        description: `"${form.title}" was published.`,
      });
      resetForm();
    } catch (error) {
      console.error('Failed to save collection:', error);
      toast({ title: 'Save failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const handleDelete = async (event: NostrEvent) => {
    try {
      await deleteCollection.mutateAsync(event);
      toast({ title: 'Collection removed' });
      if (editing === event) resetForm();
    } catch (error) {
      console.error('Failed to delete collection:', error);
      toast({ title: 'Delete failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" /> Categories &amp; collections
          </DialogTitle>
          <DialogDescription>
            Organise products into the storefront's category filter (Gamma Markets collections, kind
            30405).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Your collections</h3>
          {isLoading ? (
            <p className="text-sm text-sage-500">Loading…</p>
          ) : collections && collections.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {collections.map((event) => {
                const parsed = parseCollectionEvent(event);
                if (!parsed) return null;
                return (
                  <li key={event.id} className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{parsed.title}</p>
                      <p className="text-xs text-sage-500">{parsed.products.length} product(s)</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${parsed.title}`}
                        onClick={() => startEdit(event)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${parsed.title}`}
                        onClick={() => handleDelete(event)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-sage-500">No collections yet.</p>
          )}
        </div>

        <div className="space-y-4 rounded-md border p-4">
          <h3 className="text-sm font-semibold">
            {editing ? 'Edit collection' : 'New collection'}
          </h3>
          <div className="space-y-2">
            <Label htmlFor="collection-title">Title</Label>
            <Input
              id="collection-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Seed Signers"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="collection-description">Description</Label>
            <Textarea
              id="collection-description"
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Products in this collection</Label>
            {products && products.length > 0 ? (
              <ScrollArea className="h-40 rounded-md border p-2">
                <div className="space-y-2">
                  {products.map((event) => {
                    const product = parseProductEvent(event);
                    if (!product) return null;
                    const checked = form.productIds.includes(product.id);
                    return (
                      <label
                        key={product.id}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggleProduct(product.id, value === true)}
                          aria-label={`Toggle ${product.title}`}
                        />
                        <span className="truncate">{product.title}</span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-sage-500">No products to add yet.</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            {editing && (
              <Button variant="ghost" onClick={resetForm}>
                Cancel edit
              </Button>
            )}
            <Button onClick={handleSave} disabled={saveCollection.isPending}>
              {saveCollection.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {editing ? 'Save collection' : 'Create collection'}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
