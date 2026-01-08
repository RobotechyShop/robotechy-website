import { useState, useCallback, useEffect, useContext } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCart } from '@/hooks/useCart';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { MERCHANT_PUBKEY } from '@/hooks/useProducts';
import {
  generateOrderId,
  createOrderEventTemplate,
  createPaymentReceiptTemplate,
  parsePaymentRequest,
  ORDER_PROCESS_KIND,
  ORDER_MESSAGE_TYPE,
} from '@/lib/gammaOrderUtils';
import { formatPrice } from '@/lib/productUtils';
import { DMContext } from '@/contexts/DMContext';
import { MESSAGE_PROTOCOL } from '@/lib/dmConstants';
import type { ShippingInfo, CheckoutState } from '@/lib/cartTypes';
import type { CartItem } from '@/lib/cartTypes';

/**
 * Format order summary message for NIP-04 DM notification
 */
function formatOrderSummary(
  orderId: string,
  items: CartItem[],
  shipping: ShippingInfo,
  totalPrice: number,
  currency: string
): string {
  const orderIdShort = orderId.slice(0, 8);

  // Format items list
  const itemsText = items.map(item => {
    const price = parseFloat(item.product.price.amount);
    const itemCurrency = item.product.price.currency;
    const lineTotal = price * item.quantity;
    return `- ${item.quantity}x ${item.product.title} @ ${formatPrice(price, itemCurrency)} = ${formatPrice(lineTotal, itemCurrency)}`;
  }).join('\n');

  // Build address if provided
  const addressParts = [
    shipping.name,
    shipping.address,
    shipping.city,
    shipping.postalCode,
    shipping.country,
  ].filter(Boolean);

  const addressText = addressParts.length > 0
    ? `\nShip to:\n${addressParts.join('\n')}`
    : '';

  // Build contact info
  const contactParts: string[] = [];
  if (shipping.email) contactParts.push(`Email: ${shipping.email}`);
  if (shipping.phone) contactParts.push(`Phone: ${shipping.phone}`);
  const contactText = contactParts.length > 0 ? `\n${contactParts.join('\n')}` : '';

  // Build message note
  const messageText = shipping.message ? `\nNote: ${shipping.message}` : '';

  return `📦 New Order #${orderIdShort}

Items:
${itemsText}

Shipping: ${shipping.shippingZone}
Total: ${formatPrice(totalPrice, currency)}
${addressText}${contactText}${messageText}`.trim();
}

export function useGammaCheckout() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { items, totalPrice, currency, clearCart } = useCart();
  const { convertToSats } = useExchangeRate();

  // Access DM context for sending order notification (optional - may be null if DM not enabled)
  const dmContext = useContext(DMContext);

  const [checkoutState, setCheckoutState] = useState<CheckoutState>({
    orderId: null,
    status: 'idle',
  });

  // Subscribe to payment requests for active order
  useEffect(() => {
    if (!checkoutState.orderId || checkoutState.status !== 'awaiting_payment') {
      return;
    }

    const controller = new AbortController();

    const subscribeToPaymentRequests = async () => {
      try {
        // Subscribe to Kind 16 events from the merchant
        // Note: Don't use #order filter as many relays don't support it - filter client-side
        const filter = {
          kinds: [ORDER_PROCESS_KIND],
          authors: [MERCHANT_PUBKEY],
          since: Math.floor(Date.now() / 1000) - 60, // Look back 60 seconds
        };

        for await (const msg of nostr.req([filter], { signal: controller.signal })) {
          if (msg[0] === 'EVENT') {
            const event = msg[2];

            // Client-side filter: check if this event is for our order
            const orderTag = event.tags.find((t: string[]) => t[0] === 'order');
            if (orderTag?.[1] !== checkoutState.orderId) {
              continue; // Not our order
            }

            const typeTag = event.tags.find((t: string[]) => t[0] === 'type');

            if (typeTag?.[1] === ORDER_MESSAGE_TYPE.PAYMENT_REQUEST) {
              const paymentRequest = parsePaymentRequest(event);
              if (paymentRequest) {
                setCheckoutState((prev) => ({
                  ...prev,
                  paymentRequest: {
                    id: paymentRequest.orderId,
                    type: 2,
                    amount: paymentRequest.amount,
                    message: paymentRequest.message,
                    payment_options: paymentRequest.paymentOptions.map((opt) => ({
                      type: opt.type === 'lightning' ? 'ln' : opt.type === 'bitcoin' ? 'ln' : 'lnurl',
                      link: opt.detail,
                    })),
                  },
                }));
              }
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Error subscribing to payment requests:', error);
        }
      }
    };

    subscribeToPaymentRequests();

    return () => {
      controller.abort();
    };
  }, [nostr, checkoutState.orderId, checkoutState.status]);

  const submitOrder = useCallback(
    async (shipping: ShippingInfo): Promise<string> => {
      if (!user?.signer) {
        throw new Error('You must be logged in to place an order');
      }

      if (items.length === 0) {
        throw new Error('Your cart is empty');
      }

      setCheckoutState({
        orderId: null,
        status: 'submitting',
      });

      try {
        const orderId = generateOrderId();
        const totalSats = convertToSats(totalPrice, currency);

        // Create the order event
        const eventTemplate = createOrderEventTemplate(
          orderId,
          items,
          shipping,
          MERCHANT_PUBKEY,
          totalSats
        );

        // Sign and publish the event
        const signedEvent = await user.signer.signEvent({
          kind: eventTemplate.kind!,
          content: eventTemplate.content!,
          tags: eventTemplate.tags!,
          created_at: eventTemplate.created_at!,
        });

        await nostr.event(signedEvent);

        // Send NIP-04 DM notification to merchant (non-blocking)
        // This allows Isaac to see the order in Damus/Primal
        if (dmContext?.sendMessage) {
          const orderSummary = formatOrderSummary(orderId, items, shipping, totalPrice, currency);
          dmContext.sendMessage({
            recipientPubkey: MERCHANT_PUBKEY,
            content: orderSummary,
            protocol: MESSAGE_PROTOCOL.NIP04,
          }).catch((error) => {
            // Log but don't fail checkout if DM fails
            console.warn('[Checkout] Failed to send order notification DM:', error);
          });
        }

        // Update state to await payment
        setCheckoutState({
          orderId,
          status: 'awaiting_payment',
        });

        // Clear the cart after successful order submission
        clearCart();

        return orderId;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to submit order';
        setCheckoutState({
          orderId: null,
          status: 'error',
          error: errorMessage,
        });
        throw error;
      }
    },
    [user, items, totalPrice, currency, nostr, clearCart, dmContext]
  );

  const submitPaymentReceipt = useCallback(
    async (invoice: string, preimage: string): Promise<void> => {
      if (!user?.signer || !checkoutState.orderId) {
        throw new Error('Cannot submit payment receipt');
      }

      const totalSats = convertToSats(totalPrice, currency);

      const receiptTemplate = createPaymentReceiptTemplate(
        checkoutState.orderId,
        MERCHANT_PUBKEY,
        'lightning',
        invoice,
        preimage,
        totalSats
      );

      const signedEvent = await user.signer.signEvent({
        kind: receiptTemplate.kind!,
        content: receiptTemplate.content!,
        tags: receiptTemplate.tags!,
        created_at: receiptTemplate.created_at!,
      });

      await nostr.event(signedEvent);

      setCheckoutState((prev) => ({
        ...prev,
        status: 'paid',
      }));
    },
    [user, checkoutState.orderId, totalPrice, currency, nostr]
  );

  const resetCheckout = useCallback(() => {
    setCheckoutState({
      orderId: null,
      status: 'idle',
    });
  }, []);

  return {
    checkoutState,
    submitOrder,
    submitPaymentReceipt,
    resetCheckout,
    isSubmitting: checkoutState.status === 'submitting',
    isAwaitingPayment: checkoutState.status === 'awaiting_payment',
    isPaid: checkoutState.status === 'paid',
    hasError: checkoutState.status === 'error',
  };
}
