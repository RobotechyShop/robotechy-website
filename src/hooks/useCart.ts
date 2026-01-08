import { useContext, createContext, useCallback, useMemo } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { CartItem, CartState } from '@/lib/cartTypes';
import type { ProductData } from '@/lib/productUtils';

const CART_STORAGE_KEY = 'robotechy-cart';

const defaultCartState: CartState = {
  items: [],
  updatedAt: 0,
};

export interface CartContextType {
  items: CartItem[];
  addItem: (product: ProductData, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  currency: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const CartContext = createContext<CartContextType | null>(null);

export function useCartInternal(): CartContextType {
  const [cartState, setCartState] = useLocalStorage<CartState>(
    CART_STORAGE_KEY,
    defaultCartState
  );
  const [isOpen, setIsOpen] = useLocalStorage<boolean>('robotechy-cart-open', false);

  const addItem = useCallback((product: ProductData, quantity = 1) => {
    setCartState((prev) => {
      const existingIndex = prev.items.findIndex(
        (item) => item.productId === product.id
      );

      let newItems: CartItem[];
      if (existingIndex >= 0) {
        // Update quantity if item already exists
        newItems = prev.items.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + quantity, product }
            : item
        );
      } else {
        // Add new item
        newItems = [
          ...prev.items,
          {
            productId: product.id,
            quantity,
            product,
            addedAt: Date.now(),
          },
        ];
      }

      return {
        items: newItems,
        updatedAt: Date.now(),
      };
    });
  }, [setCartState]);

  const removeItem = useCallback((productId: string) => {
    setCartState((prev) => ({
      items: prev.items.filter((item) => item.productId !== productId),
      updatedAt: Date.now(),
    }));
  }, [setCartState]);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }

    setCartState((prev) => ({
      items: prev.items.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      ),
      updatedAt: Date.now(),
    }));
  }, [setCartState, removeItem]);

  const clearCart = useCallback(() => {
    setCartState(defaultCartState);
  }, [setCartState]);

  const totalItems = useMemo(
    () => cartState.items.reduce((sum, item) => sum + item.quantity, 0),
    [cartState.items]
  );

  // Calculate total price - assumes all items have same currency
  const { totalPrice, currency } = useMemo(() => {
    if (cartState.items.length === 0) {
      return { totalPrice: 0, currency: 'USD' };
    }

    const firstCurrency = cartState.items[0]?.product.price.currency || 'USD';
    const total = cartState.items.reduce((sum, item) => {
      const price = parseFloat(item.product.price.amount) || 0;
      return sum + price * item.quantity;
    }, 0);

    return { totalPrice: total, currency: firstCurrency };
  }, [cartState.items]);

  return {
    items: cartState.items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    totalItems,
    totalPrice,
    currency,
    isOpen,
    setIsOpen,
  };
}

export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
