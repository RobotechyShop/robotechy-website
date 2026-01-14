import { useSeoMeta } from '@unhead/react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ContactDialog } from '@/components/ContactDialog';

const TermsOfService = () => {
  useSeoMeta({
    title: 'Terms of Service | Robotechy',
    description:
      'Terms of Service for Robotechy - Terms and conditions for using our website and services.',
  });

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Header />

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold mb-8 text-slate-900 dark:text-white">Terms of Service</h1>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <h2 className="text-2xl font-semibold mt-8 mb-4">Overview</h2>
          <p>
            This website is operated by Robotechy. Throughout the site, the terms "we", "us" and
            "our" refer to Robotechy. By visiting our site and/or purchasing something from us, you
            engage in our "Service" and agree to be bound by the following terms and conditions.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 1 - Online Store Terms</h2>
          <p>
            By agreeing to these Terms of Service, you represent that you are at least the age of
            majority in your state or province of residence.
          </p>
          <p>
            You may not use our products for any illegal or unauthorized purpose nor may you, in the
            use of the Service, violate any laws in your jurisdiction (including but not limited to
            copyright laws).
          </p>
          <p>
            You must not transmit any worms or viruses or any code of a destructive nature. A breach
            or violation of any of the Terms will result in an immediate termination of your
            Services.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 2 - General Conditions</h2>
          <p>We reserve the right to refuse service to anyone for any reason at any time.</p>
          <p>
            You understand that your content (not including credit card information), may be
            transferred unencrypted and involve (a) transmissions over various networks; and (b)
            changes to conform and adapt to technical requirements of connecting networks or
            devices. Credit card information is always encrypted during transfer over networks.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 3 - Accuracy of Information</h2>
          <p>
            We are not responsible if information made available on this site is not accurate,
            complete or current. The material on this site is provided for general information only
            and should not be relied upon or used as the sole basis for making decisions.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">
            Section 4 - Modifications to Service and Prices
          </h2>
          <p>
            Prices for our products are subject to change without notice. We reserve the right at
            any time to modify or discontinue the Service (or any part or content thereof) without
            notice at any time.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 5 - Products or Services</h2>
          <p>
            Certain products or services may be available exclusively online through the website.
            These products or services may have limited quantities and are subject to return or
            exchange only according to our Return Policy.
          </p>
          <p>
            We have made every effort to display as accurately as possible the colours and images of
            our products that appear at the store. We cannot guarantee that your computer monitor's
            display of any colour will be accurate.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 6 - Billing Information</h2>
          <p>
            We reserve the right to refuse any order you place with us. We may, in our sole
            discretion, limit or cancel quantities purchased per person, per household or per order.
          </p>
          <p>
            You agree to provide current, complete and accurate purchase and account information for
            all purchases made at our store.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 7 - Optional Tools</h2>
          <p>
            We may provide you with access to third-party tools over which we neither monitor nor
            have any control nor input. You acknowledge and agree that we provide access to such
            tools "as is" and "as available" without any warranties, representations or conditions
            of any kind.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 8 - Third-Party Links</h2>
          <p>
            Certain content, products and services available via our Service may include materials
            from third-parties. Third-party links on this site may direct you to third-party
            websites that are not affiliated with us. We are not responsible for examining or
            evaluating the content or accuracy.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">
            Section 9 - User Comments and Submissions
          </h2>
          <p>
            If you send certain specific submissions or creative ideas, suggestions, proposals,
            plans, or other materials, you agree that we may, at any time, without restriction,
            edit, copy, publish, distribute, translate and otherwise use in any medium any comments
            that you forward to us.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 10 - Personal Information</h2>
          <p>
            Your submission of personal information through the store is governed by our Privacy
            Policy. Please view our{' '}
            <a href="/privacy-policy" className="text-robotechy-green-dark hover:underline">
              Privacy Policy
            </a>
            .
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 11 - Errors and Omissions</h2>
          <p>
            Occasionally there may be information on our site or in the Service that contains
            typographical errors, inaccuracies or omissions that may relate to product descriptions,
            pricing, promotions, offers, product shipping charges, transit times and availability.
            We reserve the right to correct any errors, inaccuracies or omissions.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 12 - Prohibited Uses</h2>
          <p>
            In addition to other prohibitions as set forth in the Terms of Service, you are
            prohibited from using the site or its content: (a) for any unlawful purpose; (b) to
            solicit others to perform or participate in any unlawful acts; (c) to violate any
            international, federal, provincial or state regulations, rules, laws, or local
            ordinances; (d) to infringe upon or violate our intellectual property rights or the
            intellectual property rights of others; (e) to harass, abuse, insult, harm, defame,
            slander, disparage, intimidate, or discriminate; (f) to submit false or misleading
            information; (g) to upload or transmit viruses or any other type of malicious code.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">
            Section 13 - Disclaimer of Warranties
          </h2>
          <p>
            We do not guarantee, represent or warrant that your use of our service will be
            uninterrupted, timely, secure or error-free. We do not warrant that the results that may
            be obtained from the use of the service will be accurate or reliable.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 14 - Limitation of Liability</h2>
          <p>
            In no case shall Robotechy, our directors, officers, employees, affiliates, agents,
            contractors, interns, suppliers, service providers or licensors be liable for any
            injury, loss, claim, or any direct, indirect, incidental, punitive, special, or
            consequential damages of any kind.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 15 - Indemnification</h2>
          <p>
            You agree to indemnify, defend and hold harmless Robotechy and our parent, subsidiaries,
            affiliates, partners, officers, directors, agents, contractors, licensors, service
            providers, subcontractors, suppliers, interns and employees, harmless from any claim or
            demand.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 16 - Severability</h2>
          <p>
            In the event that any provision of these Terms of Service is determined to be unlawful,
            void or unenforceable, such provision shall nonetheless be enforceable to the fullest
            extent permitted by applicable law.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 17 - Termination</h2>
          <p>
            These Terms of Service are effective unless and until terminated by either you or us.
            You may terminate these Terms of Service at any time by notifying us that you no longer
            wish to use our Services.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 18 - Entire Agreement</h2>
          <p>
            These Terms of Service and any policies or operating rules posted by us on this site or
            in respect to The Service constitutes the entire agreement and understanding between you
            and us.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 19 - Governing Law</h2>
          <p>
            These Terms of Service and any separate agreements whereby we provide you Services shall
            be governed by and construed in accordance with the laws of the United Kingdom.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">
            Section 20 - Changes to Terms of Service
          </h2>
          <p>
            You can review the most current version of the Terms of Service at any time at this
            page. We reserve the right, at our sole discretion, to update, change or replace any
            part of these Terms of Service by posting updates and changes to our website.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Section 21 - Contact Information</h2>
          <p>
            Questions about the Terms of Service can be sent via our{' '}
            <ContactDialog
              trigger={
                <button className="text-robotechy-green-dark hover:underline inline">contact form</button>
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

export default TermsOfService;
