import { Minus, Plus, Trash2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/hooks/useCart';
import { formatPriceFromTag } from '@/lib/productUtils';
import type { CartItem as CartItemType } from '@/lib/cartTypes';
import { useState } from 'react';

interface CartItemProps {
  item: CartItemType;
}

export function CartItem({ item }: CartItemProps) {
  const { updateQuantity, removeItem } = useCart();
  const [imageError, setImageError] = useState(false);

  const { product, quantity } = item;
  const imageUrl = product.images[0]?.url;
  const itemTotal = parseFloat(product.price.amount) * quantity;

  return (
    <div className="flex gap-3 py-3 border-b last:border-b-0">
      {/* Product Image */}
      <div className="w-16 h-16 flex-shrink-0 bg-muted rounded-md overflow-hidden">
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={product.title}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Product Details */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-sm line-clamp-2">{product.title}</h4>
        <p className="text-sm text-muted-foreground">{formatPriceFromTag(product.price)}</p>

        {/* Quantity Controls */}
        <div className="flex items-center gap-2 mt-2">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => updateQuantity(item.productId, quantity - 1)}
            disabled={quantity <= 1}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-8 text-center text-sm font-medium">{quantity}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => updateQuantity(item.productId, quantity + 1)}
            disabled={product.stock !== undefined && quantity >= product.stock}
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 ml-auto text-destructive hover:text-destructive"
            onClick={() => removeItem(item.productId)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Item Total */}
      <div className="text-right">
        <p className="font-medium text-sm text-robotechy-green-dark">
          {formatPriceFromTag({
            amount: itemTotal.toString(),
            currency: product.price.currency,
          })}
        </p>
      </div>
    </div>
  );
}
