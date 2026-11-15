import { useEffect, useLayoutEffect } from "react";
import { useMatches } from "react-router";
import { APP_NAME } from "@shared/constants";

/** What a route declares in its `handle` to name its browser tab. */
export interface TitleHandle {
  title?: string;
}

const HOME_TITLE = `${APP_NAME} – Run your agency from one place`;
const withApp = (title: string) => `${title} · ${APP_NAME}`;

/**
 * Names the browser tab after the page: the route's `handle.title`, or the home page title. Runs as a
 * layout effect, so a page that names its tab from its own data (`useDocumentTitle`) still wins.
 */
export function useRouteTitle(): void {
  const matches = useMatches();
  const title = [...matches].reverse().find((match) => (match.handle as TitleHandle | undefined)?.title)?.handle as TitleHandle | undefined;
  const text = title?.title ? withApp(title.title) : HOME_TITLE;
  useLayoutEffect(() => {
    document.title = text;
  }, [text]);
}

/**
 * Names the tab from a page's own data, e.g. "INV-0042 · GrowUpliftOS". Pages a client sees pass
 * `{ brand: false }` and include the agency's name instead, so they never show ours.
 */
export function useDocumentTitle(title: string | null | undefined, options: { brand?: boolean } = {}): void {
  const brand = options.brand ?? true;
  useEffect(() => {
    if (!title) return;
    document.title = brand ? withApp(title) : title;
  }, [title, brand]);
}
