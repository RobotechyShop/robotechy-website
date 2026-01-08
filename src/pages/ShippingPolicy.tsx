import { useSeoMeta } from '@unhead/react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ContactDialog } from '@/components/ContactDialog';

const ShippingPolicy = () => {
  useSeoMeta({
    title: 'Shipping Policy | Robotechy',
    description: 'Shipping policy for Robotechy - All orders printed and shipped within 7 days.',
  });

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <Header />

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold mb-8 text-slate-900 dark:text-white">Shipping Policy</h1>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <p className="text-lg">
            All orders are printed on receipt. We aim to print and then ship your order within 7 days.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Shipping Zones</h2>
          <p>We currently ship to the following regions:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>United Kingdom</strong> - Free shipping</li>
            <li><strong>Europe</strong> - Shipping charges apply</li>
            <li><strong>Worldwide</strong> - Shipping charges apply</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Processing Time</h2>
          <p>
            As our products are 3D printed to order, please allow up to 7 days for your order to be
            printed and dispatched. Custom orders may take longer depending on complexity.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Delivery Times</h2>
          <p>
            Once dispatched, delivery times depend on your location and the shipping method selected
            at checkout. Tracking information will be provided where available.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Contact</h2>
          <p>
            If you have any questions about shipping, please{' '}
            <ContactDialog
              trigger={
                <button className="text-robotechy-blue hover:underline inline">
                  contact us
                </button>
              }
            />
            .
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ShippingPolicy;
