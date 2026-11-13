import type { LucideIcon } from "lucide-react";
import { Settings } from "lucide-react";
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
