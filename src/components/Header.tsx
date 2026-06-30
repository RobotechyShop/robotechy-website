import { Home, BookOpen, Mail, ShoppingCart, Sun, Moon, Monitor } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { useTheme } from '@/hooks/useTheme';
import { useMessagesDrawer } from '@/hooks/useMessagesDrawer';
import type { Theme } from '@/contexts/AppContext';
import { nip19 } from 'nostr-tools';

// True only when VITE_MERCHANT_NPUB actually decodes as an npub. An invalid value
// falls back to the production merchant (see useProducts), so it must NOT light
// the TEST badge — otherwise the badge would falsely signal a non-live shop.
function isValidNpub(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return nip19.decode(value).type === 'npub';
  } catch {
    return false;
  }
}

// Test-mode flag: explicit VITE_TEST_MODE, or a valid VITE_MERCHANT_NPUB override
// (e.g. via .env.test). Drives the "TEST" badge so it's obvious you're not live.
const TEST_MODE =
  import.meta.env.VITE_TEST_MODE === 'true' || isValidNpub(import.meta.env.VITE_MERCHANT_NPUB);

export function Header() {
  const { theme, setTheme } = useTheme();
  const { openMessages } = useMessagesDrawer();

  const cycleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun;

  return (
    <header className="border-b bg-white dark:bg-neutral-900 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2">
              <img
                src="/images/robotechy-logo-300x300.png"
                alt="Robotechy"
                className="h-8 object-contain"
              />
            </a>
            {TEST_MODE && (
              <span className="rounded bg-fuchsia-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                TEST
              </span>
            )}
          </div>
          <nav className="flex items-center gap-2 text-sm font-medium">
            <a
              href="/"
              className="p-2 text-sage-700 hover:text-robotechy-green-dark dark:text-sage-300 dark:hover:text-robotechy-green-dark transition-colors"
              title="Home"
            >
              <Home className="h-5 w-5" />
            </a>
            <a
              href="/story"
              className="p-2 text-sage-700 hover:text-robotechy-green-dark dark:text-sage-300 dark:hover:text-robotechy-green-dark transition-colors"
              title="Story"
              aria-label="Story"
            >
              <BookOpen className="h-5 w-5" />
            </a>
            <button
              type="button"
              onClick={() => openMessages()}
              className="p-2 text-sage-700 hover:text-robotechy-green-dark dark:text-sage-300 dark:hover:text-robotechy-green-dark transition-colors"
              title="Messages"
              aria-label="Messages"
            >
              <Mail className="h-5 w-5" />
            </button>
            <button
              className="p-2 text-sage-700 hover:text-robotechy-green-dark dark:text-sage-300 dark:hover:text-robotechy-green-dark transition-colors"
              title="Cart"
            >
              <ShoppingCart className="h-5 w-5" />
            </button>
            <button
              onClick={cycleTheme}
              className="p-2 text-sage-700 hover:text-robotechy-green-dark dark:text-sage-300 dark:hover:text-robotechy-green-dark transition-colors"
              title={`Theme: ${theme}`}
            >
              <ThemeIcon className="h-5 w-5" />
            </button>
            <LoginArea className="max-w-60" />
          </nav>
        </div>
      </div>
    </header>
  );
}
