import { useState } from "react";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { renderInvoiceMessage } from "@shared/invoice";
import type { InvoiceDetail } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { copyToClipboard } from "@/lib/clipboard";
import { formatDate, formatMoney } from "@/lib/format";
import { whatsappUrl } from "@/lib/whatsapp";
import { invoiceUrl } from "./meta";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceDetail;
  /** Called when the invoice actually goes out, so a draft can be marked as sent. */
  onShared: () => void;
}

function ShareBody({ invoice, onShared }: Pick<ShareDialogProps, "invoice" | "onShared">) {
  const link = invoiceUrl(invoice.publicToken);
  const [message, setMessage] = useState(() =>
    renderInvoiceMessage(invoice.messageTemplate, {
      client_name: invoice.to.name,
      invoice_no: invoice.number,
      project: invoice.projectTitle ?? "your project",
      amount: formatMoney(invoice.total - invoice.amountPaid, invoice.currency),
      invoice_link: link,
      agency_name: invoice.from.name,
      due_date: formatDate(invoice.dueDate),
    }),
  );
  const mailHref = `mailto:${encodeURIComponent(invoice.to.email ?? "")}?subject=${encodeURIComponent(`Invoice ${invoice.number} from ${invoice.from.name}`)}&body=${encodeURIComponent(message)}`;

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="share-message">Message</Label>
        <Textarea id="share-message" rows={5} value={message} onChange={(event) => setMessage(event.target.value)} />
        <p className="text-[13px] text-muted-foreground">Edit it for this client if you like – the link is already included.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild className="bg-[#25D366] text-white hover:bg-[#1fb957]">
          {/* A real link (not window.open) so mobile browsers hand it straight to WhatsApp. */}
          <a href={whatsappUrl(invoice.clientWhatsapp, message)} target="_blank" rel="noopener noreferrer" onClick={onShared}>
            <MessageCircle /> {invoice.clientWhatsapp ? "Send on WhatsApp" : "Share on WhatsApp"}
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={mailHref} onClick={onShared}>
            <Mail /> Share via email
          </a>
        </Button>
      </div>
      {!invoice.clientWhatsapp && <p className="-mt-2 text-[13px] text-muted-foreground">No WhatsApp number saved for this client – you'll pick the chat in WhatsApp.</p>}

      <div className="grid gap-2">
        <Label htmlFor="share-link">Public link</Label>
        <div className="flex gap-2">
          <Input id="share-link" readOnly value={link} onFocus={(event) => event.target.select()} className="tabular sm:text-[13px]" />
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => {
              void copyToClipboard(link, "Invoice link copied");
              onShared();
            }}
          >
            <Copy /> Copy link
          </Button>
        </div>
        <p className="text-[13px] text-muted-foreground">Anyone with this link can view the invoice. You'll be notified when it's opened.</p>
      </div>
    </div>
  );
}

export function ShareDialog({ open, onOpenChange, invoice, onShared }: ShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share invoice {invoice.number}</DialogTitle>
          <DialogDescription>Send {invoice.to.name} a link to view and pay online.</DialogDescription>
        </DialogHeader>
        {open && <ShareBody invoice={invoice} onShared={onShared} />}
      </DialogContent>
    </Dialog>
  );
}
