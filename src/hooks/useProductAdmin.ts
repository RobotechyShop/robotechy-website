import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useNostrPublish } from '@/hooks/useNostrPublish';
import {
  buildProductEvent,
  buildProductDeleteEvent,
  buildShippingOptionEvent,
  buildShippingOptionDeleteEvent,
  buildCollectionEvent,
  buildCollectionDeleteEvent,
  type ProductFormData,
  type ShippingFormData,
  type CollectionFormData,
} from '@/lib/productAdmin';

/**
 * Owner-side catalog mutations. Each wraps a pure builder from
 * `@/lib/productAdmin` and the app's existing publish path (`useNostrPublish`,
 * which signs with the logged-in owner's key), then invalidates the relevant
 * storefront queries so the UI reflects the change.
 */
export function useProductAdmin() {
  const { mutateAsync: publish } = useNostrPublish();
  const queryClient = useQueryClient();

  const invalidateProducts = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['product'] });
  };
  const invalidateCollections = () => queryClient.invalidateQueries({ queryKey: ['collections'] });
  const invalidateShipping = () =>
    queryClient.invalidateQueries({ queryKey: ['shipping-options'] });

  const saveProduct = useMutation({
    mutationFn: (vars: { data: ProductFormData; existing?: NostrEvent }) =>
      publish(buildProductEvent(vars.data, vars.existing)),
    onSuccess: invalidateProducts,
  });

  const deleteProduct = useMutation({
    mutationFn: (event: NostrEvent) => publish(buildProductDeleteEvent(event)),
    onSuccess: invalidateProducts,
  });

  const saveShippingOption = useMutation({
    mutationFn: (vars: { data: ShippingFormData; existing?: NostrEvent }) =>
      publish(buildShippingOptionEvent(vars.data, vars.existing)),
    onSuccess: invalidateShipping,
  });

  const deleteShippingOption = useMutation({
    mutationFn: (event: NostrEvent) => publish(buildShippingOptionDeleteEvent(event)),
    onSuccess: invalidateShipping,
  });

  const saveCollection = useMutation({
    mutationFn: (vars: {
      data: CollectionFormData;
      merchantPubkey: string;
      existing?: NostrEvent;
    }) => publish(buildCollectionEvent(vars.data, vars.merchantPubkey, vars.existing)),
    onSuccess: invalidateCollections,
  });

  const deleteCollection = useMutation({
    mutationFn: (event: NostrEvent) => publish(buildCollectionDeleteEvent(event)),
    onSuccess: invalidateCollections,
  });

  return {
    saveProduct,
    deleteProduct,
    saveShippingOption,
    deleteShippingOption,
    saveCollection,
    deleteCollection,
  };
}
