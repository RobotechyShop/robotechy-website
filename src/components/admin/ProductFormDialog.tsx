import { useEffect, useMemo, useState } from 'react';
import { ImageIcon, Loader2, Plus, Upload, X } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useProductAdmin } from '@/hooks/useProductAdmin';
import {
  productEventToFormData,
  validateProductForm,
  type ProductFormData,
  type ProductVisibility,
} from '@/lib/productAdmin';
import { PRODUCT_LOCATIONS } from '@/lib/productLocations';

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog opens in edit mode for this product event. */
  event?: NostrEvent;
}

/** Sentinel Select value for "no location set" — Radix Select forbids "". */
const NO_LOCATION = '__none__';

/**
 * Namespace real location values so a stored location that happens to equal
 * the sentinel can never collide with it (Radix requires unique item values).
 */
const encodeLocation = (location: string) => `loc:${location}`;
const decodeLocation = (value: string) => value.slice('loc:'.length);

const EMPTY_FORM: ProductFormData = {
  id: '',
  title: '',
  summary: '',
  description: '',
  priceAmount: '',
  priceCurrency: 'SATS',
  priceFrequency: '',
  images: [''],
  visibility: 'on-sale',
  stock: '',
  productType: 'simple',
  medium: 'physical',
  location: '',
  categories: [],
};

/**
 * Small preview of an image URL, shown beside each Images row so the owner can
 * tell listings apart at a glance. Falls back to a placeholder icon when the
 * URL is empty or the image can't load; the error state resets whenever the
 * URL changes so pasting a new URL retries the preview.
 */
function ImageThumb({ url }: { url: string }) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setErrored(false);
    setLoaded(false);
  }, [url]);
  const trimmed = url.trim();
  // The img stays hidden until onLoad fires so a bad URL never flashes the
  // browser's broken-image glyph — the placeholder icon shows until then.
  const showImage = trimmed !== '' && !errored;

  return (
    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {showImage && (
        <img
          src={trimmed}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className={loaded ? 'h-full w-full object-cover' : 'hidden'}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}
      {!(showImage && loaded) && <ImageIcon className="h-4 w-4 text-muted-foreground" />}
    </div>
  );
}

export function ProductFormDialog({ open, onOpenChange, event }: ProductFormDialogProps) {
  const isEdit = Boolean(event);
  const { toast } = useToast();
  const { saveProduct } = useProductAdmin();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();

  const [form, setForm] = useState<ProductFormData>(EMPTY_FORM);
  const [categoryInput, setCategoryInput] = useState('');

  // Reset the form whenever the dialog opens (edit -> hydrate, create -> blank).
  useEffect(() => {
    if (!open) return;
    setForm(event ? productEventToFormData(event) : { ...EMPTY_FORM });
    setCategoryInput('');
  }, [open, event]);

  const set = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setImage = (index: number, value: string) =>
    setForm((prev) => ({
      ...prev,
      images: prev.images.map((img, i) => (i === index ? value : img)),
    }));

  const addImage = () => setForm((prev) => ({ ...prev, images: [...prev.images, ''] }));
  const removeImage = (index: number) =>
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));

  const handleUpload = async (index: number, file: File) => {
    try {
      const [[, url]] = await uploadFile(file);
      setImage(index, url);
    } catch (error) {
      console.error('Image upload failed:', error);
      toast({
        title: 'Upload failed',
        description: 'Could not upload image.',
        variant: 'destructive',
      });
    }
  };

  const addCategory = () => {
    const value = categoryInput.trim();
    if (!value || form.categories.includes(value)) return;
    set('categories', [...form.categories, value]);
    setCategoryInput('');
  };

  const removeCategory = (value: string) =>
    set(
      'categories',
      form.categories.filter((c) => c !== value)
    );

  // Predefined ship-from locations, plus the current value if it's a custom
  // one (e.g. set before this dropdown existed) so editing never silently
  // drops it.
  const locationOptions = useMemo(() => {
    const current = form.location?.trim();
    return current && !PRODUCT_LOCATIONS.includes(current)
      ? [...PRODUCT_LOCATIONS, current]
      : PRODUCT_LOCATIONS;
  }, [form.location]);

  const handleSubmit = async () => {
    const errors = validateProductForm(form);
    if (errors.length > 0) {
      toast({ title: 'Please fix the form', description: errors[0], variant: 'destructive' });
      return;
    }
    try {
      await saveProduct.mutateAsync({ data: form, existing: event });
      toast({
        title: isEdit ? 'Product updated' : 'Product published',
        description: `"${form.title}" was published to Nostr.`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to publish product:', error);
      toast({
        title: 'Publish failed',
        description: 'Could not publish the product. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit product' : 'Add a new product'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this listing and republish the NIP-99 event (same identifier).'
              : 'Publish a new NIP-99 (kind 30402) product listing to your store.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-title">Title</Label>
            <Input
              id="product-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Seed Signer Case"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-summary">Summary</Label>
            <Input
              id="product-summary"
              value={form.summary ?? ''}
              onChange={(e) => set('summary', e.target.value)}
              placeholder="Short tagline shown on the product card"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-description">Description (Markdown)</Label>
            <Textarea
              id="product-description"
              value={form.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              placeholder="Full description in Markdown"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="product-price">Price</Label>
              <Input
                id="product-price"
                inputMode="decimal"
                value={form.priceAmount}
                onChange={(e) => set('priceAmount', e.target.value)}
                placeholder="21000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-currency">Currency</Label>
              <Input
                id="product-currency"
                value={form.priceCurrency}
                onChange={(e) => set('priceCurrency', e.target.value.toUpperCase())}
                placeholder="SATS"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-stock">Stock</Label>
              <Input
                id="product-stock"
                inputMode="numeric"
                value={form.stock ?? ''}
                onChange={(e) => set('stock', e.target.value)}
                placeholder="Unlimited"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Images</Label>
            {form.images.map((image, index) => (
              <div key={index} className="flex items-center gap-2">
                <ImageThumb url={image} />
                <Input
                  aria-label={`Image URL ${index + 1}`}
                  value={image}
                  onChange={(e) => setImage(index, e.target.value)}
                  placeholder="https://…/image.png"
                />
                <label className="cursor-pointer">
                  {/* sr-only (not `hidden`) keeps the input focusable and
                      operable by keyboard / screen readers. */}
                  <input
                    type="file"
                    accept="image/*"
                    aria-label={`Upload image ${index + 1}`}
                    className="peer sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      // Clear the value so re-selecting the same file (e.g. after
                      // a failed upload) still fires onChange.
                      e.target.value = '';
                      if (file) handleUpload(index, file);
                    }}
                  />
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border peer-focus-visible:ring-2 peer-focus-visible:ring-robotechy-green-dark">
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                  </span>
                </label>
                {form.images.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove image ${index + 1}`}
                    onClick={() => removeImage(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addImage}>
              <Plus className="mr-2 h-4 w-4" />
              Add image
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-category">Categories</Label>
            <div className="flex gap-2">
              <Input
                id="product-category"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder="e.g. seedsigner"
              />
              <Button type="button" variant="outline" onClick={addCategory}>
                Add
              </Button>
            </div>
            {form.categories.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {form.categories.map((category) => (
                  <Badge key={category} variant="secondary" className="gap-1">
                    {category}
                    <button
                      type="button"
                      aria-label={`Remove category ${category}`}
                      onClick={() => removeCategory(category)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-sage-500">
              Categories are NIP-99 <code>t</code> tags on this product. To group products into the
              storefront filter, use Categories &amp; Collections.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-visibility">Visibility</Label>
              <Select
                value={form.visibility}
                onValueChange={(value) => set('visibility', value as ProductVisibility)}
              >
                <SelectTrigger id="product-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on-sale">On sale</SelectItem>
                  <SelectItem value="pre-order">Pre-order</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-location">Location</Label>
              <Select
                value={form.location?.trim() ? encodeLocation(form.location.trim()) : NO_LOCATION}
                onValueChange={(value) =>
                  set('location', value === NO_LOCATION ? '' : decodeLocation(value))
                }
              >
                <SelectTrigger id="product-location">
                  <SelectValue placeholder="No location set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LOCATION}>No location set</SelectItem>
                  {locationOptions.map((location) => (
                    <SelectItem key={location} value={encodeLocation(location)}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saveProduct.isPending}
            className="bg-robotechy-green text-black hover:bg-robotechy-green/90"
          >
            {saveProduct.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Publish product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
