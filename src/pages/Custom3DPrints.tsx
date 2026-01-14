import { useState, useContext } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Printer, LogIn } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { DMContext } from '@/contexts/DMContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { MERCHANT_PUBKEY } from '@/hooks/useProducts';
import { MESSAGE_PROTOCOL } from '@/lib/dmConstants';
import LoginDialog from '@/components/auth/LoginDialog';
import { useToast } from '@/hooks/useToast';

const contactSchema = z.object({
  message: z.string().min(10, 'Please provide details about your custom print request'),
});

type ContactFormData = z.infer<typeof contactSchema>;

const Custom3DPrints = () => {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  const { user } = useCurrentUser();
  const dmContext = useContext(DMContext);
  const sendMessage = dmContext?.sendMessage;
  const { toast } = useToast();

  useSeoMeta({
    title: 'Custom 3D Prints | Robotechy',
    description:
      'Request custom 3D prints from Robotechy. Wide range of materials including PLA, PETG, ABS, Nylon, and more.',
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    mode: 'onChange',
  });

  const onSubmit = async (data: ContactFormData) => {
    if (!user || !sendMessage) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await sendMessage({
        recipientPubkey: MERCHANT_PUBKEY,
        content: `Custom 3D Print Request:\n\n${data.message}`,
        protocol: MESSAGE_PROTOCOL.NIP04,
      });
      setIsSubmitted(true);
      toast({
        title: 'Message sent',
        description: 'Your custom print request has been sent.',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      toast({
        title: 'Failed to send message',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const specs = [
    { label: 'Build Volume', value: '25×21×21 cm (9.84"×8.3"×8.3")' },
    { label: 'Layer Height', value: '0.05 - 0.35 mm' },
    { label: 'Nozzle', value: '0.4mm default, wide range of other diameters/nozzles supported' },
    { label: 'Filament Diameter', value: '1.75 mm' },
  ];

  const materials = [
    'PLA',
    'PETG',
    'ASA',
    'ABS',
    'PC (Polycarbonate)',
    'CPE',
    'PVA/BVOH',
    'PVB',
    'HIPS',
    'PP (Polypropylene)',
    'Flex',
    'nGen',
    'Nylon',
    'Carbon filled',
    'Woodfill',
    'Other filled materials',
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <Header />

      {/* Hero Section */}
      <div className="bg-gradient-to-b from-slate-100 to-white dark:from-slate-900 dark:to-slate-950 py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-robotechy-green-dark/10 rounded-full mb-6">
            <Printer className="w-8 h-8 text-robotechy-green-dark" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
            Custom 3D Prints
          </h1>
          <p className="text-lg text-sage-600 dark:text-sage-400 max-w-2xl mx-auto">
            Have a design in mind? Found something on{' '}
            <a
              href="https://www.thingiverse.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-robotechy-green-dark hover:underline"
            >
              Thingiverse
            </a>
            ? Get in touch and we'll bring your ideas to life with our professional 3D printing
            services.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Specifications */}
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                Technical Specifications
              </h2>
              <div className="space-y-4">
                {specs.map((spec) => (
                  <div
                    key={spec.label}
                    className="flex flex-col sm:flex-row sm:items-start gap-2 p-4 bg-slate-50 dark:bg-neutral-850/50 rounded-lg"
                  >
                    <span className="font-medium text-sage-700 dark:text-sage-300 sm:w-40 shrink-0">
                      {spec.label}:
                    </span>
                    <span className="text-sage-600 dark:text-sage-400">{spec.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
                Supported Materials
              </h2>
              <div className="flex flex-wrap gap-2">
                {materials.map((material) => (
                  <span
                    key={material}
                    className="px-3 py-1.5 bg-robotechy-green-dark/10 text-robotechy-green-dark text-sm rounded-full"
                  >
                    {material}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-6">
              Request a Quote
            </h2>

            {!user ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <LogIn className="w-12 h-12 text-sage-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                    Sign in to send a request
                  </h3>
                  <p className="text-sage-600 dark:text-sage-400 text-sm mb-4">
                    Log in with your Nostr account to send us an encrypted message.
                  </p>
                  <Button
                    className="bg-robotechy-green hover:brightness-110 text-black font-semibold"
                    onClick={() => setShowLoginDialog(true)}
                  >
                    Sign In
                  </Button>
                  <LoginDialog
                    isOpen={showLoginDialog}
                    onClose={() => setShowLoginDialog(false)}
                    onLogin={() => setShowLoginDialog(false)}
                  />
                </CardContent>
              </Card>
            ) : isSubmitted ? (
              <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                <CardContent className="py-12 text-center">
                  <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-green-800 dark:text-green-200 mb-2">
                    Message Sent!
                  </h3>
                  <p className="text-green-700 dark:text-green-300">
                    Thank you for your inquiry. We'll respond via Nostr DM as soon as possible.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="message">Message</Label>
                      <Textarea
                        id="message"
                        placeholder="Describe your custom print request. Include links to designs, material preferences, quantity needed, and any other details..."
                        {...register('message')}
                        className={errors.message ? 'border-destructive' : ''}
                        rows={6}
                      />
                      {errors.message && (
                        <p className="text-sm text-destructive">{errors.message.message}</p>
                      )}
                    </div>

                    {error && <p className="text-sm text-destructive text-center">{error}</p>}

                    <Button
                      type="submit"
                      className="w-full bg-robotechy-green hover:brightness-110 text-black font-semibold"
                      disabled={isSubmitting || !isValid || !sendMessage}
                    >
                      {isSubmitting ? 'Sending...' : 'Send Message'}
                    </Button>

                    <p className="text-xs text-sage-500 dark:text-sage-400 text-center">
                      Your message will be sent as an encrypted Nostr DM.
                    </p>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Custom3DPrints;
