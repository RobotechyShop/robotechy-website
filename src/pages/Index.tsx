import { useSeoMeta } from '@unhead/react';
import { useProducts, useCollections } from '@/hooks/useProducts';
import { ProductCard } from '@/components/ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';
import { Search, ShoppingCart } from 'lucide-react';
import { parseProductEvent } from '@/lib/productUtils';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { OwnerToolbar } from '@/components/admin/OwnerToolbar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import { shopOwnerPubkey } from '@/lib/shopOwner';

const Index = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);

  // Live shop-owner profile drives the hero portrait (same source as the footer).
  const owner = useAuthor(shopOwnerPubkey());
  const ownerMeta = owner.data?.metadata;
  const ownerName = ownerMeta?.display_name || ownerMeta?.name || 'Isaac';

  useSeoMeta({
    title: 'Robotechy | 3D Printing Bitcoin Store | Bitcoin Seed Signer Cases',
    description:
      'This site is a 3D printing store that includes printing cases for Bitcoin Seed Signers amongst other Bitcoin accessories. We accept Bitcoin.',
  });

  const { data: products, isLoading } = useProducts({
    limit: 100,
  });

  const { data: collections } = useCollections();

  // Get product IDs from selected collection
  const getCollectionProductIds = (): string[] | null => {
    if (!selectedCollection || !collections) return null;
    const collection = collections.find((c) =>
      c.tags.find(([name, value]) => name === 'd' && value === selectedCollection)
    );
    if (!collection) return null;
    // Collection references products via 'a' tags: ["a", "30402:<pubkey>:<d-tag>"]
    return collection.tags
      .filter(([name]) => name === 'a')
      .map(([, ref]) => {
        const parts = ref.split(':');
        return parts.length >= 3 ? parts[2] : null;
      })
      .filter((id): id is string => id !== null);
  };

  const collectionProductIds = getCollectionProductIds();

  const filteredProducts = products?.filter((event) => {
    const product = parseProductEvent(event);
    if (!product) return false;

    // Filter by collection if selected
    if (collectionProductIds && !collectionProductIds.includes(product.id)) {
      return false;
    }

    // Filter by search query
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      return (
        product.title.toLowerCase().includes(searchLower) ||
        (product.summary && product.summary.toLowerCase().includes(searchLower))
      );
    }

    return true;
  });

  const handleCollectionClick = (collectionId: string | null) => {
    setSelectedCollection(collectionId);
    setSearchQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Header />

      <OwnerToolbar />

      {/* Hero Banner — the SAME short band as before (height set by padding,
          avatar at 26.2% / 15.4% width — identical geometry to the previous
          baked-text banner), but the quote and by-line are now real, editable,
          selectable HTML over the text-free background plate
          (bitcoin-banner-plate-clean.jpg — the plate with photo AND text layers
          hidden). Text positions/sizes replicate where the baked text sat, in
          the PSD's actual fonts (Ubuntu Bold Italic + Japanese Robot Italic —
          see README-fonts.md). By-line is name only — no age. The banner is a
          container-query context so text tracks the band width in `cqw` exactly
          like the bitmap text used to. */}
      <div
        className="relative bg-slate-100 dark:bg-neutral-900 border-b overflow-hidden"
        style={{
          containerType: 'inline-size',
          backgroundImage: 'url(/images/bitcoin-banner-plate-clean.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Avatar over the plate's circle: center x≈26.2%, vertically centered.
            Sized to ~75% of the original photo circle so it doesn't touch the
            banner's top/bottom edges. (Unchanged from the previous banner.) */}
        <Avatar
          className="absolute aspect-square h-auto -translate-x-1/2 -translate-y-1/2 border-4 border-white shadow-lg"
          style={{ left: '26.2%', top: '50%', width: '15.4%' }}
        >
          <AvatarImage src={ownerMeta?.picture} alt={ownerName} className="object-cover" />
          <AvatarFallback className="bg-neutral-800 text-2xl text-white">
            {ownerName.slice(0, 1)}
          </AvatarFallback>
        </Avatar>

        {/* Editable hero text, vertically centred to the right of the avatar —
            same placement as the old baked-in text: quote from x≈40.5% with its
            green opening quote mark hanging left, by-line right-aligned under
            the quote's right edge (x≈83.6%). */}
        <figure
          className="absolute -translate-y-1/2 text-left"
          style={{ top: '50%', left: '40.5%', right: '16.4%' }}
        >
          <blockquote
            className="relative font-banner-quote font-bold italic text-white drop-shadow-lg"
            style={{
              fontSize: 'clamp(0.85rem, 2.2cqw, 2rem)',
              lineHeight: 1.35,
            }}
          >
            <span
              aria-hidden="true"
              className="absolute font-banner-quote leading-none text-robotechy-green"
              style={{
                left: 'clamp(-2.6rem, -3.9cqw, -1.1rem)',
                top: '-0.12em',
                fontSize: 'clamp(1.7rem, 4.3cqw, 3.9rem)',
              }}
            >
              &ldquo;
            </span>
            {/* Explicit breaks reproduce the original three-line split on wider
                screens; on narrow/mobile they collapse so the text wraps naturally
                and stays clear of the avatar. */}
            Welcome to my Bitcoin store, where I <br className="hidden md:block" />
            sell items printed on my 3D printer for … <br className="hidden md:block" />
            well, Bitcoin of course!
          </blockquote>
          {/* By-line in the subset Japanese Robot Italic display font. DOM text is
              mixed-case for accessibility/selection; CSS uppercases it to hit the
              subset glyphs (I S A C W E K). Name only — no age. */}
          <figcaption
            className="text-right font-banner-name italic uppercase tracking-wide text-robotechy-green drop-shadow-lg"
            style={{
              marginTop: 'clamp(0.4rem, 1.1cqw, 1rem)',
              fontSize: 'clamp(1rem, 2.95cqw, 2.7rem)',
            }}
          >
            Isaac Weeks
          </figcaption>
        </figure>

        {/* Padding sets the hero height — the same band as the previous banner. */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 md:py-48" />
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-neutral-950 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-sage-400" />
              <Input
                type="search"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white dark:bg-neutral-850 border-slate-200 dark:border-slate-700 focus-visible:ring-robotechy-green-dark"
              />
            </div>

            <Select
              value={selectedCollection || 'all'}
              onValueChange={(value) => handleCollectionClick(value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-full md:w-[200px] bg-white dark:bg-neutral-850 border-slate-200 dark:border-slate-700 focus:ring-robotechy-green-dark">
                <SelectValue placeholder="All Products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {collections?.map((collection) => {
                  const collectionId = collection.tags.find(([name]) => name === 'd')?.[1];
                  const title = collection.tags.find(([name]) => name === 'title')?.[1];
                  if (!collectionId || !title) return null;
                  return (
                    <SelectItem key={collectionId} value={collectionId}>
                      {title}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="bg-slate-50 dark:bg-neutral-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-square w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                </Card>
              ))}
            </div>
          ) : filteredProducts && filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} event={product} />
              ))}
            </div>
          ) : (
            <Card className="border-dashed border-slate-300 dark:border-slate-700">
              <CardContent className="py-16 px-8 text-center">
                <div className="max-w-md mx-auto space-y-4">
                  <div className="mx-auto w-16 h-16 bg-slate-100 dark:bg-neutral-850 rounded-full flex items-center justify-center">
                    <ShoppingCart className="h-8 w-8 text-sage-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">
                      No products found
                    </h3>
                    <p className="text-sage-600 dark:text-sage-400">
                      {searchQuery || selectedCollection
                        ? 'Try adjusting your filters or search query'
                        : 'Check back soon for new products'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* With Thanks Section */}
      <section className="bg-slate-100 dark:bg-neutral-850 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-xl font-semibold text-sage-700 dark:text-sage-300 mb-8">
            WITH THANKS TO:
          </h2>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
            <a
              href="https://www.thingiverse.com"
              target="_blank"
              rel="noopener noreferrer"
              className="grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all"
            >
              <img
                src="/images/thingiverse.png"
                alt="Thingiverse"
                className="h-16 w-auto object-contain"
              />
            </a>
            <a
              href="https://specter.solutions/"
              target="_blank"
              rel="noopener noreferrer"
              className="grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all"
            >
              <img
                src="/images/specter-solutions.jpg"
                alt="Specter Solutions"
                className="h-16 w-auto object-contain"
              />
            </a>
            <a
              href="https://blockmit.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all"
            >
              <img
                src="/images/blockmit.png"
                alt="BlockMit"
                className="h-16 w-auto object-contain"
              />
            </a>
            <a
              href="https://seedsigner.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all"
            >
              <img
                src="/images/seedsigner.png"
                alt="SeedSigner"
                className="h-16 w-auto object-contain"
              />
            </a>
          </div>
        </div>
      </section>

      <Footer selectedCollection={selectedCollection} onCollectionClick={handleCollectionClick} />
    </div>
  );
};

export default Index;
