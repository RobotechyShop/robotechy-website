import { useState, useContext } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle, Mail, LogIn } from 'lucide-react';
import { DMContext } from '@/contexts/DMContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { MERCHANT_PUBKEY } from '@/hooks/useProducts';
import { MESSAGE_PROTOCOL } from '@/lib/dmConstants';
import LoginDialog from '@/components/auth/LoginDialog';
import { useToast } from '@/hooks/useToast';

const contactSchema = z.object({
  message: z.string().min(10, 'Please provide more details'),
});

type ContactFormData = z.infer<typeof contactSchema>;

interface ContactDialogProps {
  trigger?: React.ReactNode;
}

export function ContactDialog({ trigger }: ContactDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  const { user } = useCurrentUser();
  const dmContext = useContext(DMContext);
  const sendMessage = dmContext?.sendMessage;
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
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
        content: data.message,
        protocol: MESSAGE_PROTOCOL.NIP04,
      });
      setIsSubmitted(true);
      toast({
        title: 'Message sent',
        description: 'Your message has been sent successfully.',
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

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setTimeout(() => {
        setIsSubmitted(false);
        setError(null);
        reset();
      }, 200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-700 hover:text-robotechy-blue dark:text-slate-300"
          >
            <Mail className="h-5 w-5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contact Us</DialogTitle>
          <DialogDescription>Send us a private message via Nostr.</DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="py-8 text-center">
            <LogIn className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              Sign in to send a message
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
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
          </div>
        ) : isSubmitted ? (
          <div className="py-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              Message Sent!
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Thank you for reaching out. We'll respond soon via Nostr DM.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact-message">Message</Label>
              <Textarea
                id="contact-message"
                placeholder="How can I help you?"
                {...register('message')}
                className={errors.message ? 'border-destructive' : ''}
                rows={4}
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

            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Your message will be sent as an encrypted Nostr DM.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
