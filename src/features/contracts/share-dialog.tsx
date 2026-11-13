import { useState } from "react";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { renderContractMessage } from "@shared/contract";
import type { ContractDetail } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { copyToClipboard } from "@/lib/clipboard";
import { whatsappUrl } from "@/lib/whatsapp";
import { contractUrl } from "./meta";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: ContractDetail;
}

function ShareBody({ contract }: { contract: ContractDetail }) {
  const link = contractUrl(contract.publicToken);
  const signed = contract.status === "completed";
  const [message, setMessage] = useState(() =>
    signed
      ? `Hi ${contract.client.name}, here is the signed copy of “${contract.title}” for your records: ${link}`
      : renderContractMessage(contract.messageTemplate, {
          client_name: contract.client.name,
          project: contract.projectTitle ?? contract.title,
          contract_link: link,
          agency_name: contract.agency.name,
        }),
  );
  const subject = signed ? `${contract.title} – signed copy` : `${contract.title} – please review and sign`;
  const mailHref = `mailto:${encodeURIComponent(contract.client.email ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="contract-share-message">Message</Label>
        <Textarea id="contract-share-message" rows={4} value={message} onChange={(event) => setMessage(event.target.value)} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild className="bg-[#25D366] text-white hover:bg-[#1fb957]">
          <a href={whatsappUrl(contract.clientWhatsapp, message)} target="_blank" rel="noopener noreferrer">
            <MessageCircle /> {contract.clientWhatsapp ? "Send on WhatsApp" : "Share on WhatsApp"}
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={mailHref}>
            <Mail /> Share via email
          </a>
        </Button>
      </div>
      {!contract.clientWhatsapp && <p className="-mt-2 text-[13px] text-muted-foreground">No WhatsApp number saved for this client – you'll pick the chat in WhatsApp.</p>}
      <div className="grid gap-2">
        <Label htmlFor="contract-share-link">{signed ? "Client link" : "Signing link"}</Label>
        <div className="flex gap-2">
          <Input id="contract-share-link" readOnly value={link} onFocus={(event) => event.target.select()} className="tabular text-[13px]" />
          <Button variant="outline" className="shrink-0" onClick={() => void copyToClipboard(link, "Link copied")}>
            <Copy /> Copy link
          </Button>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {signed
            ? "Anyone with this link can view and download the signed contract – send it only to your client."
            : "Anyone with this link can read and sign the contract – send it only to your client. You'll be notified when it's opened and signed."}
        </p>
      </div>
    </div>
  );
}

export function ShareDialog({ open, onOpenChange, contract }: ShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{contract.status === "completed" ? "Share the signed contract" : "Send for signature"}</DialogTitle>
          <DialogDescription>
            {contract.status === "completed"
              ? `Send ${contract.client.name} the link to view and download the signed copy.`
              : `Send ${contract.client.name} the link to read and sign “${contract.title}”.`}
          </DialogDescription>
        </DialogHeader>
        {open && <ShareBody contract={contract} />}
      </DialogContent>
    </Dialog>
  );
}
