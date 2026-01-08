import { Home, Mail, ShoppingCart } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { ContactDialog } from '@/components/ContactDialog';

export function Header() {
  return (
    <header className="border-b bg-white dark:bg-slate-900 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2">
              <img
                src="https://robotechy.com/cdn/shop/files/New_Robotechy_Logo_White_Background_300x300.png?v=1639256993"
                alt="Robotechy"
                className="h-8 object-contain"
              />
            </a>
          </div>
          <nav className="flex items-center gap-2 text-sm font-medium">
            <a
              href="/"
              className="p-2 text-slate-700 hover:text-robotechy-blue dark:text-slate-300 dark:hover:text-robotechy-blue transition-colors"
              title="Home"
            >
              <Home className="h-5 w-5" />
            </a>
            <ContactDialog
              trigger={
                <button
                  className="p-2 text-slate-700 hover:text-robotechy-blue dark:text-slate-300 dark:hover:text-robotechy-blue transition-colors"
                  title="Contact"
                >
                  <Mail className="h-5 w-5" />
                </button>
              }
            />
            <button
              className="p-2 text-slate-700 hover:text-robotechy-blue dark:text-slate-300 dark:hover:text-robotechy-blue transition-colors"
              title="Cart"
            >
              <ShoppingCart className="h-5 w-5" />
            </button>
            <LoginArea className="max-w-60" />
          </nav>
        </div>
      </div>
    </header>
  );
}
