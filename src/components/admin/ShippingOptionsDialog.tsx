import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, Truck } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { useProductAdmin } from '@/hooks/useProductAdmin';
import { useMerchantShippingOptions } from '@/hooks/useMerchantShippingOptions';
import {
  parseShippingOptionEvent,
  getCurrencyOptions,
  normalizeCurrency,
} from '@/lib/productUtils';
import {
  validateShippingForm,
  getDTag,
  type ShippingFormData,
  type ShippingService,
} from '@/lib/productAdmin';

interface ShippingOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY: ShippingFormData = {
  id: '',
  title: '',
  priceAmount: '',
  priceCurrency: 'SATS',
  countries: [],
  service: 'standard',
  carrier: '',
};

/** Amend shipping options — full CRUD over the merchant's kind 30406 events. */
export function ShippingOptionsDialog({ open, onOpenChange }: ShippingOptionsDialogProps) {
  const { toast } = useToast();
  const { data: options, isLoading } = useMerchantShippingOptions();
  const { saveShippingOption, deleteShippingOption } = useProductAdmin();

  const [form, setForm] = useState<ShippingFormData>(EMPTY);
  const [editing, setEditing] = useState<NostrEvent | null>(null);
  const [countriesText, setCountriesText] = useState('');

  useEffect(() => {
    if (!open) {
      setForm(EMPTY);
      setEditing(null);
      setCountriesText('');
    }
  }, [open]);

  const set = <K extends keyof ShippingFormData>(key: K, value: ShippingFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const startEdit = (event: NostrEvent) => {
    const parsed = parseShippingOptionEvent(event);
    if (!parsed) return;
    setEditing(event);
    setForm({
      id: parsed.id,
      title: parsed.title,
      priceAmount: parsed.price.amount,
      // Normalize so the currency <Select> (whose options are normalized) always
      // finds a matching value — `gbp` or ` cad ` would otherwise render blank.
      priceCurrency: normalizeCurrency(parsed.price.currency),
      countries: parsed.countries,
      service: (parsed.service as ShippingService) || 'standard',
      carrier: parsed.carrier || '',
    });
    setCountriesText(parsed.countries.join(', '));
  };

  const resetForm = () => {
    setEditing(null);
    setForm(EMPTY);
    setCountriesText('');
  };

  const handleSave = async () => {
    const data: ShippingFormData = {
      ...form,
      countries: countriesText
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    };
    const errors = validateShippingForm(data);
    if (errors.length > 0) {
      toast({ title: 'Please fix the form', description: errors[0], variant: 'destructive' });
      return;
    }
    try {
      await saveShippingOption.mutateAsync({ data, existing: editing ?? undefined });
      toast({
        title: editing ? 'Shipping option updated' : 'Shipping option added',
        description: `"${data.title}" was published.`,
      });
      resetForm();
    } catch (error) {
      console.error('Failed to save shipping option:', error);
      toast({ title: 'Save failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const handleDelete = async (event: NostrEvent) => {
    try {
      await deleteShippingOption.mutateAsync(event);
      toast({ title: 'Shipping option removed' });
      // Compare by addressable `d` id, not object identity — React Query refetch
      // can hand back new event objects for the same option.
      if (editing && getDTag(editing) === getDTag(event)) resetForm();
    } catch (error) {
      console.error('Failed to delete shipping option:', error);
      toast({ title: 'Delete failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> Shipping options
          </DialogTitle>
          <DialogDescription>
            Manage your delivery methods, destination zones and costs (Gamma Markets kind 30406).
          </DialogDescription>
        </DialogHeader>

        {/* Existing options */}
        <div className="min-w-0 space-y-2">
          <h3 className="text-sm font-semibold">Your shipping methods</h3>
          {isLoading ? (
            <p className="text-sm text-sage-500">Loading…</p>
          ) : options && options.length > 0 ? (
            <ul className="divide-y overflow-hidden rounded-md border">
              {options.map((event) => {
                const parsed = parseShippingOptionEvent(event);
                if (!parsed) return null;
                const countriesLabel = parsed.countries.join(', ') || 'no zones';
                return (
                  <li key={event.id} className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium" title={parsed.title}>
                        {parsed.title}
                      </p>
                      <p className="text-xs text-sage-500">
                        {parsed.price.amount} {parsed.price.currency} · {parsed.service}
                      </p>
                      <p className="break-words text-xs text-sage-500" title={countriesLabel}>
                        {countriesLabel}
                      </p>
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
            <p className="text-sm text-sage-500">No shipping options yet.</p>
          )}
        </div>

        {/* Editor */}
        <div className="min-w-0 space-y-4 rounded-md border p-4">
          <h3 className="text-sm font-semibold">
            {editing ? 'Edit shipping option' : 'Add shipping option'}
          </h3>
          <div className="space-y-2">
            <Label htmlFor="shipping-title">Title</Label>
            <Input
              id="shipping-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="UK Standard (Royal Mail)"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="shipping-price">Cost</Label>
              <Input
                id="shipping-price"
                inputMode="decimal"
                value={form.priceAmount}
                onChange={(e) => set('priceAmount', e.target.value)}
                placeholder="500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shipping-currency">Currency</Label>
              <Select
                value={form.priceCurrency}
                onValueChange={(value) => set('priceCurrency', value)}
              >
                <SelectTrigger id="shipping-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getCurrencyOptions(form.priceCurrency).map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shipping-service">Service</Label>
              <Select
                value={form.service}
                onValueChange={(value) => set('service', value as ShippingService)}
              >
                <SelectTrigger id="shipping-service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="express">Express</SelectItem>
                  <SelectItem value="overnight">Overnight</SelectItem>
                  <SelectItem value="pickup">Pickup</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shipping-countries">Destination countries (ISO codes)</Label>
            <Input
              id="shipping-countries"
              value={countriesText}
              onChange={(e) => setCountriesText(e.target.value)}
              placeholder="GB, IE, US"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shipping-carrier">Carrier (optional)</Label>
            <Input
              id="shipping-carrier"
              value={form.carrier ?? ''}
              onChange={(e) => set('carrier', e.target.value)}
              placeholder="Royal Mail"
            />
          </div>
          <div className="flex justify-end gap-2">
            {editing && (
              <Button variant="ghost" onClick={resetForm}>
                Cancel edit
              </Button>
            )}
            <Button onClick={handleSave} disabled={saveShippingOption.isPending}>
              {saveShippingOption.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {editing ? 'Save shipping option' : 'Add shipping option'}
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
