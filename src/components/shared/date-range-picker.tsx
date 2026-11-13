import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RANGE_PRESETS, resolveRange, type RangePreset, type RangeSelection } from "@/lib/date-range";

interface DateRangePickerProps {
  value: RangeSelection;
  onChange: (value: RangeSelection) => void;
}

/** Preset selector (this month, last 3 months, this FY…) with from/to inputs for a custom range. */
export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value.preset}
        onValueChange={(preset) => {
          // Switching to "custom" starts from whatever range was showing, so nothing jumps.
          const current = resolveRange(value);
          onChange(preset === "custom" ? { preset: "custom", ...current } : { ...value, preset: preset as RangePreset });
        }}
      >
        <SelectTrigger className="h-9 w-auto min-w-44" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {RANGE_PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input type="date" aria-label="From" value={value.from} max={value.to || undefined} onChange={(event) => onChange({ ...value, from: event.target.value })} className="h-9 w-auto" />
          <span className="text-sm text-muted-foreground">to</span>
          <Input type="date" aria-label="To" value={value.to} min={value.from || undefined} onChange={(event) => onChange({ ...value, to: event.target.value })} className="h-9 w-auto" />
        </div>
      )}
    </div>
  );
}
