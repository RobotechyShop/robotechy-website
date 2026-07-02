import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CountryCombobox } from './CountryCombobox';
import { countryName, detectLocaleCountry } from '@/lib/countries';
import { filterShippingOptions, shippingCostFor, shippingOptionRef } from '@/lib/shippingSelection';
import { formatPrice } from '@/lib/productUtils';
import type { ShippingInfo } from '@/lib/cartTypes';
import type { ShippingOptionData } from '@/lib/productUtils';

// Legacy fallback zones, used ONLY when the merchant has no kind-30406 options
// at all. Their costs are now charged like real options; `countries` uses ISO
// codes so country-first filtering applies to them too ([] = worldwide).
const EU_COUNTRIES = [
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IS',
  'IT',
  'LI',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
  'ES',
  'CH',
];

const DEFAULT_SHIPPING_OPTIONS: ShippingOptionData[] = [
  {
    id: 'uk',
    title: 'UK',
    price: { amount: '0', currency: 'GBP' },
    countries: ['GB'],
    regions: [],
    pubkey: '',
  },
  {
    id: 'europe',
    title: 'Europe',
    price: { amount: '15', currency: 'GBP' },
    countries: EU_COUNTRIES,
    regions: [],
    pubkey: '',
  },
  {
    id: 'worldwide',
    title: 'Worldwide',
    price: { amount: '25', currency: 'GBP' },
    countries: [], // worldwide
    regions: [],
    pubkey: '',
  },
];

const shippingSchema = z.object({
  countryCode: z.string().min(1, 'Please select your country'),
  shippingZone: z.string().min(1, 'Please select a shipping method'),
  name: z.string().optional(),
  address: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  email: z.string().email('Valid email is required').optional().or(z.literal('')),
  phone: z.string().optional(),
  message: z.string().optional(),
});

type ShippingFormData = z.infer<typeof shippingSchema>;

interface ShippingFormProps {
  onSubmit: (data: ShippingInfo) => void;
  isSubmitting: boolean;
  currency?: string;
  /** Real kind-30406 options for this cart (falls back to legacy zones). */
  shippingOptions?: ShippingOptionData[];
  /** True while the real options are still resolving from relays. */
  optionsLoading?: boolean;
  /** Cart items subtotal, for the subtotal/shipping/total summary row. */
  subtotal?: number;
}

export function ShippingForm({
  onSubmit,
  isSubmitting,
  currency = 'GBP',
  shippingOptions,
  optionsLoading = false,
  subtotal,
}: ShippingFormProps) {
  // Use the merchant's real options when available; legacy zones otherwise.
  const options =
    shippingOptions && shippingOptions.length > 0 ? shippingOptions : DEFAULT_SHIPPING_OPTIONS;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<ShippingFormData>({
    resolver: zodResolver(shippingSchema),
    mode: 'onChange',
    defaultValues: {
      // Country FIRST: pre-select from the browser locale; the buyer can change
      // it. Shipping methods are filtered to those covering this country.
      countryCode: detectLocaleCountry() || '',
      shippingZone: '',
    },
  });

  const countryCode = watch('countryCode');
  const selectedZone = watch('shippingZone');

  // Only methods that ship to the selected country ([] countries = worldwide).
  const availableOptions = useMemo(
    () => (countryCode ? filterShippingOptions(options, countryCode) : []),
    [options, countryCode]
  );

  const selectedOption = availableOptions.find((option) => option.id === selectedZone);

  // Keep the selection coherent as the country (or options) change: clear a
  // selection that no longer ships there; auto-select when exactly one fits.
  useEffect(() => {
    if (selectedZone && !availableOptions.some((option) => option.id === selectedZone)) {
      setValue('shippingZone', '', { shouldValidate: true });
    } else if (!selectedZone && availableOptions.length === 1) {
      setValue('shippingZone', availableOptions[0].id, { shouldValidate: true });
    }
  }, [availableOptions, selectedZone, setValue]);

  const shippingCost = selectedOption ? shippingCostFor(selectedOption) : null;
  const sameCurrency =
    !!shippingCost && shippingCost.currency.toUpperCase() === currency.toUpperCase();

  const handleFormSubmit = (data: ShippingFormData) => {
    if (!selectedOption) return; // guarded by disabled submit; belt and braces
    const cost = shippingCostFor(selectedOption);
    const address = data.address || '';
    const shippingInfo: ShippingInfo = {
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      address: data.address2 ? `${address}, ${data.address2}` : address,
      city: data.city || '',
      state: '',
      postalCode: data.postalCode || '',
      country: countryName(data.countryCode),
      countryCode: data.countryCode,
      shippingZone: selectedOption.id,
      // Legacy fallback zones aren't real 30406 events (pubkey '') — they get
      // costs but no order `shipping` reference tag.
      shippingRef: selectedOption.pubkey ? shippingOptionRef(selectedOption) : undefined,
      shippingCost: cost.amount,
      shippingCurrency: cost.currency,
      shippingTitle: selectedOption.title,
      message: data.message || '',
    };
    onSubmit(shippingInfo);
  };

  const formatOptionLabel = (option: ShippingOptionData) => {
    const cost = shippingCostFor(option);
    return `${option.title} - ${formatPrice(cost.amount, cost.currency)}`;
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Ship-to country — chosen FIRST so only compatible methods are shown. */}
      <div className="space-y-2">
        <Label htmlFor="countryCode">Ship to *</Label>
        <CountryCombobox
          id="countryCode"
          tabIndex={1}
          value={countryCode}
          onChange={(code) => setValue('countryCode', code, { shouldValidate: true })}
        />
        {errors.countryCode && (
          <p className="text-sm text-destructive">{errors.countryCode.message}</p>
        )}
      </div>

      {/* Shipping method, filtered to the selected country. */}
      <div className="space-y-2">
        <Label htmlFor="shippingZone">Shipping Method *</Label>
        {optionsLoading ? (
          <Skeleton className="h-10 w-full" data-testid="shipping-options-loading" />
        ) : !countryCode ? (
          <p className="text-sm text-muted-foreground">Select your country first.</p>
        ) : availableOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="no-shipping-options">
            We don't ship to {countryName(countryCode)} yet — message the shop and we'll see what we
            can do.
          </p>
        ) : (
          <Select
            value={selectedZone}
            onValueChange={(value) => setValue('shippingZone', value, { shouldValidate: true })}
          >
            <SelectTrigger tabIndex={2} className={errors.shippingZone ? 'border-destructive' : ''}>
              <SelectValue placeholder="Select shipping method" />
            </SelectTrigger>
            <SelectContent>
              {availableOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {formatOptionLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {errors.shippingZone && countryCode && availableOptions.length > 0 && (
          <p className="text-sm text-destructive">{errors.shippingZone.message}</p>
        )}
      </div>

      {/* Order summary: subtotal + shipping = the total that will be invoiced. */}
      {subtotal != null && (
        <div className="rounded-lg bg-muted p-3 text-sm space-y-1" data-testid="order-totals">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatPrice(subtotal, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Shipping</span>
            <span>
              {shippingCost ? formatPrice(shippingCost.amount, shippingCost.currency) : '—'}
            </span>
          </div>
          <Separator className="my-1" />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>
              {shippingCost
                ? sameCurrency
                  ? formatPrice(subtotal + shippingCost.amount, currency)
                  : `${formatPrice(subtotal, currency)} + ${formatPrice(shippingCost.amount, shippingCost.currency)}`
                : formatPrice(subtotal, currency)}
            </span>
          </div>
        </div>
      )}

      <Separator />

      {/* Shipping Address Section */}
      <div className="space-y-4">
        <h3 className="font-medium text-lg">Shipping Address (optional)</h3>

        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            tabIndex={3}
            placeholder="John Doe"
            {...register('name')}
            className={errors.name ? 'border-destructive' : ''}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Address Line 1</Label>
          <Input
            id="address"
            tabIndex={4}
            placeholder="123 Main Street"
            {...register('address')}
            className={errors.address ? 'border-destructive' : ''}
          />
          {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="address2">Address Line 2</Label>
          <Input
            id="address2"
            tabIndex={5}
            placeholder="Apartment, suite, etc."
            {...register('address2')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              tabIndex={6}
              placeholder="Cambridge"
              {...register('city')}
              className={errors.city ? 'border-destructive' : ''}
            />
            {errors.city && <p className="text-sm text-destructive">{errors.city.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="postalCode">Postcode</Label>
            <Input
              id="postalCode"
              tabIndex={7}
              placeholder="CB1 2AB"
              {...register('postalCode')}
              className={errors.postalCode ? 'border-destructive' : ''}
            />
            {errors.postalCode && (
              <p className="text-sm text-destructive">{errors.postalCode.message}</p>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Contact Information Section */}
      <div className="space-y-4">
        <h3 className="font-medium text-lg">Contact Information</h3>

        <div className="space-y-2">
          <Label htmlFor="email">Email (optional)</Label>
          <Input
            id="email"
            tabIndex={8}
            type="email"
            placeholder="you@example.com"
            {...register('email')}
            className={errors.email ? 'border-destructive' : ''}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input
            id="phone"
            tabIndex={9}
            type="tel"
            placeholder="+44 7700 900000"
            {...register('phone')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="message">Order Notes (optional)</Label>
          <Textarea
            id="message"
            tabIndex={10}
            placeholder="Any special instructions for your order..."
            {...register('message')}
            rows={3}
          />
        </div>
      </div>

      <Button
        type="submit"
        tabIndex={11}
        className="w-full bg-robotechy-green hover:brightness-110 text-black font-semibold"
        disabled={!isValid || !selectedOption || isSubmitting || optionsLoading}
      >
        {isSubmitting ? 'Processing...' : 'Place Order'}
      </Button>
    </form>
  );
}
