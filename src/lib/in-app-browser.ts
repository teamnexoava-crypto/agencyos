/**
 * Browsers built into other apps (Instagram, Facebook, LinkedIn, Snapchat, Android web views). Google
 * refuses to sign anyone in from these ("disallowed_useragent"), so visitors arriving from a social
 * app have to be sent to their real browser first.
 */
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|LinkedInApp|Snapchat|musical_ly|BytedanceWebview|; wv\)/i;

export const isInAppBrowser = (userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean => IN_APP.test(userAgent);
export const isAndroid = (userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean => /Android/i.test(userAgent);

/** On Android, a link that opens this page in Chrome (other apps' browsers honour it). */
export function openInChromeUrl(href: string): string {
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;end`;
}
