import { LEAD_MAP_FIELDS, SHEET_MAX_BYTES, SHEET_MAX_ROWS, type LeadMapField } from "../../shared/constants";
import { ApiError } from "./errors";

export interface SheetRef {
  sheetId: string;
  /** True for "File → Share → Publish to web" links, which use a different id and URL. */
  published: boolean;
  gid: string;
}

const sheetError = (message: string, code = "sheet_error") => new ApiError(400, code, message, { url: message });

/**
 * Pulls the spreadsheet id and tab out of a pasted Google Sheets link. Nothing else from the link is
 * ever used: the export URL is rebuilt from these two validated values, always on docs.google.com,
 * so the server can't be pointed at any other address.
 */
export function parseSheetUrl(input: string): SheetRef {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw sheetError("That doesn't look like a link. Copy the address of your Google Sheet from the browser.");
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") throw sheetError("Paste a Google Sheets link – it starts with https://docs.google.com/spreadsheets/");

  const published = /^\/spreadsheets\/d\/e\/([\w-]{20,200})(?:\/|$)/.exec(url.pathname);
  const shared = /^\/spreadsheets\/d\/([\w-]{20,200})(?:\/|$)/.exec(url.pathname);
  const sheetId = published?.[1] ?? shared?.[1];
  if (!sheetId) throw sheetError("Paste a Google Sheets link – it starts with https://docs.google.com/spreadsheets/");

  // The tab is in "#gid=123" (address bar) or "?gid=123" (publish / share links).
  const gid = /[#&?]gid=(\d{1,12})/.exec(`${url.search}${url.hash}`)?.[1] ?? "0";
  return { sheetId, published: Boolean(published), gid };
}

/** Link that opens the sheet for a person. */
export const sheetViewUrl = (ref: SheetRef) =>
  ref.published ? `https://docs.google.com/spreadsheets/d/e/${ref.sheetId}/pubhtml?gid=${ref.gid}` : `https://docs.google.com/spreadsheets/d/${ref.sheetId}/edit#gid=${ref.gid}`;

function exportUrl(ref: SheetRef, testOrigin?: string): string {
  // Local development only: the sandbox can't reach Google, so tests serve CSV from a local stub.
  const origin = import.meta.env.DEV && testOrigin ? testOrigin : "https://docs.google.com";
  return ref.published
    ? `${origin}/spreadsheets/d/e/${ref.sheetId}/pub?gid=${ref.gid}&single=true&output=csv`
    : `${origin}/spreadsheets/d/${ref.sheetId}/export?format=csv&gid=${ref.gid}`;
}

/** RFC 4180 CSV: quoted cells, doubled quotes, commas and line breaks inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < source.length; i++) {
    const char = source[i] as string;
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export interface SheetData {
  headers: string[];
  /** Data rows, each padded / trimmed to the header's width. Empty rows are dropped. */
  rows: string[][];
}

/** Downloads one tab of a Google Sheet as CSV. The sheet must be viewable by anyone with the link. */
export async function fetchSheet(ref: SheetRef, testOrigin?: string): Promise<SheetData> {
  const notShared = sheetError(
    "We couldn't read that sheet. In Google Sheets choose Share → General access → “Anyone with the link” (Viewer), then try again.",
    "sheet_not_shared",
  );
  let response: Response;
  try {
    response = await fetch(exportUrl(ref, testOrigin), { headers: { Accept: "text/csv" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
  } catch {
    throw sheetError("Google Sheets didn't respond in time. Please try again in a minute.", "sheet_unreachable");
  }
  if (response.status === 404 || response.status === 410) throw sheetError("That sheet doesn't exist any more, or the link is incomplete.", "sheet_missing");
  // A private sheet answers with Google's sign-in page (HTML) or a 401/403 rather than CSV.
  if (!response.ok || !(response.headers.get("Content-Type") ?? "").includes("text/csv")) throw notShared;

  // Read with a hard cap rather than trusting Content-Length.
  const reader = response.body?.getReader();
  if (!reader) throw notShared;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > SHEET_MAX_BYTES) {
      await reader.cancel();
      throw sheetError(`That sheet is too large to sync (over 1 MB). Keep it under ${SHEET_MAX_ROWS.toLocaleString("en-IN")} rows, or move older rows to another tab.`, "sheet_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const table = parseCsv(new TextDecoder("utf-8").decode(bytes));
  const headers = (table[0] ?? []).map((header) => header.trim().slice(0, 200));
  if (headers.every((header) => header === "")) throw sheetError("That sheet looks empty. The first row should hold the column names (Name, Phone, Email…).", "sheet_empty");
  const rows = table
    .slice(1)
    .map((row) => headers.map((_, index) => (row[index] ?? "").trim()))
    .filter((row) => row.some((value) => value !== ""));
  if (rows.length > SHEET_MAX_ROWS) {
    throw sheetError(`That sheet has ${rows.length.toLocaleString("en-IN")} rows. Up to ${SHEET_MAX_ROWS.toLocaleString("en-IN")} can be synced – move older rows to another tab.`, "sheet_too_large");
  }
  return { headers, rows };
}

const HEADER_HINTS: Record<LeadMapField, RegExp> = {
  name: /^(full[ _]?name|name|customer|client|lead|contact[ _]?name|your name|first[ _]?name)\b/i,
  phone: /(phone|mobile|whats ?app|contact (no|number)|number|cell)/i,
  email: /e-?mail/i,
  company: /(company|business|organi[sz]ation|brand|firm)/i,
};

/** Best guess at which column feeds which lead field, from the column names. */
export function suggestMapping(headers: string[]): Partial<Record<LeadMapField, string>> {
  const mapping: Partial<Record<LeadMapField, string>> = {};
  const taken = new Set<string>();
  for (const field of LEAD_MAP_FIELDS) {
    const match = headers.find((header) => header !== "" && !taken.has(header) && HEADER_HINTS[field].test(header));
    if (match) {
      mapping[field] = match;
      taken.add(match);
    }
  }
  return mapping;
}
