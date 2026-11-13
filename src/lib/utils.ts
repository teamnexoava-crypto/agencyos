import type { CSSProperties } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Position of a row in its list, for the `rise-in` entrance (each row starts a beat after the one before). */
export const staggerIndex = (index: number) => ({ "--i": index }) as CSSProperties;
