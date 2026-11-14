import { useRef, useState } from "react";
import { motion } from "motion/react";
import { CircleCheckBig, Clock, FileX2, LoaderCircle, PenLine, Printer } from "lucide-react";
import { useParams } from "react-router";
import { toast } from "sonner";
import type { ContractDocument as ContractDocumentData } from "@shared/types";
import { BrandMark } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientSign, usePublicContract } from "@/features/contracts/api";
import { ContractDocument } from "@/features/contracts/contract-document";
import { SignatureInput, type SignatureValue } from "@/features/contracts/signature-input";
import { ApiError, errorMessage } from "@/lib/api";
import { celebrate } from "@/lib/confetti";
import { cn } from "@/lib/utils";

function Unavailable({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <FileX2 className="size-6" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SignPanel({ token, contract, onReload }: { token: string; contract: ContractDocumentData; onReload: () => void }) {
  const sign = useClientSign(token);
  const [name, setName] = useState(contract.client.name === "Client" ? "" : contract.client.name);
  const [email, setEmail] = useState("");
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [agree, setAgree] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const nameValid = name.trim().length >= 2;
  const emailValid = email.trim() === "" || EMAIL_PATTERN.test(email.trim());

  const submit = () => {
    if (!nameValid || !emailValid || !signature || !agree) return setShowErrors(true);
    sign.mutate(
      { name: name.trim(), email: email.trim(), method: signature.method, signature: signature.image, agree: true, contentHash: contract.contentHash },
      {
        onSuccess: () => {
          window.scrollTo({ top: 0, behavior: "smooth" });
          void celebrate();
        },
        onError: (error) => {
          toast.error(errorMessage(error, "Could not sign the contract. Please try again."));
          // Someone changed or signed it in the meantime: show what is there now.
          if (error instanceof ApiError && error.status === 409) onReload();
        },
      },
    );
  };

  return (
    <motion.section
      id="sign"
      aria-labelledby="sign-heading"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
      className="mt-6 scroll-mt-24 rounded-2xl border bg-card p-5 shadow-lift sm:p-8 print:hidden"
    >
      <h2 id="sign-heading" className="text-lg font-semibold tracking-tight">
        Sign this contract
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Read the agreement above, then sign below. It takes less than a minute.</p>

      <form
        className="mt-6 grid gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="signer-name">Full name</Label>
            <Input id="signer-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="name" aria-invalid={showErrors && !nameValid} />
            {showErrors && !nameValid && <p className="text-[13px] text-destructive">Enter your full name</p>}
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="signer-email">
              Email <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id="signer-email" type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" aria-invalid={showErrors && !emailValid} />
            {showErrors && !emailValid && <p className="text-[13px] text-destructive">Enter a valid email</p>}
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Your signature</Label>
          <SignatureInput name={name} onChange={setSignature} invalid={showErrors && !signature} />
          {showErrors && !signature && <p className="text-[13px] text-destructive">Add your signature</p>}
        </div>

        <div>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={agree} onCheckedChange={(checked) => setAgree(checked === true)} className="mt-0.5" aria-invalid={showErrors && !agree} />
            <span>
              I have read and agree to this contract, and I agree to sign it electronically.
              <span className="mt-1 block text-[13px] text-muted-foreground">Your name, signature, the time, your IP address and device are recorded with the signed document.</span>
            </span>
          </label>
          {showErrors && !agree && <p className="mt-1.5 pl-[30px] text-[13px] text-destructive">Please tick the box to confirm</p>}
        </div>

        <Button type="submit" size="lg" disabled={sign.isPending} className="w-full sm:w-fit">
          {sign.isPending ? <LoaderCircle className="animate-spin" /> : <PenLine />} Sign contract
        </Button>
      </form>
    </motion.section>
  );
}

/** /c/:token – where the client reads and signs. No login, no app chrome, and only document data from the API. */
export default function PublicContractPage() {
  const { token = "" } = useParams();
  const { data: contract, isPending, refetch } = usePublicContract(token);
  const signRef = useRef<HTMLDivElement>(null);

  if (isPending) {
    return (
      <div className="min-h-dvh bg-muted/40 px-4 py-8" role="status" aria-label="Loading contract">
        <div className="mx-auto max-w-3xl space-y-4">
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-[44rem] rounded-2xl" />
        </div>
      </div>
    );
  }
  if (!contract) return <Unavailable title="This contract isn't available" text="The link may be incorrect or may have been replaced. Please ask the sender for a new link." />;
  if (contract.status === "voided") {
    return <Unavailable title="This contract was withdrawn" text={`${contract.agency.name} has withdrawn this contract, so it can no longer be signed. Please contact them if you were expecting to sign it.`} />;
  }

  const canSign = contract.status === "sent" || contract.status === "viewed";
  const banner = canSign
    ? { icon: PenLine, tone: "border-border bg-card text-foreground", text: `${contract.agency.name} has sent you this contract to review and sign.` }
    : contract.status === "client_signed"
      ? { icon: Clock, tone: "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300", text: `Thank you – you've signed. ${contract.agency.name} will counter-sign to complete it. You can save a copy now.` }
      : { icon: CircleCheckBig, tone: "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300", text: "Signed by both parties. Download the PDF for your records." };

  return (
    <div className="min-h-dvh bg-muted/40 print:bg-white">
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur-xl print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{contract.agency.name}</p>
            <h1 className="truncate text-xs text-muted-foreground">{contract.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canSign && (
              <Button onClick={() => signRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <PenLine /> Sign
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> <span className="hidden sm:inline">Download PDF</span>
              <span className="sm:hidden">PDF</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8 print:max-w-none print:p-0">
        <motion.div
          key={contract.status}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          role="status"
          className={cn("mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium print:hidden", banner.tone)}
        >
          <banner.icon className="size-4 shrink-0" />
          {banner.text}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05, ease: "easeOut" }}>
          <ContractDocument contract={contract} />
        </motion.div>

        <div ref={signRef} className="scroll-mt-20">
          {canSign && <SignPanel token={token} contract={contract} onReload={() => void refetch()} />}
        </div>

        <footer className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground print:hidden">
          <BrandMark className="size-4" />
          <span>
            Signed securely with{" "}
            <a href="/" className="font-medium hover:text-foreground">
              GrowUpliftOS
            </a>
          </span>
        </footer>
      </main>
    </div>
  );
}
