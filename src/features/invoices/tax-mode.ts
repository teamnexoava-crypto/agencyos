import type { CurrencyCode, TaxMode } from "@shared/constants";

/** GST state / UT codes – the first two digits of every GSTIN. Used only to explain the choice in plain words. */
const GST_STATES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

/**
 * State code of a GSTIN, or null when the value doesn't look like one. Client GSTINs are free text
 * (any tax ID up to 20 characters), so only a 15-character value starting with two digits counts –
 * anything else could be a foreign tax number and must not decide Indian GST.
 */
export function gstStateCode(gstin: string | null | undefined): string | null {
  const value = (gstin ?? "").replace(/\s/g, "").toUpperCase();
  return /^\d{2}[A-Z0-9]{13}$/.test(value) ? value.slice(0, 2) : null;
}

const stateLabel = (code: string) => (GST_STATES[code] ? `${GST_STATES[code]} ${code}` : code);

export interface TaxSuggestion {
  mode: Extract<TaxMode, "igst" | "cgst_sgst">;
  /** Plain-English reason, e.g. "client is in another state (Kerala 32 vs Karnataka 29)". */
  reason: string;
}

/**
 * Place-of-supply rule for services between two GST-registered businesses: same state → CGST + SGST,
 * different state → IGST. Returns null when it can't be decided (no INR, or either GSTIN missing), in
 * which case the form keeps whatever the workspace normally uses.
 */
export function suggestTaxMode(input: { currency: CurrencyCode; workspaceGstin: string | null; clientGstin: string | null | undefined }): TaxSuggestion | null {
  if (input.currency !== "INR") return null;
  const ours = gstStateCode(input.workspaceGstin);
  const theirs = gstStateCode(input.clientGstin);
  if (!ours || !theirs) return null;
  if (ours === theirs) return { mode: "cgst_sgst", reason: `client is in the same state as you (${stateLabel(ours)})` };
  return { mode: "igst", reason: `client is in another state (${stateLabel(theirs)} vs your ${stateLabel(ours)})` };
}
