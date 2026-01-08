import { useCollections } from '@/hooks/useProducts';

interface FooterProps {
  selectedCollection?: string | null;
  onCollectionClick?: (collectionId: string | null) => void;
}

export function Footer({ selectedCollection, onCollectionClick }: FooterProps) {
  const { data: collections } = useCollections();

  const handleCollectionClick = (collectionId: string | null) => {
    if (onCollectionClick) {
      onCollectionClick(collectionId);
    } else {
      // Navigate to homepage - collections will filter there
      window.location.href = '/';
    }
  };

  return (
    <footer className="border-t bg-slate-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <h4 className="font-semibold mb-3 text-slate-900 dark:text-white">About Me</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mb-4">
              Hi, I'm Isaac! I'm 17 and I run Robotechy with a little help from my{' '}
              <a
                href="https://njump.me/npub1jutptdc2m8kgjmudtws095qk2tcale0eemvp4j2xnjnl4nh6669slrf04x"
                target="_blank"
                rel="noopener noreferrer"
                className="text-robotechy-blue hover:underline"
              >
                dad
              </a>{' '}
              and my{' '}
              <a
                href="https://njump.me/npub1sfpeyr9k5jms37q4900mw9q4vze4xwhdxd4avdxjml8rqgjkre8s4lcq9l"
                target="_blank"
                rel="noopener noreferrer"
                className="text-robotechy-blue hover:underline"
              >
                sister
              </a>
              . I'm currently studying at college, where I'm pursuing my interest in engineering and
              CAD design. I love 3D printing and building things for the Bitcoin community!
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-slate-900 dark:text-white">Shop</h4>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>
                <button
                  onClick={() => handleCollectionClick(null)}
                  className={`hover:text-robotechy-blue transition-colors ${!selectedCollection && onCollectionClick ? 'text-robotechy-blue font-medium' : ''}`}
                >
                  All Products
                </button>
              </li>
              {collections?.map((collection) => {
                const d = collection.tags.find(([name]) => name === 'd')?.[1];
                const title = collection.tags.find(([name]) => name === 'title')?.[1];
                if (!d || !title) return null;
                return (
                  <li key={d}>
                    <button
                      onClick={() => handleCollectionClick(d)}
                      className={`hover:text-robotechy-blue transition-colors ${selectedCollection === d ? 'text-robotechy-blue font-medium' : ''}`}
                    >
                      {title}
                    </button>
                  </li>
                );
              })}
              <li>
                <a href="/custom-3d-prints" className="hover:text-robotechy-blue transition-colors">
                  Custom 3D Prints
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-slate-900 dark:text-white">Policies</h4>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>
                <a href="/shipping-policy" className="hover:text-robotechy-blue transition-colors">
                  Shipping
                </a>
              </li>
              <li>
                <a href="/refund-policy" className="hover:text-robotechy-blue transition-colors">
                  Refunds
                </a>
              </li>
              <li>
                <a href="/privacy-policy" className="hover:text-robotechy-blue transition-colors">
                  Privacy
                </a>
              </li>
              <li>
                <a href="/terms-of-service" className="hover:text-robotechy-blue transition-colors">
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>
        </div>
        {/* Social Links */}
        <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-center gap-6">
          <a
            href="https://njump.me/npub1yvhvefvam4sdz7pftrjtzj7uqantzpugmqkk7emf3v95rknxm45qhq7l3u"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-robotechy-blue transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 256 256" fill="currentColor">
              <path d="M128,0C57.308,0,0,57.308,0,128s57.308,128,128,128,128-57.308,128-128S198.692,0,128,0Zm56.414,181.707-13.328-5.332a15.5,15.5,0,0,0-11.516.165l-11.833,5.063a31.124,31.124,0,0,1-24.3-.044l-11.656-4.993a15.523,15.523,0,0,0-11.528-.165l-13.328,5.332a7.5,7.5,0,0,1-10.088-3.889l-25.6-64a7.5,7.5,0,0,1,3.889-10.088l13.328-5.332a15.523,15.523,0,0,0,9.03-9.03l5.332-13.328a7.5,7.5,0,0,1,10.088-3.889l64,25.6a7.5,7.5,0,0,1,3.889,10.088l-5.332,13.328a15.523,15.523,0,0,0,.165,11.528l4.993,11.656a31.124,31.124,0,0,1,.044,24.3l-5.063,11.833a15.5,15.5,0,0,0-.165,11.516l5.332,13.328A7.5,7.5,0,0,1,184.414,181.707Z" />
            </svg>
            <span className="text-sm">Nostr</span>
          </a>
          <a
            href="https://www.youtube.com/channel/UCCZd50h25dZr27IILBVJmpg"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-red-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
            <span className="text-sm">YouTube</span>
          </a>
          <a
            href="https://x.com/IsaacWeeks"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-black dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span className="text-sm">Twitter</span>
          </a>
          <a
            href="https://github.com/RobotechyShop"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span className="text-sm">GitHub</span>
          </a>
        </div>
        <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800 text-center text-sm text-slate-600 dark:text-slate-400">
          <p>
            Powered by{' '}
            <a
              href="https://nostr.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-robotechy-blue hover:underline"
            >
              Nostr
            </a>{' '}
            · NIP-99 Marketplace (Gamma Markets) ·{' '}
            <a
              href="https://soapbox.pub/mkstack"
              target="_blank"
              rel="noopener noreferrer"
              className="text-robotechy-blue hover:text-robotechy-orange transition-colors"
            >
              Vibed with MKStack
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
