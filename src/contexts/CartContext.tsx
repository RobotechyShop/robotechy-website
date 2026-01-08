import { ReactNode } from 'react';
import { useCartInternal, CartContext } from '@/hooks/useCart';

export function CartProvider({ children }: { children: ReactNode }) {
  const cart = useCartInternal();
  return <CartContext.Provider value={cart}>{children}</CartContext.Provider>;
}
