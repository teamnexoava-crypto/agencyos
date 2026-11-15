import { useState } from "react";
import { ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAndroid, isInAppBrowser, openInChromeUrl } from "@/lib/in-app-browser";

/**
 * Shown at the top of the page when it was opened inside Instagram, Facebook and the like, where
 * Google sign-in is blocked: explains how to continue in the real browser, with a one-tap way out.
 */
export function InAppBrowserNotice() {
  const [show] = useState(() => isInAppBrowser());
  const [copied, setCopied] = useState(false);
  if (!show) return null;
  const android = isAndroid();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div role="note" className="relative z-40 border-b border-amber-500/40 bg-amber-50 px-4 py-3 text-[13px] text-amber-950 dark:bg-amber-950/60 dark:text-amber-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong>Open this page in {android ? "Chrome" : "Safari or Chrome"} to sign up.</strong> Google sign-in doesn't work inside this app's browser.{" "}
          {android ? "Tap the button, or" : "Tap"} the <strong>⋯</strong> menu and choose <strong>“Open in browser”</strong>.
        </p>
        <div className="flex shrink-0 gap-2">
          {android && (
            <Button asChild size="sm">
              <a href={openInChromeUrl(window.location.href)}>
                <ExternalLink /> Open in Chrome
              </a>
            </Button>
          )}
          <Button size="sm" variant="outline" className="bg-background" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />} {copied ? "Link copied" : "Copy link"}
          </Button>
        </div>
      </div>
    </div>
  );
}
