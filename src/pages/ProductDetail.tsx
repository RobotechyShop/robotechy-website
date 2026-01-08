import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useNavigate } from 'react-router-dom';
import { useProduct } from '@/hooks/useProducts';
import { useToast } from '@/hooks/useToast';
import { useCart } from '@/hooks/useCart';
import { formatPriceFromTag, parseProductEvent } from '@/lib/productUtils';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { CheckoutDialog } from '@/components/checkout/CheckoutDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  Share2,
  Package,
  ImageIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ProductDetailProps {
  identifier: string;
}

export function ProductDetail({ identifier }: ProductDetailProps) {
  const navigate = useNavigate();
  const { data: event, isLoading } = useProduct(identifier);
  const product = event ? parseProductEvent(event) : null;
  const { toast } = useToast();
  const { addItem, setIsOpen: setCartOpen } = useCart();
  const [selectedImage, setSelectedImage] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useSeoMeta({
    title: product ? `${product.title} - Robotechy` : 'Loading...',
    description: product?.summary?.slice(0, 160),
  });

  const handleImageError = (index: number) => {
    setImageErrors(prev => new Set(prev).add(index));
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({
        title: product?.title,
        text: product?.summary,
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
      toast({
        title: 'Link copied',
        description: 'Product link copied to clipboard.',
      });
    }
  };

  const handleAddToCart = () => {
    if (!product) return;
    addItem(product, quantity);
    toast({
      title: 'Added to cart',
      description: `${quantity}x ${product.title} added to your cart.`,
    });
    setCartOpen(true);
  };

  const handleBuyNow = () => {
    if (!product) return;
    addItem(product, quantity);
    setCheckoutOpen(true);
  };

  const isOutOfStock = product && product.stock !== undefined && product.stock === 0;
  const currentImage = product?.images[selectedImage];
  const hasValidImage = currentImage && !imageErrors.has(selectedImage);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <header className="border-b bg-white dark:bg-slate-900 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              <div className="flex items-center gap-3">
                <a href="/" className="flex items-center gap-2">
                  <img 
                    src="https://robotechy.com/cdn/shop/files/New_Robotechy_Logo_White_Background_195x.png?v=1639256993"
                    alt="Robotechy"
                    className="h-12 w-auto max-w-[195px]"
                  />
                </a>
              </div>
            </div>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-10 w-32 mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <div className="space-y-6">
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-8 w-32" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
              <Package className="h-8 w-8 text-slate-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Product not found</h3>
              <p className="text-slate-600 dark:text-slate-400">
                This product may have been removed or doesn't exist.
              </p>
            </div>
            <Button onClick={() => navigate('/')} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Shop
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="hover:bg-transparent hover:text-robotechy-blue -ml-3"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Shop
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Product Images */}
          <div className="space-y-4">
            {/* Main Image */}
            <div className="bg-white dark:bg-slate-900 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
              {hasValidImage ? (
                <div className="relative aspect-square bg-white dark:bg-slate-800">
                  <img
                    src={currentImage.url}
                    alt={`${product.title} - Image ${selectedImage + 1}`}
                    className="object-cover w-full h-full"
                    onError={() => handleImageError(selectedImage)}
                  />
                </div>
              ) : (
                <div className="aspect-square bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <div className="text-center text-slate-400 dark:text-slate-600">
                    <ImageIcon className="h-24 w-24 mx-auto mb-4" />
                    <p className="text-sm">Image not available</p>
                  </div>
                </div>
              )}
            </div>

            {/* Thumbnail Images */}
            {product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {product.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      selectedImage === index
                        ? 'border-robotechy-blue'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {!imageErrors.has(index) ? (
                      <img
                        src={image.url}
                        alt={`Thumbnail ${index + 1}`}
                        className="object-cover w-full h-full"
                        onError={() => handleImageError(index)}
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-slate-400" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-2">
                {product.title}
              </h1>
              
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {formatPriceFromTag(product.price)}
              </div>
              
              {product.summary && (
                <p className="text-slate-600 dark:text-slate-400 mt-3 italic text-sm">
                  {product.summary}
                </p>
              )}
            </div>

            <Separator />

            {/* Quantity Selector */}
            <div className="space-y-3">
              <Label htmlFor="quantity">Quantity</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  max={product.stock || undefined}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24"
                />
                {product.stock !== undefined && (
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {product.stock > 0 ? `${product.stock} available` : 'Out of stock'}
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {!isOutOfStock ? (
                <>
                  <Button
                    size="lg"
                    className="w-full bg-robotechy-green hover:bg-robotechy-green/90 text-black"
                    onClick={handleAddToCart}
                  >
                    Add to Cart
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full border-robotechy-blue text-robotechy-blue hover:bg-robotechy-blue/10"
                    onClick={handleBuyNow}
                  >
                    Buy It Now
                  </Button>
                </>
              ) : (
                <Button size="lg" className="w-full" disabled>
                  Out of Stock
                </Button>
              )}

              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={handleShare}
              >
                <Share2 className="h-5 w-5 mr-2" />
                Share
              </Button>
            </div>

            <Separator />

            {/* Product Description */}
            {product.content && (
              <div className="prose prose-slate dark:prose-invert max-w-none prose-sm">
                <ReactMarkdown>{product.content}</ReactMarkdown>
              </div>
            )}

            {/* Specifications */}
            {product.specs.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold text-lg mb-3">Specifications</h3>
                  <dl className="space-y-2">
                    {product.specs.map(([key, value], index) => (
                      <div key={index} className="flex justify-between text-sm py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <dt className="text-slate-600 dark:text-slate-400 font-medium">{key}</dt>
                        <dd className="text-slate-900 dark:text-white">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </>
            )}

            {/* Physical Properties */}
            {(product.weight || product.dimensions) && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold text-lg mb-3">Physical Details</h3>
                  <dl className="space-y-2">
                    {product.weight && (
                      <div className="flex justify-between text-sm py-2 border-b border-slate-100 dark:border-slate-800">
                        <dt className="text-slate-600 dark:text-slate-400 font-medium">Weight</dt>
                        <dd className="text-slate-900 dark:text-white">{product.weight.value} {product.weight.unit}</dd>
                      </div>
                    )}
                    {product.dimensions && (
                      <div className="flex justify-between text-sm py-2">
                        <dt className="text-slate-600 dark:text-slate-400 font-medium">Dimensions</dt>
                        <dd className="text-slate-900 dark:text-white">{product.dimensions.value} {product.dimensions.unit}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Footer />

      {/* Cart Drawer (includes its own checkout dialog) */}
      <CartDrawer />

      {/* Checkout Dialog for "Buy It Now" */}
      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} />
    </div>
  );
}
