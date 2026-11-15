import { PageHeader } from "@/components/shared/page-header";
import { AppearanceSettings } from "@/features/appearance/appearance-settings";

/** Appearance for everyone (members can't open the workspace Settings): mode, accent colour, font style. */
export default function AppearancePage() {
  return (
    <>
      <PageHeader title="Appearance" description="Make GrowUpliftOS look the way you like. Saved on this device." />
      <div className="max-w-3xl">
        <AppearanceSettings />
      </div>
    </>
  );
}
