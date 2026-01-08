import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ShippingInfo } from '@/lib/cartTypes';
import type { ShippingOptionData } from '@/lib/productUtils';

// Default shipping zones when no Kind 30406 options are available
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
    countries: [],
    regions: [],
    pubkey: '',
  },
  {
    id: 'worldwide',
    title: 'Worldwide',
    price: { amount: '25', currency: 'GBP' },
    countries: [],
    regions: [],
    pubkey: '',
  },
];

const shippingSchema = z.object({
  shippingZone: z.string().min(1, 'Please select a shipping zone'),
  name: z.string().optional(),
  address: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  email: z.string().email('Valid email is required').optional().or(z.literal('')),
  phone: z.string().optional(),
  message: z.string().optional(),
});

type ShippingFormData = z.infer<typeof shippingSchema>;

interface ShippingFormProps {
  onSubmit: (data: ShippingInfo) => void;
  isSubmitting: boolean;
  currency?: string;
  shippingOptions?: ShippingOptionData[];
}

export function ShippingForm({
  onSubmit,
  isSubmitting,
  currency = 'GBP',
  shippingOptions,
}: ShippingFormProps) {
  // Use provided shipping options or fall back to defaults
  const options = shippingOptions && shippingOptions.length > 0
    ? shippingOptions
    : DEFAULT_SHIPPING_OPTIONS;

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
      shippingZone: options[0]?.id || '',
    },
  });

  const selectedZone = watch('shippingZone');

  const handleFormSubmit = (data: ShippingFormData) => {
    const address = data.address || '';
    const shippingInfo: ShippingInfo = {
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      address: data.address2 ? `${address}, ${data.address2}` : address,
      city: data.city || '',
      state: '',
      postalCode: data.postalCode || '',
      country: data.country || '',
      shippingZone: data.shippingZone,
      message: data.message || '',
    };
    onSubmit(shippingInfo);
  };

  const formatShippingCost = (option: ShippingOptionData) => {
    const amount = parseFloat(option.price.amount);
    const optionCurrency = option.price.currency || currency;

    if (amount === 0) {
      return `0 ${optionCurrency}`;
    }

    // Add extra cost if specified
    const extraCost = option.extraCost ? parseFloat(option.extraCost) : 0;
    const totalCost = amount + extraCost;

    return `${totalCost} ${optionCurrency}`;
  };

  const getOptionLabel = (option: ShippingOptionData) => {
    return `${option.title} - ${formatShippingCost(option)}`;
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Shipping Zone Section */}
      <div className="space-y-2">
        <Label htmlFor="shippingZone">Shipping Zone *</Label>
        <Select
          value={selectedZone}
          onValueChange={(value) => setValue('shippingZone', value, { shouldValidate: true })}
        >
          <SelectTrigger
            tabIndex={1}
            className={errors.shippingZone ? 'border-destructive' : ''}
          >
            <SelectValue placeholder="Select shipping zone" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {getOptionLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.shippingZone && (
          <p className="text-sm text-destructive">{errors.shippingZone.message}</p>
        )}
      </div>

      <Separator />

      {/* Shipping Address Section */}
      <div className="space-y-4">
        <h3 className="font-medium text-lg">Shipping Address (optional)</h3>

        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            tabIndex={2}
            placeholder="John Doe"
            {...register('name')}
            className={errors.name ? 'border-destructive' : ''}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Address Line 1</Label>
          <Input
            id="address"
            tabIndex={3}
            placeholder="123 Main Street"
            {...register('address')}
            className={errors.address ? 'border-destructive' : ''}
          />
          {errors.address && (
            <p className="text-sm text-destructive">{errors.address.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="address2">Address Line 2</Label>
          <Input
            id="address2"
            tabIndex={4}
            placeholder="Apartment, suite, etc."
            {...register('address2')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              tabIndex={5}
              placeholder="Cambridge"
              {...register('city')}
              className={errors.city ? 'border-destructive' : ''}
            />
            {errors.city && (
              <p className="text-sm text-destructive">{errors.city.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="postalCode">Postcode</Label>
            <Input
              id="postalCode"
              tabIndex={6}
              placeholder="CB1 2AB"
              {...register('postalCode')}
              className={errors.postalCode ? 'border-destructive' : ''}
            />
            {errors.postalCode && (
              <p className="text-sm text-destructive">{errors.postalCode.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="country">Country</Label>
          <Input
            id="country"
            tabIndex={7}
            placeholder="United Kingdom"
            {...register('country')}
            className={errors.country ? 'border-destructive' : ''}
          />
          {errors.country && (
            <p className="text-sm text-destructive">{errors.country.message}</p>
          )}
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
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
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
        disabled={!isValid || isSubmitting}
      >
        {isSubmitting ? 'Processing...' : 'Place Order'}
      </Button>
    </form>
  );
}
