/**
 * Dates as they are written in India: "30 Sep 2026". Intl's en-IN (and en-GB) spell September
 * "Sept" – the only four-letter short month – which reads like a typo in a column of dates and
 * widens chart axes. Everything else comes from Intl, so day order, time and time zones are unchanged.
 */
export function formatIndianDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-IN", options)
    .formatToParts(date)
    .map((part) => (part.type === "month" && part.value === "Sept" ? "Sep" : part.value))
    .join("");
}
