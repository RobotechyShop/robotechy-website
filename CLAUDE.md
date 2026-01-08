# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev           # Start dev server on port 8080 (runs npm i first)
npm run build         # Build for production (runs npm i, copies 404.html for SPA routing)
npm run test          # Run full validation: TypeScript check, ESLint, Vitest, and build
npm run lint          # Run ESLint
npm run lint:fix      # Run ESLint with auto-fix
npm run format        # Format code with Prettier
npm run format:check  # Check code formatting
npm run deploy        # Build and deploy via nostr-deploy-cli
```

For running a single test file:
```bash
npx vitest run src/lib/genUserName.test.ts
```

## Architecture Overview

This is a Nostr client built with React 18, TailwindCSS 3, Vite, shadcn/ui, and Nostrify.

### Product Catalog (NIP-99 + Gamma Markets Spec)

Uses NIP-99 classified listings (kind 30402) with Gamma Markets spec extensions:
- **Kind 30402**: Products with tags for price, title, images, visibility, stock, specs, type, weight, dimensions
- **Kind 30405**: Product collections
- **Spec**: https://github.com/GammaMarkets/market-spec/blob/main/spec.md
- See `src/hooks/useProducts.ts` and `src/lib/productUtils.ts` for implementation

### Shopping Cart & Checkout (Gamma Markets Spec)

Uses Kind 16/17 for order processing per Gamma Markets spec:
- **Kind 16, Type 1**: Order creation (buyer → merchant)
- **Kind 16, Type 2**: Payment request (merchant → buyer)
- **Kind 16, Type 3**: Order status updates
- **Kind 16, Type 4**: Shipping/tracking info
- **Kind 17**: Payment receipt with Lightning preimage proof

Key files:
- `src/contexts/CartContext.tsx` - Cart state with localStorage persistence
- `src/hooks/useCart.ts` - Cart operations hook
- `src/hooks/useGammaCheckout.ts` - Order submission and payment subscription
- `src/lib/cartTypes.ts` - Cart and order type definitions
- `src/lib/gammaOrderUtils.ts` - Kind 16/17 event builders
- `src/components/cart/` - CartDrawer, CartItem, CartSummary, CartIcon
- `src/components/checkout/` - CheckoutDialog, ShippingForm, PaymentDisplay, OrderConfirmation

### Key Files

- **`App.tsx`**: Provider hierarchy (QueryClient, NostrProvider, NWCProvider, etc.) - read before modifying
- **`AppRouter.tsx`**: React Router configuration - add new routes above the catch-all `*` route
- **`AGENTS.md`**: Complete Nostr protocol implementation guide, hooks documentation, and design standards

### Directory Structure

- `src/components/ui/` - shadcn/ui components
- `src/components/auth/` - Login/signup components (LoginArea, LoginDialog, AccountSwitcher)
- `src/components/cart/` - Shopping cart components (CartDrawer, CartItem, CartSummary, CartIcon)
- `src/components/checkout/` - Checkout flow (CheckoutDialog, ShippingForm, PaymentDisplay, OrderConfirmation)
- `src/components/dm/` - Direct messaging components
- `src/hooks/` - Custom hooks (useNostr, useAuthor, useCurrentUser, useCart, useGammaCheckout, etc.)
- `src/contexts/` - React contexts (AppContext, NWCContext, DMContext, CartContext)
- `src/pages/` - Page components for React Router
- `src/lib/` - Utilities (productUtils, cartTypes, gammaOrderUtils)
- `docs/` - Documentation:
  - `INSTALLATION.adoc` - Setup and installation guide
  - `SOLUTION_DESIGN.adoc` - Architecture and design decisions
  - `TESTING.adoc` - Testing guide and best practices
  - `TROUBLESHOOTING.adoc` - Common issues and solutions
  - `AI_CHAT.md`, `NOSTR_*.md` - Feature-specific guides
- `eslint-rules/` - Custom ESLint rules

### Path Aliases

Use `@/` prefix for imports from src: `import { Button } from '@/components/ui/button'`

## Robotechy Brand Colors

- **Blue** `#557b97` - Headers, icons, prices
- **Orange** `#fa5200` - Feature highlights, accents
- **Green** `#9efe09` - Login buttons, primary CTAs

Defined in `tailwind.config.ts` as `robotechy.blue`, `robotechy.orange`, `robotechy.green`

## Custom ESLint Rules

- `custom/no-placeholder-comments` - Prevents "// In a real..." comments
- `custom/no-inline-script` - No inline scripts in HTML (CSP compliance)
- `custom/require-webmanifest` - Requires web manifest link in HTML

## Testing

Uses Vitest with jsdom. Wrap components in `TestApp` for required context providers:

```tsx
import { TestApp } from '@/test/TestApp';
render(<TestApp><MyComponent /></TestApp>);
```

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on push/PR to main:
- TypeScript type checking
- ESLint linting
- Prettier formatting check
- Vitest unit tests
- Production build verification

## Known Issues

### react-markdown Dependencies
react-markdown 10.x requires explicit peer dependencies. If you see errors like "does not provide an export named 'default'" for `style-to-js` or "Could not resolve" for packages like `devlop`, `hast-util-to-jsx-runtime`, etc:

1. Ensure these are installed as dependencies (already in package.json)
2. Clear Vite cache: `rm -rf node_modules/.vite`
3. Restart dev server
4. Hard refresh browser (Ctrl+Shift+R)

The `vite.config.ts` includes `optimizeDeps.include: ['style-to-js']` to handle ESM/CJS compatibility.

## Important Notes

- Read `AGENTS.md` for complete Nostr protocol implementation patterns and design standards
- Never modify `App.tsx` unless adding new providers
- Dev server binds to `::` (IPv6) on port 8080
- Uses TypeScript with `strictNullChecks` but not `strict` mode
