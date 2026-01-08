import { useSeoMeta } from '@unhead/react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ContactDialog } from '@/components/ContactDialog';

const PrivacyPolicy = () => {
  useSeoMeta({
    title: 'Privacy Policy | Robotechy',
    description:
      'Privacy Policy for Robotechy - how we collect, use, and protect your personal information.',
  });

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <Header />

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold mb-8 text-slate-900 dark:text-white">Privacy Policy</h1>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <p>
            This Privacy Policy describes how robotechy.com (the "Site" or "we") collects, uses, and
            discloses your Personal Information when you visit or make a purchase from the Site.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Collecting Personal Information</h2>
          <p>
            When you visit the Site, we collect certain information about your device, your
            interaction with the Site, and information necessary to process your purchases. We may
            also collect additional information if you contact us for customer support. In this
            Privacy Policy, we refer to any information that can uniquely identify an individual
            (including the information below) as "Personal Information".
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-3">Device Information</h3>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Examples of Personal Information collected:</strong> version of web browser,
              IP address, time zone, cookie information, what sites or products you view, search
              terms, and how you interact with the Site.
            </li>
            <li>
              <strong>Purpose of collection:</strong> to load the Site accurately for you, and to
              perform analytics on Site usage to optimize our Site.
            </li>
            <li>
              <strong>Source of collection:</strong> Collected automatically when you access our
              Site using cookies, log files, web beacons, tags, or pixels.
            </li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3">Order Information</h3>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Examples of Personal Information collected:</strong> name, billing address,
              shipping address, payment information (including credit card numbers), email address,
              and phone number.
            </li>
            <li>
              <strong>Purpose of collection:</strong> to provide products or services to you to
              fulfill our contract, to process your payment information, arrange for shipping, and
              provide you with invoices and/or order confirmations, communicate with you, screen our
              orders for potential risk or fraud, and when in line with the preferences you have
              shared with us, provide you with information or advertising relating to our products
              or services.
            </li>
            <li>
              <strong>Source of collection:</strong> collected from you.
            </li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3">Customer Support Information</h3>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Examples of Personal Information collected:</strong> Name and e-mail address.
            </li>
            <li>
              <strong>Purpose of collection:</strong> to provide customer support.
            </li>
            <li>
              <strong>Source of collection:</strong> collected from you.
            </li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3">Minors</h3>
          <p>
            We do not intentionally collect Personal Information from children. If you are the
            parent or guardian and believe your child has provided us with Personal Information,
            please contact us at the address below to request deletion.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Sharing Personal Information</h2>
          <p>
            We share your Personal Information with service providers to help us provide our
            services and fulfill our contracts with you, as described above. For example:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              We may share your Personal Information to comply with applicable laws and regulations,
              to respond to a subpoena, search warrant or other lawful request for information we
              receive, or to otherwise protect our rights.
            </li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3">Behavioural Advertising</h3>
          <p>
            As described above, we use your Personal Information to provide you with targeted
            advertisements or marketing communications we believe may be of interest to you. For
            example:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              We use Google Analytics to help us understand how our customers use the Site. You can
              read more about how Google uses your Personal Information here:{' '}
              <a
                href="https://policies.google.com/privacy?hl=en"
                target="_blank"
                rel="noopener noreferrer"
                className="text-robotechy-blue hover:underline"
              >
                https://policies.google.com/privacy?hl=en
              </a>
              . You can also opt-out of Google Analytics here:{' '}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                target="_blank"
                rel="noopener noreferrer"
                className="text-robotechy-blue hover:underline"
              >
                https://tools.google.com/dlpage/gaoptout
              </a>
              .
            </li>
          </ul>
          <p>
            For more information about how targeted advertising works, you can visit the Network
            Advertising Initiative's ("NAI") educational page at{' '}
            <a
              href="http://www.networkadvertising.org/understanding-online-advertising/how-does-it-work"
              target="_blank"
              rel="noopener noreferrer"
              className="text-robotechy-blue hover:underline"
            >
              http://www.networkadvertising.org/understanding-online-advertising/how-does-it-work
            </a>
            .
          </p>
          <p>You can opt-out of targeted advertising by:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              GOOGLE -{' '}
              <a
                href="https://www.google.com/settings/ads/anonymous"
                target="_blank"
                rel="noopener noreferrer"
                className="text-robotechy-blue hover:underline"
              >
                https://www.google.com/settings/ads/anonymous
              </a>
            </li>
          </ul>
          <p>
            Additionally, you can opt out of some of these services by visiting the Digital
            Advertising Alliance's opt-out portal at:{' '}
            <a
              href="http://optout.aboutads.info/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-robotechy-blue hover:underline"
            >
              http://optout.aboutads.info/
            </a>
            .
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Using Personal Information</h2>
          <p>
            We use your personal information to provide our services to you, which includes:
            offering products for sale, processing payments, shipping and fulfillment of your order,
            and keeping you up to date on new products, services, and offers.
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-3">Lawful Basis</h3>
          <p>
            Pursuant to the General Data Protection Regulation ("GDPR"), if you are a resident of
            the European Economic Area ("EEA"), we process your personal information under the
            following lawful bases:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Your consent;</li>
            <li>The performance of the contract between you and the Site;</li>
            <li>Compliance with our legal obligations;</li>
            <li>To protect your vital interests;</li>
            <li>To perform a task carried out in the public interest;</li>
            <li>
              For our legitimate interests, which do not override your fundamental rights and
              freedoms.
            </li>
          </ul>

          <h3 className="text-xl font-semibold mt-6 mb-3">Retention</h3>
          <p>
            When you place an order through the Site, we will retain your Personal Information for
            our records unless and until you ask us to erase this information. For more information
            on your right of erasure, please see the 'Your rights' section below.
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-3">Automatic Decision-Making</h3>
          <p>
            If you are a resident of the EEA, you have the right to object to processing based
            solely on automated decision-making (which includes profiling), when that
            decision-making has a legal effect on you or otherwise significantly affects you.
          </p>
          <p>Services that include elements of automated decision-making include:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Temporary denylist of IP addresses associated with repeated failed transactions. This
              denylist persists for a small number of hours.
            </li>
            <li>
              Temporary denylist of credit cards associated with denylisted IP addresses. This
              denylist persists for a small number of days.
            </li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Your Rights</h2>
          <h3 className="text-xl font-semibold mt-6 mb-3">GDPR</h3>
          <p>
            If you are a resident of the EEA, you have the right to access the Personal Information
            we hold about you, to port it to a new service, and to ask that your Personal
            Information be corrected, updated, or erased. If you would like to exercise these
            rights, please contact us through the contact information below.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Cookies</h2>
          <p>
            A cookie is a small amount of information that's downloaded to your computer or device
            when you visit our Site. We use a number of different cookies, including functional,
            performance, advertising, and social media or content cookies. Cookies make your
            browsing experience better by allowing the website to remember your actions and
            preferences (such as login and region selection). This means you don't have to re-enter
            this information each time you return to the site or browse from one page to another.
            Cookies also provide information on how people use the website, for instance whether
            it's their first time visiting or if they are a frequent visitor.
          </p>
          <p>
            The length of time that a cookie remains on your computer or mobile device depends on
            whether it is a "persistent" or "session" cookie. Session cookies last until you stop
            browsing and persistent cookies last until they expire or are deleted. Most of the
            cookies we use are persistent and will expire between 30 minutes and two years from the
            date they are downloaded to your device.
          </p>
          <p>
            You can control and manage cookies in various ways. Please keep in mind that removing or
            blocking cookies can negatively impact your user experience and parts of our website may
            no longer be fully accessible.
          </p>
          <p>
            Most browsers automatically accept cookies, but you can choose whether or not to accept
            cookies through your browser controls, often found in your browser's "Tools" or
            "Preferences" menu. For more information on how to modify your browser settings or how
            to block, manage or filter cookies can be found in your browser's help file or through
            such sites as{' '}
            <a
              href="https://www.allaboutcookies.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-robotechy-blue hover:underline"
            >
              www.allaboutcookies.org
            </a>
            .
          </p>

          <h3 className="text-xl font-semibold mt-6 mb-3">Do Not Track</h3>
          <p>
            Please note that because there is no consistent industry understanding of how to respond
            to "Do Not Track" signals, we do not alter our data collection and usage practices when
            we detect such a signal from your browser.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Changes</h2>
          <p>
            We may update this Privacy Policy from time to time in order to reflect, for example,
            changes to our practices or for other operational, legal, or regulatory reasons.
          </p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Contact</h2>
          <p>
            For more information about our privacy practices, if you have questions, or if you would
            like to make a complaint, please{' '}
            <ContactDialog
              trigger={
                <button className="text-robotechy-blue hover:underline inline">contact us</button>
              }
            />
            .
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-4">
            Last updated: 1st January 2022
          </p>
          <p>
            If you are not satisfied with our response to your complaint, you have the right to
            lodge your complaint with the relevant data protection authority. You can contact your
            local data protection authority, or our supervisory authority.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
