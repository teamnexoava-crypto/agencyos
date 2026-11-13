/**
 * Contract helpers shared by the Worker and the browser: the HTML allow-list, template variables and
 * the starter template.
 */

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** The only tags a contract may contain. Attributes are never kept, so there is nothing to script with. */
const ALLOWED_TAGS = new Set(["p", "br", "h1", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "hr"]);
const VOID_TAGS = new Set(["br", "hr"]);
/** Tags whose contents are dropped along with the tag itself. */
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "head", "title", "textarea", "select"]);

const TAG_PATTERN = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*|\/)?>/;
const ENTITY_PATTERN = /^&(?:[a-zA-Z][a-zA-Z0-9]{1,30}|#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6});/;

/**
 * Rebuilds rich text from scratch instead of trying to "clean" it: every `<` in the output is one this
 * function wrote itself, as a bare tag from the allow-list. Everything else comes out as escaped text.
 * Runs on the server for every write; the browser only ever renders its output.
 */
export function sanitizeContractHtml(input: string): string {
  let out = "";
  const open: string[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i] as string;

    if (char === "<") {
      const rest = input.slice(i, i + 2048);
      if (rest.startsWith("<!--")) {
        const end = input.indexOf("-->", i + 4);
        i = end === -1 ? input.length : end + 3;
        continue;
      }
      const match = TAG_PATTERN.exec(rest);
      if (!match) {
        // A stray "<" or something tag-like we don't understand (doctype, processing instruction…): plain text.
        out += "&lt;";
        i += 1;
        continue;
      }
      const closing = match[1] === "/";
      const tag = (match[2] as string).toLowerCase();
      i += match[0].length;

      if (DROP_WITH_CONTENT.has(tag)) {
        if (!closing) {
          const end = input.toLowerCase().indexOf(`</${tag}`, i);
          if (end === -1) {
            i = input.length;
          } else {
            const close = input.indexOf(">", end);
            i = close === -1 ? input.length : close + 1;
          }
        }
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) continue; // unknown tag: drop the tag, keep its text

      if (VOID_TAGS.has(tag)) {
        if (!closing) out += `<${tag}>`;
      } else if (closing) {
        const at = open.lastIndexOf(tag);
        if (at !== -1) {
          while (open.length > at) out += `</${open.pop() as string}>`;
        }
      } else {
        open.push(tag);
        out += `<${tag}>`;
      }
      continue;
    }

    if (char === "&") {
      const entity = ENTITY_PATTERN.exec(input.slice(i, i + 40));
      if (entity) {
        out += entity[0];
        i += entity[0].length;
      } else {
        out += "&amp;";
        i += 1;
      }
      continue;
    }

    if (char === ">") out += "&gt;";
    else if (char === '"') out += "&quot;";
    else out += char;
    i += 1;
  }

  while (open.length > 0) out += `</${open.pop() as string}>`;
  return out;
}

/** The readable text of a contract, for "is it empty?" checks and previews. */
export function contractText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const CONTRACT_VARIABLES = [
  { key: "client_name", label: "Client name", example: "Aarav Mehta" },
  { key: "client_company", label: "Client company", example: "Mehta Foods Pvt Ltd" },
  { key: "project_title", label: "Project title", example: "Website redesign" },
  { key: "amount", label: "Project amount", example: "₹1,50,000" },
  { key: "start_date", label: "Start date", example: "1 Dec 2026" },
  { key: "due_date", label: "Due date", example: "28 Feb 2027" },
  { key: "agency_name", label: "Your agency name", example: "Pixel Studio" },
  { key: "today", label: "Today's date", example: "13 Nov 2026" },
] as const;
export type ContractVariable = (typeof CONTRACT_VARIABLES)[number]["key"];

/**
 * Replaces `{variable}` placeholders in template HTML. Values are escaped on the way in. A placeholder
 * with no value is left as it is, so it stands out and can be filled in by hand before sending.
 */
export function fillContractVariables(html: string, values: Partial<Record<ContractVariable, string>>): string {
  return html.replace(/\{([a-z_]+)\}/g, (match, key: string) => {
    const value = values[key as ContractVariable];
    return value ? escapeHtml(value) : match;
  });
}

/** Placeholders still present in a contract (so the editor can warn before it is sent). */
export function unfilledVariables(html: string): string[] {
  const known = new Set<string>(CONTRACT_VARIABLES.map((variable) => variable.key));
  const found = new Set<string>();
  for (const match of html.matchAll(/\{([a-z_]+)\}/g)) {
    if (match[1] && known.has(match[1])) found.add(match[1]);
  }
  return [...found];
}

export function renderContractMessage(template: string, values: { client_name: string; project: string; contract_link: string; agency_name: string }): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? values[key as keyof typeof values] : match));
}

/** Short human reference printed on the document and its certificate. */
export const contractReference = (id: string): string => `AOS-${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()}`;

export const STARTER_TEMPLATE_NAME = "Service agreement";
export const STARTER_TEMPLATE_HTML = [
  "<h2>Service Agreement</h2>",
  "<p>This agreement is made on <strong>{today}</strong> between <strong>{agency_name}</strong> (the “Agency”) and <strong>{client_name}</strong> (the “Client”).</p>",
  "<h3>1. Scope of work</h3>",
  "<p>The Agency will deliver the project <strong>{project_title}</strong> as discussed and agreed with the Client. Any work outside this scope will be quoted and approved separately before it starts.</p>",
  "<h3>2. Timeline</h3>",
  "<p>Work begins on <strong>{start_date}</strong> and is planned to be completed by <strong>{due_date}</strong>. Timelines depend on the Client sharing content, feedback and approvals on time.</p>",
  "<h3>3. Fees and payment</h3>",
  "<p>The total fee for this project is <strong>{amount}</strong>, plus applicable taxes.</p>",
  "<ul><li><p>50% advance before work begins</p></li><li><p>50% on completion, before final files are handed over</p></li></ul>",
  "<p>Invoices are payable within 7 days. Work may be paused if a payment is overdue.</p>",
  "<h3>4. Revisions</h3>",
  "<p>The fee includes two rounds of revisions for each deliverable. Further revisions are billed at the Agency’s standard rate.</p>",
  "<h3>5. Ownership</h3>",
  "<p>Once full payment is received, the Client owns the final deliverables. The Agency may show the work in its portfolio unless the Client asks in writing that it be kept confidential.</p>",
  "<h3>6. Confidentiality</h3>",
  "<p>Both parties will keep each other’s confidential business information private and use it only for this project.</p>",
  "<h3>7. Cancellation</h3>",
  "<p>Either party may end this agreement with 7 days’ written notice. The Client will pay for all work completed up to the date of cancellation. The advance is non-refundable once work has started.</p>",
  "<h3>8. General</h3>",
  "<p>This document is the whole agreement between the parties for this project. Changes must be agreed in writing by both parties. Signing electronically is as valid as signing on paper.</p>",
].join("");
