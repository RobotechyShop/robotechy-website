import { useSeoMeta } from '@unhead/react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ContactDialog } from '@/components/ContactDialog';

const RefundPolicy = () => {
  useSeoMeta({
    title: 'Refund Policy | Robotechy',
    description:
      'Refund and return policy for Robotechy - 30-day return policy for eligible items.',
  });

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Header />

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold mb-8 text-slate-900 dark:text-white">Refund Policy</h1>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <p>
            We have a 30-day return policy, which means you have 30 days after receiving your item
            to request a return.
          </p>

          <p>
            To be eligible for a return, your item must be in the same condition that you received
            it, unworn or unused, with tags, and in its original packaging. You'll also need the
            receipt or proof of purchase.
          </p>

          <p>
            To start a return, you can{' '}
            <ContactDialog
              trigger={
                <button className="text-robotechy-green-dark hover:underline inline">
                  contact us
                </button>
              }
            />
            . If your return is accepted, we'll send you a return shipping label, as well as
            instructions on how and where to send your package. Items sent back to us without first
            requesting a return will not be accepted.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Damages and Issues</h2>
          <p>
            Please inspect your order upon reception and contact us immediately if the item is
            defective, damaged or if you receive the wrong item, so that we can evaluate the issue
            and make it right.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Exceptions / Non-Returnable Items</h2>
          <p>Certain types of items cannot be returned, like:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Perishable goods (such as food, flowers, or plants)</li>
            <li>Custom products (such as special orders or personalized items)</li>
            <li>Personal care goods (such as beauty products)</li>
            <li>Hazardous materials, flammable liquids, or gases</li>
            <li>Sale items</li>
            <li>Gift cards</li>
          </ul>
          <p>Please get in touch if you have questions or concerns about your specific item.</p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Exchanges</h2>
          <p>
            The fastest way to ensure you get what you want is to return the item you have, and once
            the return is accepted, make a separate purchase for the new item.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Refunds</h2>
          <p>
            We will notify you once we've received and inspected your return, and let you know if
            the refund was approved or not. If approved, you'll be automatically refunded on your
            original payment method. Please remember it can take some time for your bank or credit
            card company to process and post the refund too.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Contact</h2>
          <p>
            You can always{' '}
            <ContactDialog
              trigger={
                <button className="text-robotechy-green-dark hover:underline inline">
                  contact us
                </button>
              }
            />{' '}
            for any return questions.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default RefundPolicy;
