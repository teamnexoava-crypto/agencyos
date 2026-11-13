import { toast } from "sonner";

/** Copies text and confirms with a toast. Falls back to a hidden textarea where the async API is unavailable. */
export async function copyToClipboard(text: string, message = "Copied to clipboard"): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) {
      toast.error("Couldn't copy – select the text and copy it manually.");
      return;
    }
  }
  toast.success(message);
}
