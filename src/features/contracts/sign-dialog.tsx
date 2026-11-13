import { useState } from "react";
import { LoaderCircle, PenLine } from "lucide-react";
import { toast } from "sonner";
import type { ContractDetail } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/features/auth/api";
import { errorMessage } from "@/lib/api";
import { celebrate } from "@/lib/confetti";
import { useCounterSign } from "./api";
import { SignatureInput, type SignatureValue } from "./signature-input";

interface SignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: ContractDetail;
}

function SignForm({ contract, onOpenChange }: Omit<SignDialogProps, "open">) {
  const { user } = useSession();
  const sign = useCounterSign(contract.id);
  const [name, setName] = useState(user.name);
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [agree, setAgree] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const nameValid = name.trim().length >= 2;

  const submit = () => {
    if (!nameValid || !signature || !agree) return setShowErrors(true);
    sign.mutate(
      { name: name.trim(), method: signature.method, signature: signature.image, agree: true },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success("Contract signed by both parties");
          void celebrate();
        },
        onError: (error) => toast.error(errorMessage(error, "Could not sign the contract.")),
      },
    );
  };

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="agency-signer-name">Your full name</Label>
        <Input id="agency-signer-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="name" aria-invalid={showErrors && !nameValid} />
        {showErrors && !nameValid && <p className="text-[13px] text-destructive">Enter your full name</p>}
      </div>
      <div className="grid gap-2">
        <Label>Signature</Label>
        <SignatureInput name={name} onChange={setSignature} invalid={showErrors && !signature} />
        {showErrors && !signature && <p className="text-[13px] text-destructive">Add your signature</p>}
      </div>
      <div>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={agree} onCheckedChange={(checked) => setAgree(checked === true)} className="mt-0.5" aria-invalid={showErrors && !agree} />
          <span>
            I am authorised to sign for <span className="font-medium">{contract.agency.name}</span> and I agree to this contract.
          </span>
        </label>
        {showErrors && !agree && <p className="mt-1.5 pl-[30px] text-[13px] text-destructive">Please tick the box to confirm</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={sign.isPending}>
          {sign.isPending ? <LoaderCircle className="animate-spin" /> : <PenLine />} Sign and complete
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The agency's counter-signature – the step that completes a contract the client has already signed. */
export function SignDialog({ open, onOpenChange, contract }: SignDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Counter-sign “{contract.title}”</DialogTitle>
          <DialogDescription>{contract.client.name} has signed. Add your signature to complete the contract – it can't be changed afterwards.</DialogDescription>
        </DialogHeader>
        {open && <SignForm contract={contract} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}
