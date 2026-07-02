import { useMemo } from 'react';
import { useCart } from '@/hooks/useCart';
import { useShippingOptions } from '@/hooks/useShippingOptions';
import { useMerchantShippingOptions } from '@/hooks/useMerchantShippingOptions';
import { parseShippingOptionEvent, type ShippingOptionData } from '@/lib/productUtils';
import { collectCartShippingRefs } from '@/lib/shippingSelection';

/**
 * Resolve the real (kind 30406) shipping options for the current cart:
 *
 * 1. Prefer the options the cart's products reference via `shipping_option`
 *    tags — including each tag's optional extra-cost element (which
 *    ProductData.shippingOptions drops, so we re-read the raw events here).
 * 2. Fall back to ALL of the merchant's published shipping options when the
 *    products don't reference any (older listings predating shipping refs).
 *
 * Returns `isLoading` so the checkout can hold the form while options resolve
 * instead of flashing the legacy hard-coded zones.
 */
export function useCheckoutShippingOptions(): {
  options: ShippingOptionData[];
  isLoading: boolean;
} {
  const { items } = useCart();

  const cartRefs = useMemo(
    () => collectCartShippingRefs(items.map((item) => item.product.event)),
    [items]
  );

  const productOptionsQuery = useShippingOptions({
    shippingOptionRefs: cartRefs.map((r) => r.ref),
  });

  // Merchant-wide fallback — only fetched when the products reference nothing.
  const merchantOptionsQuery = useMerchantShippingOptions();

  return useMemo(() => {
    if (cartRefs.length > 0) {
      const fetched = productOptionsQuery.data ?? [];
      // Re-attach each ref's extra-cost (the fetch hook works from bare ref
      // strings, so it can't know about the product tag's third element).
      const extraByRef = new Map(cartRefs.map((r) => [r.ref, r.extraCost]));
      const options = fetched.map((option) => ({
        ...option,
        extraCost: extraByRef.get(`30406:${option.pubkey}:${option.id}`) ?? option.extraCost,
      }));
      if (options.length > 0 || productOptionsQuery.isLoading) {
        return { options, isLoading: productOptionsQuery.isLoading };
      }
      // Referenced options unresolvable (deleted/unreachable) — fall through to
      // the merchant's full set rather than a dead end.
    }

    const merchantEvents = merchantOptionsQuery.data ?? [];
    const options = merchantEvents
      .map((event) => parseShippingOptionEvent(event))
      .filter((option): option is ShippingOptionData => option !== null);
    return { options, isLoading: merchantOptionsQuery.isLoading };
  }, [
    cartRefs,
    productOptionsQuery.data,
    productOptionsQuery.isLoading,
    merchantOptionsQuery.data,
    merchantOptionsQuery.isLoading,
  ]);
}
