import { useEffect, useRef, useState } from "react";
import "@fontsource/caveat/latin-600.css";
import { Eraser, PenLine, Type } from "lucide-react";
import SignaturePad from "signature_pad";
import type { SignatureMethod } from "@shared/constants";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SignatureValue {
  method: SignatureMethod;
  /** PNG data URI on a transparent background. */
  image: string;
}

const INK = "#0f172a";
const EXPORT_WIDTH = 640;
const EXPORT_HEIGHT = 200;

/** Typed name → an image in a handwriting face, so every signature is stored the same way. */
async function renderTyped(text: string): Promise<string> {
  await document.fonts.load('600 96px "Caveat"', text).catch(() => undefined);
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return "";
  let size = 96;
  const family = '"Caveat", "Segoe Script", "Brush Script MT", cursive';
  context.font = `600 ${size}px ${family}`;
  while (size > 28 && context.measureText(text).width > EXPORT_WIDTH - 48) {
    size -= 4;
    context.font = `600 ${size}px ${family}`;
  }
  context.fillStyle = INK;
  context.textBaseline = "middle";
  context.fillText(text, 24, EXPORT_HEIGHT / 2 + 6);
  return canvas.toDataURL("image/png");
}

function DrawPad({ onChange }: { onChange: (image: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, { penColor: INK, minWidth: 0.9, maxWidth: 2.6 });
    padRef.current = pad;

    // Match the bitmap to the element's size and the screen's pixel density. Resizing clears a canvas, so redraw the strokes.
    const fit = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const strokes = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.fromData(strokes);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    const exportImage = () => {
      // Always export at one modest size, whatever the screen: keeps uploads small and consistent.
      const out = document.createElement("canvas");
      out.width = EXPORT_WIDTH;
      out.height = EXPORT_HEIGHT;
      out.getContext("2d")?.drawImage(canvas, 0, 0, out.width, out.height);
      setHasInk(true);
      onChangeRef.current(out.toDataURL("image/png"));
    };
    pad.addEventListener("endStroke", exportImage);

    return () => {
      observer.disconnect();
      pad.removeEventListener("endStroke", exportImage);
      pad.off();
    };
  }, []);

  const clear = () => {
    padRef.current?.clear();
    setHasInk(false);
    onChange(null);
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Signature drawing area. Draw your signature with your finger, a stylus or the mouse."
        // Always white with dark ink, in both themes: it ends up on a white document.
        className="block aspect-[16/5] w-full touch-none rounded-xl border border-zinc-300 bg-white"
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-[22%] border-b border-dashed border-zinc-300" />
      {!hasInk && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-400">Sign here</span>}
      {hasInk && (
        <button type="button" onClick={clear} className="absolute top-2 right-2 inline-flex items-center gap-1.5 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-200 hover:text-zinc-900">
          <Eraser className="size-3.5" /> Clear
        </button>
      )}
    </div>
  );
}

function TypePad({ suggestion, onChange }: { suggestion: string; onChange: (image: string | null) => void }) {
  const [text, setText] = useState(suggestion);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const value = text.trim();
    let cancelled = false;
    if (!value) {
      onChangeRef.current(null);
      return;
    }
    void renderTyped(value).then((image) => {
      if (!cancelled) onChangeRef.current(image || null);
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  return (
    <div className="grid gap-2">
      <Input value={text} onChange={(event) => setText(event.target.value)} maxLength={60} placeholder="Type your name" aria-label="Type your signature" autoComplete="off" />
      <div className="flex aspect-[16/5] w-full items-center overflow-hidden rounded-xl border border-zinc-300 bg-white px-6" aria-hidden="true">
        <span className="truncate text-5xl leading-none font-semibold text-[#0f172a]" style={{ fontFamily: '"Caveat", "Segoe Script", "Brush Script MT", cursive' }}>
          {text.trim() || <span className="text-zinc-300">Your signature</span>}
        </span>
      </div>
    </div>
  );
}

interface SignatureInputProps {
  /** Pre-fills the typed option. */
  name: string;
  onChange: (value: SignatureValue | null) => void;
  invalid?: boolean;
}

/** Draw or type a signature. Reports a PNG either way, or `null` while there is nothing to sign with. */
export function SignatureInput({ name, onChange, invalid = false }: SignatureInputProps) {
  const [method, setMethod] = useState<SignatureMethod>("drawn");
  const options: { value: SignatureMethod; label: string; icon: typeof PenLine }[] = [
    { value: "drawn", label: "Draw", icon: PenLine },
    { value: "typed", label: "Type", icon: Type },
  ];

  return (
    <div className={cn("grid gap-2.5 rounded-2xl", invalid && "ring-2 ring-destructive/40 ring-offset-4 ring-offset-background")}>
      <div role="radiogroup" aria-label="How do you want to sign?" className="grid w-fit grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={method === option.value}
            onClick={() => {
              if (method === option.value) return;
              setMethod(option.value);
              onChange(null);
            }}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150",
              method === option.value && "bg-background text-foreground shadow-soft",
            )}
          >
            <option.icon className="size-3.5" /> {option.label}
          </button>
        ))}
      </div>
      {method === "drawn" ? (
        <DrawPad onChange={(image) => onChange(image ? { method: "drawn", image } : null)} />
      ) : (
        <TypePad suggestion={name} onChange={(image) => onChange(image ? { method: "typed", image } : null)} />
      )}
    </div>
  );
}
