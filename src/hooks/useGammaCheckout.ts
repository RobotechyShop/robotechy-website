import { useState, useCallback, useEffect, useContext } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCart } from '@/hooks/useCart';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { MERCHANT_PUBKEY } from '@/hooks/useProducts';
import {
  generateOrderId,
  createOrderEventTemplate,
  createPaymentReceiptTemplate,
  parsePaymentRequest,
  toGammaPaymentOptions,
  ORDER_PROCESS_KIND,
  ORDER_MESSAGE_TYPE,
} from '@/lib/gammaOrderUtils';
import { formatPrice } from '@/lib/productUtils';
import { DMContext } from '@/contexts/DMContext';
import { MESSAGE_PROTOCOL } from '@/lib/dmConstants';
import type { ShippingInfo, CheckoutState, CartItem } from '@/lib/cartTypes';

/**
 * Format a human-readable order summary. This text is sent as a SECOND,
 * gift-wrapped (NIP-17) inner kind 14 message alongside the structured kind 16
 * order, so the order also renders in generic NIP-17 clients (Damus, Primal).
 * It is fully encrypted - this is NOT the old leaky plaintext NIP-04 summary.
 */
function formatOrderSummary(
  orderId: string,
  items: CartItem[],
  shipping: ShippingInfo,
  totalPrice: number,
  currency: string
): string {
  const orderIdShort = orderId.slice(0, 8);

  const itemsText = items
    .map((item) => {
      const price = parseFloat(item.product.price.amount);
      const itemCurrency = item.product.price.currency;
      const lineTotal = price * item.quantity;
      return `- ${item.quantity}x ${item.product.title} @ ${formatPrice(price, itemCurrency)} = ${formatPrice(lineTotal, itemCurrency)}`;
    })
    .join('\n');

  const addressParts = [
    shipping.name,
    shipping.address,
    shipping.city,
    shipping.postalCode,
    shipping.country,
  ].filter(Boolean);

  const addressText = addressParts.length > 0 ? `\nShip to:\n${addressParts.join('\n')}` : '';

  const contactParts: string[] = [];
  if (shipping.email) contactParts.push(`Email: ${shipping.email}`);
  if (shipping.phone) contactParts.push(`Phone: ${shipping.phone}`);
  const contactText = contactParts.length > 0 ? `\n${contactParts.join('\n')}` : '';

  const messageText = shipping.message ? `\nNote: ${shipping.message}` : '';

  // Itemise shipping and show the ALL-IN total (items + shipping) — the same
  // total that goes into the order's `amount` tag and gets invoiced.
  const shippingLabel = shipping.shippingTitle || shipping.shippingZone;
  const shippingCurrency = shipping.shippingCurrency || currency;
  const shippingCostText =
    shipping.shippingCost != null
      ? ` (${formatPrice(shipping.shippingCost, shippingCurrency)})`
      : '';
  // Only sum for display when the currencies actually match; otherwise show
  // both amounts rather than adding apples to oranges (the sats `amount` tag
  // converts each part in its own currency, so it stays correct either way).
  const sameCurrency = shippingCurrency.toUpperCase() === currency.toUpperCase();
  const totalText =
    shipping.shippingCost != null && !sameCurrency
      ? `${formatPrice(totalPrice, currency)} + ${formatPrice(shipping.shippingCost, shippingCurrency)} shipping`
      : formatPrice(totalPrice + (sameCurrency ? (shipping.shippingCost ?? 0) : 0), currency);

  return `📦 New Order #${orderIdShort}

Items:
${itemsText}

Shipping: ${shippingLabel}${shippingCostText}
Total: ${totalText}
${addressText}${contactText}${messageText}`.trim();
}

export function useGammaCheckout() {
  const { user } = useCurrentUser();
  const { items, totalPrice, currency, clearCart } = useCart();
  const { convertToSats } = useExchangeRate();

  // Access DM context - REQUIRED for NIP-17 gift-wrapped commerce messaging.
  // Orders, payment requests and receipts all travel as NIP-17 gift wraps so
  // customer PII never appears in plaintext public events.
  const dmContext = useContext(DMContext);

  const [checkoutState, setCheckoutState] = useState<CheckoutState>({
    orderId: null,
    status: 'idle',
  });

  // Watch for the merchant's gift-wrapped payment request (Kind 16 Type 2).
  // Payment requests now arrive as NIP-17 gift wraps and are decrypted by the
  // DMProvider, which exposes the inner rumor on each message's `decryptedEvent`.
  // We scan the merchant conversation for a payment request matching our order.
  useEffect(() => {
    if (!checkoutState.orderId || checkoutState.status !== 'awaiting_payment') {
      return;
    }

    // Already have the payment request - nothing to do.
    if (checkoutState.paymentRequest) {
      return;
    }

    const participant = dmContext?.messages.get(MERCHANT_PUBKEY);
    if (!participant) {
      return;
    }

    for (const message of participant.messages) {
      const inner = message.decryptedEvent;
      if (!inner || inner.kind !== ORDER_PROCESS_KIND) {
        continue;
      }

      const typeTag = inner.tags.find((t) => t[0] === 'type');
      if (typeTag?.[1] !== ORDER_MESSAGE_TYPE.PAYMENT_REQUEST) {
        continue;
      }

      const orderTag = inner.tags.find((t) => t[0] === 'order');
      if (orderTag?.[1] !== checkoutState.orderId) {
        continue;
      }

      const paymentRequest = parsePaymentRequest(inner);
      if (paymentRequest) {
        setCheckoutState((prev) => ({
          ...prev,
          paymentRequest: {
            id: paymentRequest.orderId,
            type: 2,
            amount: paymentRequest.amount,
            message: paymentRequest.message,
            payment_options: toGammaPaymentOptions(paymentRequest.paymentOptions),
          },
        }));
        break;
      }
    }
  }, [
    dmContext?.messages,
    checkoutState.orderId,
    checkoutState.status,
    checkoutState.paymentRequest,
  ]);

  const submitOrder = useCallback(
    async (shipping: ShippingInfo): Promise<string> => {
      if (!user?.signer) {
        throw new Error('You must be logged in to place an order');
      }

      if (items.length === 0) {
        throw new Error('Your cart is empty');
      }

      if (!dmContext?.sendMessage) {
        throw new Error('Secure messaging is unavailable - cannot place order securely');
      }

      setCheckoutState({
        orderId: null,
        status: 'submitting',
      });

      try {
        const orderId = generateOrderId();
        // Per the Gamma spec the order `amount` is the ALL-IN total in sats —
        // items PLUS the selected shipping option's cost. Convert each part in
        // its own currency (the shipping option may be priced differently).
        const itemsSats = convertToSats(totalPrice, currency);
        const shippingSats = shipping.shippingCost
          ? convertToSats(shipping.shippingCost, shipping.shippingCurrency || currency)
          : 0;
        const totalSats = itemsSats + shippingSats;

        // Build the order rumor (Kind 16 Type 1). This template carries the
        // structured order tags AND the customer's PII (address/email/phone).
        const eventTemplate = createOrderEventTemplate(
          orderId,
          items,
          shipping,
          MERCHANT_PUBKEY,
          totalSats
        );

        // Gift-wrap the order rumor to the merchant via NIP-17. The PII rides
        // inside the NIP-44 encrypted, kind-13 sealed, kind-1059 wrapped envelope -
        // no plaintext public event is published, and no separate NIP-04 summary
        // DM is needed (the wrapped order already carries everything).
        await dmContext.sendMessage({
          recipientPubkey: MERCHANT_PUBKEY,
          content: eventTemplate.content ?? '',
          protocol: MESSAGE_PROTOCOL.NIP17,
          rumorKind: eventTemplate.kind,
          rumorTags: eventTemplate.tags,
        });

        // Also send a gift-wrapped (NIP-17) readable kind 14 summary so the order
        // renders in generic NIP-17 clients (Damus/Primal), not just clients that
        // parse the structured kind 16. Both messages are encrypted - non-blocking
        // so a failed summary never fails the authoritative order.
        const orderSummary = formatOrderSummary(orderId, items, shipping, totalPrice, currency);
        dmContext
          .sendMessage({
            recipientPubkey: MERCHANT_PUBKEY,
            content: orderSummary,
            protocol: MESSAGE_PROTOCOL.NIP17,
          })
          .catch((error) => {
            console.warn('[Checkout] Failed to send readable order summary:', error);
          });

        // Update state to await payment. Persist the order total in sats here so
        // the payment receipt reports the real amount - the cart is cleared
        // immediately below, so recomputing from it later would yield 0 sats.
        setCheckoutState({
          orderId,
          status: 'awaiting_payment',
          totalSats,
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
    [user, items, totalPrice, currency, convertToSats, clearCart, dmContext]
  );

  const submitPaymentReceipt = useCallback(
    async (invoice: string, preimage: string): Promise<void> => {
      if (!user?.signer || !checkoutState.orderId) {
        throw new Error('Cannot submit payment receipt');
      }

      if (!dmContext?.sendMessage) {
        throw new Error('Secure messaging is unavailable - cannot submit payment receipt');
      }

      // Use the amount captured when the order was created. The cart was cleared
      // on order submission, so recomputing from totalPrice would give 0 sats -
      // that recompute is kept only as a defensive fallback.
      const totalSats = checkoutState.totalSats ?? convertToSats(totalPrice, currency);

      // Build the payment receipt rumor (Kind 17) and gift-wrap it to the merchant.
      const receiptTemplate = createPaymentReceiptTemplate(
        checkoutState.orderId,
        MERCHANT_PUBKEY,
        'lightning',
        invoice,
        preimage,
        totalSats
      );

      await dmContext.sendMessage({
        recipientPubkey: MERCHANT_PUBKEY,
        content: receiptTemplate.content ?? '',
        protocol: MESSAGE_PROTOCOL.NIP17,
        rumorKind: receiptTemplate.kind,
        rumorTags: receiptTemplate.tags,
      });

      // Also send a gift-wrapped readable kind 14 line so the receipt renders in
      // generic NIP-17 clients (encrypted; non-blocking informational copy).
      const receiptSummary = `🧾 Payment sent for order #${checkoutState.orderId.slice(0, 8)} — ${totalSats.toLocaleString()} sats (Lightning).`;
      dmContext
        .sendMessage({
          recipientPubkey: MERCHANT_PUBKEY,
          content: receiptSummary,
          protocol: MESSAGE_PROTOCOL.NIP17,
        })
        .catch((error) => {
          console.warn('[Checkout] Failed to send readable receipt summary:', error);
        });

      setCheckoutState((prev) => ({
        ...prev,
        status: 'paid',
      }));
    },
    [
      user,
      checkoutState.orderId,
      checkoutState.totalSats,
      totalPrice,
      currency,
      convertToSats,
      dmContext,
    ]
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
