/**
 * Lightning Address resolution and invoice generation via LNURL-pay
 */

/**
 * Resolve Lightning Address to LNURL endpoint metadata
 * @param {string} address - Lightning Address (e.g., "robotechy@getalby.com")
 * @returns {Promise<{callback: string, minSendable: number, maxSendable: number, metadata: string}>}
 */
export async function resolveLightningAddress(address) {
  const [name, domain] = address.split('@');
  if (!name || !domain) {
    throw new Error(`Invalid Lightning Address: ${address}`);
  }

  const endpoint = `https://${domain}/.well-known/lnurlp/${name}`;
  console.log(`[Lightning] Resolving ${address} -> ${endpoint}`);

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(
      `Failed to resolve Lightning Address: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  if (data.status === 'ERROR') {
    throw new Error(`LNURL error: ${data.reason || 'Unknown error'}`);
  }

  if (!data.callback) {
    throw new Error('Invalid LNURL response: missing callback');
  }

  return {
    callback: data.callback,
    minSendable: data.minSendable || 1000, // Minimum in millisats
    maxSendable: data.maxSendable || 100000000000, // Maximum in millisats
    metadata: data.metadata || '',
    tag: data.tag,
    // Max comment length the endpoint accepts (LUD-12). 0/absent = no comments.
    commentAllowed: data.commentAllowed || 0,
  };
}

/**
 * Request a BOLT11 invoice from LNURL callback
 * @param {string} callback - LNURL callback URL
 * @param {number} amountMsats - Amount in millisatoshis
 * @param {string} [comment] - Optional comment (order ID)
 * @returns {Promise<{pr: string, routes: any[]}>} - BOLT11 payment request
 */
export async function requestInvoice(callback, amountMsats, comment = '', commentAllowed = 0) {
  const url = new URL(callback);
  url.searchParams.set('amount', amountMsats.toString());
  // Only attach a comment if the endpoint accepts one (LUD-12), truncated to its
  // advertised max length. Some endpoints (e.g. LNbits with comments disabled)
  // report commentAllowed: 0 and reject any comment outright.
  if (comment && commentAllowed > 0) {
    url.searchParams.set('comment', comment.slice(0, commentAllowed));
  }

  console.log(`[Lightning] Requesting invoice: ${amountMsats} msats`);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to request invoice: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status === 'ERROR') {
    throw new Error(`Invoice request error: ${data.reason || 'Unknown error'}`);
  }

  if (!data.pr) {
    throw new Error('Invalid invoice response: missing payment request');
  }

  return {
    pr: data.pr, // BOLT11 invoice string
    routes: data.routes || [],
  };
}

/**
 * Generate a Lightning invoice for an order
 * @param {string} lightningAddress - Lightning Address to receive payment
 * @param {number} amountSats - Amount in satoshis
 * @param {string} orderId - Order ID for comment/reference
 * @returns {Promise<string>} - BOLT11 invoice string
 */
export async function generateInvoice(lightningAddress, amountSats, orderId) {
  // Resolve Lightning Address to LNURL endpoint
  const lnurl = await resolveLightningAddress(lightningAddress);

  // Convert sats to millisats
  const amountMsats = amountSats * 1000;

  // Validate amount is within limits
  if (amountMsats < lnurl.minSendable) {
    throw new Error(`Amount ${amountSats} sats is below minimum ${lnurl.minSendable / 1000} sats`);
  }
  if (amountMsats > lnurl.maxSendable) {
    throw new Error(`Amount ${amountSats} sats exceeds maximum ${lnurl.maxSendable / 1000} sats`);
  }

  // Request invoice with order ID as comment (only sent if the endpoint allows it)
  const { pr } = await requestInvoice(
    lnurl.callback,
    amountMsats,
    `Order ${orderId.slice(0, 8)}`,
    lnurl.commentAllowed
  );

  console.log(
    `[Lightning] Generated invoice for ${amountSats} sats (Order ${orderId.slice(0, 8)})`
  );

  return pr;
}

/**
 * Validate that a Lightning Address is working
 * @param {string} address - Lightning Address to validate
 * @returns {Promise<boolean>}
 */
export async function validateLightningAddress(address) {
  try {
    await resolveLightningAddress(address);
    return true;
  } catch (error) {
    console.error(`[Lightning] Invalid Lightning Address ${address}:`, error.message);
    return false;
  }
}
