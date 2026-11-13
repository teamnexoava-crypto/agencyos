import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";

interface CountUpProps {
  value: number;
  /** Turns the animated number into text, e.g. a currency formatter. */
  format: (value: number) => string;
  className?: string;
}

/**
 * Number that counts up to its value on mount and glides to new values afterwards. The text node is
 * written directly (no React re-render per frame) and the final value is always exact.
 */
export function CountUp({ value, format, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduceMotion) {
      node.textContent = format(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        node.textContent = format(Math.round(latest));
      },
      onComplete: () => {
        node.textContent = format(value);
      },
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, format, reduceMotion]);

  // Rendered with the real value so it is correct before the effect runs and for screen readers.
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
