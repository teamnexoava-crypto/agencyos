/**
 * Builds a WhatsApp "click to chat" link. The number is reduced to digits only (wa.me rejects "+",
 * spaces and dashes); with no number the link opens WhatsApp's contact picker instead.
 */
export function whatsappUrl(number: string | null | undefined, message = ""): string {
  const digits = (number ?? "").replace(/\D/g, "");
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}
