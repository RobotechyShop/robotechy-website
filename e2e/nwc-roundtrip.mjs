/**
 * PR #63 confidence test: full NIP-47 round-trip on @getalby/sdk v8 over
 * real public relays, exercising the app's EXACT payment path from useNWC.ts:
 *   new LN(connectionString)  ->  client.pay(invoice)  ->  { preimage }
 * A mock NWCWalletService (also SDK v8) plays the wallet side and returns a
 * known preimage. No real sats involved.
 */
import { NWCWalletService, NWCWalletServiceKeyPair, LN } from '@getalby/sdk';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

const hex = (b) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
// Syntactically valid (long-expired) mainnet invoice for 21 sats — the mock
// wallet doesn't validate it; LN.pay just needs to parse it.
const INVOICE = 'lnbc210n1p4yw93dpp5675f8hlcx4ng5ekwfdtpjd6lqeq7pwwfeulcjrlxzr4sya0jfkhshp5lxvc2fjj9ud8jpwrcg5ck8qth43d830trhvfy0rqdmxc4ux80auscqzzsxqrrsssp5z000mph94scqwde3mtkxtk7ywrqfye3aynl47crpha955x6pta9q9qxpqysgqzj6ydqtalcydyxfazwugl8wqzekhcdt0t4rp2maneyynr0wywk84dpcek0xc36rfq7twwrqpdaw0gt2ch0kdec08dwn056jawnpmkqsq8hxqjr';


let subCloser = null;
let service = null;

async function main() {
  // ── wallet side (mock service) ────────────────────────────────────────────
  const walletSk = generateSecretKey();
  const clientSk = generateSecretKey();
  const walletSecret = hex(walletSk);
  const clientSecret = hex(clientSk);
  const clientPubkey = getPublicKey(clientSk);
  const walletPubkey = getPublicKey(walletSk);

  service = new NWCWalletService({ relayUrls: RELAYS });
  await service.publishWalletServiceInfoEvent(walletSecret, ['get_info', 'pay_invoice'], []);
  console.log('✓ wallet-service info event published to', RELAYS.join(', '));

  const PREIMAGE = 'ab'.repeat(32);
  const keypair = new NWCWalletServiceKeyPair(walletSecret, clientPubkey);
  let sawInvoice = null;
  subCloser = await service.subscribe(keypair, {
    getInfo: async () => ({
      result: {
        alias: 'mock-wallet',
        color: '#9efe09',
        pubkey: walletPubkey,
        network: 'mainnet',
        block_height: 1,
        block_hash: '00'.repeat(32),
        methods: ['get_info', 'pay_invoice'],
        notifications: [],
      },
      error: undefined,
    }),
    payInvoice: async (request) => {
      sawInvoice = request.invoice;
      console.log('✓ mock wallet received pay_invoice over NIP-47 (encrypted round-trip works)');
      return { result: { preimage: PREIMAGE }, error: undefined };
    },
  });
  console.log('✓ mock wallet subscribed for client requests');

  // ── app side: the EXACT code path from useNWC.ts ──────────────────────────
  const relayParams = RELAYS.map((r) => `relay=${encodeURIComponent(r)}`).join('&');
  const connectionString = `nostr+walletconnect://${walletPubkey}?${relayParams}&secret=${clientSecret}`;
  const client = new LN(connectionString); // as useNWC does on connect
  console.log('✓ new LN(connectionString) constructed');

  const t0 = Date.now();
  // Mirror useNWC's 15s timeout race exactly.
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Payment timeout after 15 seconds')), 15000));
  const response = await Promise.race([client.pay(INVOICE), timeout]); // as useNWC's payInvoice does
  const ms = Date.now() - t0;

  if (response?.preimage !== PREIMAGE) {
    throw new Error(`preimage mismatch: ${JSON.stringify(response)}`);
  }
  if (sawInvoice !== INVOICE) {
    throw new Error('mock wallet did not receive the exact invoice');
  }
  console.log(`✓ client.pay() resolved { preimage } in ${ms}ms (within the app's 15s window)`);
  console.log('PR63 NWC E2E: PASS');
}

main()
  .catch((e) => { console.error('PR63 NWC E2E: FAIL —', e.message); process.exitCode = 1; })
  .finally(() => { try { subCloser?.(); service?.close(); } catch { /* noop */ } setTimeout(() => process.exit(), 500); });
