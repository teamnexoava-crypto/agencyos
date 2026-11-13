import { useState } from "react";
import { CURRENCIES, type CurrencyCode } from "@shared/constants";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface MoneyInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  /** Amount in minor units (paise), or null when empty. */
  value: number | null;
  onChange: (value: number | null) => void;
  currency: CurrencyCode;
}

const toText = (minor: number | null) => (minor === null ? "" : String(minor / 100));

/**
 * Amount field that speaks rupees to the user and paise to the app. The text the user is typing is
 * kept locally so "12." or "0.5" aren't reformatted mid-keystroke.
 */
export function MoneyInput({ value, onChange, currency, className, onBlur, ...props }: MoneyInputProps) {
  const [text, setText] = useState(() => toText(value));
  const [lastValue, setLastValue] = useState(value);

  // The form changed the value from outside (reset / prefill) → show it.
  if (value !== lastValue) {
    setLastValue(value);
    setText(toText(value));
  }

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "";

  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
        {symbol}
      </span>
      <Input
        inputMode="decimal"
        autoComplete="off"
        className={cn("tabular pl-9", className)}
        value={text}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d.]/g, "");
          if (!/^\d*\.?\d{0,2}$/.test(next)) return;
          setText(next);
          const minor = next === "" || next === "." ? null : Math.round(Number.parseFloat(next) * 100);
          setLastValue(minor);
          onChange(minor);
        }}
        onBlur={(event) => {
          setText(toText(value));
          onBlur?.(event);
        }}
        {...props}
      />
    </div>
  );
}
