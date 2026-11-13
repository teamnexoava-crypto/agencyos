import type { LucideIcon } from "lucide-react";
import { FileSignature, ReceiptText, Settings, Wallet } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";

interface ComingSoonProps {
  title: string;
  description: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  phase: number;
}

/** Section scaffold used until each feature's build phase lands. Keeps routing and navigation real. */
function ComingSoon({ title, description, icon, emptyTitle, emptyDescription, phase }: ComingSoonProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} action={<Badge variant="outline">Arrives in build phase {phase}</Badge>} />
    </>
  );
}

export const InvoicesPage = () => (
  <ComingSoon
    title="Invoices"
    description="Bill clients and get paid faster."
    icon={ReceiptText}
    emptyTitle="No invoices yet"
    emptyDescription="GST-ready invoices with live preview, PDF download, partial payments and one-tap WhatsApp sharing."
    phase={4}
  />
);

export const FinancePage = () => (
  <ComingSoon
    title="Finance"
    description="Income, expenses and profit at a glance."
    icon={Wallet}
    emptyTitle="Nothing to report yet"
    emptyDescription="Track expenses and see profit & loss by month, project and client — with CSV export."
    phase={5}
  />
);

export const ContractsPage = () => (
  <ComingSoon
    title="Contracts"
    description="Agreements and e-signatures."
    icon={FileSignature}
    emptyTitle="No contracts yet"
    emptyDescription="Reusable templates, a public signing page and a signed PDF with a full audit trail."
    phase={6}
  />
);

export const SettingsPage = () => (
  <ComingSoon
    title="Settings"
    description="Workspace profile, branding and defaults."
    icon={Settings}
    emptyTitle="Settings are on the way"
    emptyDescription="Edit your agency profile, brand colour, invoice and tax defaults, and WhatsApp message templates."
    phase={8}
  />
);
