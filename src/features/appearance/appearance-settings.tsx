import { Check, Monitor, Moon, Sun } from "lucide-react";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { useTheme, type Theme } from "@/components/theme/theme-provider";
import { Progress } from "@/components/ui/progress";
import { ACCENTS, FONT_STYLES } from "@/lib/appearance";
import { cn } from "@/lib/utils";

const MODES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/** The accent colours as a row of round swatches; used here and in the profile menu. */
export function AccentSwatches({ size = "md" }: { size?: "sm" | "md" }) {
  const { accent, setAccent } = useTheme();
  return (
    <div role="radiogroup" aria-label="Accent colour" className={cn("flex flex-wrap", size === "sm" ? "gap-1.5" : "gap-3")}>
      {ACCENTS.map((item) => {
        const selected = item.id === accent;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={item.name}
            title={item.name}
            onClick={() => setAccent(item.id)}
            className={cn(
              "relative flex items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              size === "sm" ? "size-6" : "size-10",
              selected && "ring-2 ring-foreground/70",
            )}
            style={{ backgroundColor: item.swatch }}
          >
            {selected && <Check className={cn("text-white", size === "sm" ? "size-3.5" : "size-5")} strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-soft">
      <div className="border-b px-5 py-4 sm:px-6">
        <h2 className="font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

/**
 * Settings → Appearance: light/dark, the accent colour and the font style, with a small live preview.
 * These are personal and kept in this browser, so each person can pick their own.
 */
export function AppearanceSettings() {
  const { theme, setTheme, fontStyle, setFontStyle, accent } = useTheme();
  const accentName = ACCENTS.find((item) => item.id === accent)?.name ?? "";
  return (
    <div className="grid gap-6">
      <Card title="Mode" description="Light, dark, or follow your device.">
        <SegmentedControl label="Colour mode" options={MODES} value={theme} onChange={(value: Theme) => setTheme(value)} />
      </Card>

      <Card title="Accent colour" description="Used for buttons, links, highlights and the sidebar.">
        <AccentSwatches />
        <p className="mt-3 text-sm text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{accentName}</span>
        </p>
      </Card>

      <Card title="Font style" description="How text and headings look across the app.">
        <div role="radiogroup" aria-label="Font style" className="grid gap-3 sm:grid-cols-2">
          {FONT_STYLES.map((item) => {
            const selected = item.id === fontStyle;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setFontStyle(item.id)}
                className={cn(
                  "flex items-center gap-4 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selected ? "border-primary bg-primary/5" : "hover:bg-accent/50",
                )}
              >
                <span className="text-3xl leading-none font-semibold" style={{ fontFamily: item.sample }}>
                  Aa
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium">
                    {item.name} {selected && <Check className="size-4 text-primary" />}
                  </span>
                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Preview" description="How it looks with your choices.">
        <div className="rounded-xl border bg-background p-5">
          <p className="text-xs font-semibold text-primary uppercase">Website redesign</p>
          <h3 className="mt-1 text-xl font-semibold">Invoice INV-0042 is paid</h3>
          <p className="mt-1 text-sm text-muted-foreground">₹1,18,000 received by UPI from Bloom Cafe.</p>
          <div className="mt-4 flex items-center gap-3">
            <Progress value={72} className="flex-1" />
            <span className="tabular text-sm font-medium">72%</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Send invoice</span>
            <span className="inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium">Share on WhatsApp</span>
            <span className="inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground">In progress</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
