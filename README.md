# Robotechy Website

A Nostr-native e-commerce website built with React, using Gamma Markets spec for products and orders, with Lightning Network payments.

## Quick Start

```bash
# Install dependencies and start development server
npm run dev

# Run both frontend and order service together
npm run dev:all

# Run order service separately
npm run dev:orders
```

## Order Processing

The checkout system uses **Gamma Markets specification** with Kind 16/17 events for orders and payments.

### Order Flow

```
BUYER (Frontend)                    MERCHANT (Backend Service)
      |                                      |
      |  1. Kind 16 Type 1 (Order)           |
      |  --------------------------------->  |
      |                                      |
      |  2. NIP-04 DM (Order Summary)        |
      |  --------------------------------->  | (Merchant sees in Damus)
      |                                      |
      |                                      |  3. Resolve Lightning Address
      |                                      |  4. Generate BOLT11 Invoice
      |                                      |
      |  5. Kind 16 Type 2 (Payment Request) |
      |  <---------------------------------  |
      |                                      |
      |  6. NIP-04 DM (Invoice Link)         |
      |  <---------------------------------  | (Buyer sees if page closed)
      |                                      |
      |  7. Display invoice QR (if on page)  |
      |                                      |
      |  8. Kind 17 (Payment Receipt)        |
      |  --------------------------------->  | (Buyer confirms payment)
      |                                      |
      |  9. NIP-04 DM (Thank You)            |
      |  <---------------------------------  | (Buyer sees confirmation)
      |                                      |
```

### Event Types

| Kind | Type | Description |
|------|------|-------------|
| 16 | 1 | Order creation (buyer → merchant) |
| 16 | 2 | Payment request with invoice (merchant → buyer) |
| 16 | 3 | Order status update |
| 16 | 4 | Shipping update |
| 17 | - | Payment receipt with preimage |
| 4 | - | NIP-04 DM notifications |

### Payment Options

The checkout UI supports multiple payment methods:
- **QR Code** - Scan with any Lightning wallet
- **Copy Invoice** - Paste into wallet apps
- **WebLN** - Browser extensions (Alby, etc.)
- **NWC** - Nostr Wallet Connect
- **Open in Wallet** - `lightning:` URI link

## Order Service Setup

The order processing service runs as a Node.js backend:

```bash
cd order-service
cp .env.example .env
# Edit .env with your merchant nsec and Lightning Address
npm install
npm start
```

### Environment Variables

```bash
MERCHANT_NSEC=nsec1...           # Merchant's secret key
LIGHTNING_ADDRESS=you@getalby.com # Lightning Address for invoices
FALLBACK_RELAYS=wss://relay.damus.io,wss://nos.lol
```

## Development

```bash
npm run dev          # Frontend only
npm run dev:orders   # Order service only
npm run dev:all      # Both together
npm run test         # Run all tests
npm run build        # Production build
npm run deploy       # Deploy to Nostr
```

## Docker

Build and run as a single container with both frontend and order service:

```bash
# Build the image
docker build -t robotechy:latest .

# Run with order service enabled
docker run -d \
  -p 3000:3000 \
  -e MERCHANT_NSEC=nsec1... \
  -e LIGHTNING_ADDRESS=yourname@getalby.com \
  -e FALLBACK_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net \
  --name robotechy \
  robotechy:latest

# Run frontend only (no order processing)
docker run -d -p 3000:3000 --name robotechy robotechy:latest
```

The frontend is served on port 3000. The order service connects outbound to Nostr relays (no inbound port needed).

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MERCHANT_NSEC` | For orders | Merchant's Nostr secret key (nsec format) |
| `LIGHTNING_ADDRESS` | For orders | Lightning Address for invoice generation |
| `FALLBACK_RELAYS` | No | Comma-separated relay URLs (has defaults) |

If `MERCHANT_NSEC` or `LIGHTNING_ADDRESS` are not set, the container runs frontend-only mode.

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, shadcn/ui
- **Nostr**: Nostrify, nostr-tools
- **Orders**: Gamma Markets spec (Kind 16/17)
- **Payments**: Lightning Network via LNURL-pay
- **Messaging**: NIP-04 encrypted DMs
- **Container**: Docker with Node.js 20 Alpine
