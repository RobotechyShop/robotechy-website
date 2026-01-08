import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPriceFromTag, parseProductEvent } from '@/lib/productUtils';
import type { NostrEvent } from '@nostrify/nostrify';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

interface ProductCardProps {
  event: NostrEvent;
}

export function ProductCard({ event }: ProductCardProps) {
  const product = parseProductEvent(event);
  const [imageError, setImageError] = useState(false);

  if (!product) return null;

  const naddr = nip19.naddrEncode({
    kind: 30402,
    pubkey: event.pubkey,
    identifier: product.id,
  });

  const firstImage = product.images[0]?.url;
  const isOutOfStock = product.stock !== undefined && product.stock === 0;

  return (
    <Link to={`/${naddr}`}>
      <Card className="group overflow-hidden hover:shadow-xl transition-all duration-300 h-full flex flex-col border-slate-200 dark:border-slate-800">
        {firstImage && !imageError ? (
          <div className="relative overflow-hidden aspect-square bg-slate-50 dark:bg-slate-900">
            <img
              src={firstImage}
              alt={product.title}
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
              onError={() => setImageError(true)}
            />
            {isOutOfStock && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  OUT OF STOCK
                </Badge>
              </div>
            )}
          </div>
        ) : (
          <div className="relative overflow-hidden aspect-square bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <div className="text-slate-400 dark:text-slate-600 text-center p-4">
              <svg
                className="h-16 w-16 mx-auto mb-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-xs">No image</p>
            </div>
          </div>
        )}

        <CardContent className="p-5 flex-1 flex flex-col">
          <h3 className="font-semibold text-base line-clamp-2 mb-2 group-hover:text-robotechy-blue transition-colors">
            {product.title}
          </h3>

          {product.summary && (
            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-3 flex-1">
              {product.summary}
            </p>
          )}

          <div className="mt-auto space-y-2">
            {product.stock !== undefined && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {product.stock > 0 ? `${product.stock} available` : 'Out of stock'}
              </p>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xl font-bold text-robotechy-blue">
                {formatPriceFromTag(product.price)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
