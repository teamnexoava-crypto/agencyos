import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import type { InvoiceDetail } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { whatsappUrl } from "@/lib/whatsapp";
import { reminderMessage, reminderSubject } from "./reminder";

interface ReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceDetail;
}

function ReminderBody({ invoice }: Pick<ReminderDialogProps, "invoice">) {
  // Written once when the dialog opens, then it's the user's to edit for this client.
  const [message, setMessage] = useState(() => reminderMessage(invoice));
  const email = invoice.to.email;
  const mailHref = email ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(reminderSubject(invoice))}&body=${encodeURIComponent(message)}` : null;

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="reminder-message">Message</Label>
        <Textarea id="reminder-message" rows={8} value={message} onChange={(event) => setMessage(event.target.value)} />
        <p className="text-[13px] text-muted-foreground">Edit it if you like – the amount, due date and payment link are already included.</p>
      </div>

      <div className={mailHref ? "grid gap-2 sm:grid-cols-2" : "grid gap-2"}>
        <Button asChild className="bg-[#25D366] text-white hover:bg-[#1fb957]">
          {/* A real link (not window.open) so mobile browsers hand it straight to WhatsApp. */}
          <a href={whatsappUrl(invoice.clientWhatsapp, message)} target="_blank" rel="noopener noreferrer">
            <MessageCircle /> {invoice.clientWhatsapp ? "Send on WhatsApp" : "Open WhatsApp"}
          </a>
        </Button>
        {mailHref && (
          <Button asChild variant="outline">
            <a href={mailHref}>
              <Mail /> Send by email
            </a>
          </Button>
        )}
      </div>
      {(!invoice.clientWhatsapp || !email) && (
        <div className="-mt-2 grid gap-1 text-[13px] text-muted-foreground">
          {!invoice.clientWhatsapp && <p>No WhatsApp number saved for this client – you'll pick the chat in WhatsApp.</p>}
          {!email && <p>Add an email address to this client to send reminders by email too.</p>}
        </div>
      )}
    </div>
  );
}

/** Pre-written, editable payment reminder for an unpaid invoice, sent from the user's own WhatsApp or email. */
export function ReminderDialog({ open, onOpenChange, invoice }: ReminderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a payment reminder</DialogTitle>
          <DialogDescription>
            Nudge {invoice.to.name} about invoice {invoice.number}.
          </DialogDescription>
        </DialogHeader>
        {open && <ReminderBody invoice={invoice} />}
      </DialogContent>
    </Dialog>
  );
}
