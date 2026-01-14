import { Home, Mail, ShoppingCart, Sun, Moon, Monitor } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { ContactDialog } from '@/components/ContactDialog';
import { useTheme } from '@/hooks/useTheme';
import type { Theme } from '@/contexts/AppContext';

export function Header() {
  const { theme, setTheme } = useTheme();

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
          </div>
          <nav className="flex items-center gap-2 text-sm font-medium">
            <a
              href="/"
              className="p-2 text-sage-700 hover:text-robotechy-green-dark dark:text-sage-300 dark:hover:text-robotechy-green-dark transition-colors"
              title="Home"
            >
              <Home className="h-5 w-5" />
            </a>
            <ContactDialog
              trigger={
                <button
                  className="p-2 text-sage-700 hover:text-robotechy-green-dark dark:text-sage-300 dark:hover:text-robotechy-green-dark transition-colors"
                  title="Contact"
                >
                  <Mail className="h-5 w-5" />
                </button>
              }
            />
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
