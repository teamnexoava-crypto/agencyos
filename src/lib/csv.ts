type Cell = string | number | null | undefined;

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Neutralise spreadsheet formula injection: a cell starting with = + - @ would be executed by Excel.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Builds a CSV and triggers a download. Amounts should be passed as plain numbers (major units). */
export function downloadCsv(filename: string, header: string[], rows: Cell[][]): void {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(","));
  // The BOM makes Excel read the file as UTF-8 (₹ and names with accents survive).
  const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
