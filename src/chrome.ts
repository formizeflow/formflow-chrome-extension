/** The slice of the extension APIs this package uses, so it needs no @types/chrome. `browser` (Firefox) has the same shape. */
export type ExtApi = {
  runtime: {
    id: string;
    getManifest(): { version: string; name?: string };
    getURL(path: string): string;
    setUninstallURL(url: string): Promise<void> | void;
    onInstalled: { addListener(cb: (d: { reason: string; previousVersion?: string }) => void): void };
  };
  storage?: { local: { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> } };
  tabs?: { create(p: { url: string }): Promise<unknown> | void };
  i18n?: { getUILanguage(): string };
};

/** chrome.* in Chrome, Edge and other Chromium browsers; browser.* in Firefox. Throws outside an extension. */
export function ext(): ExtApi {
  const g = globalThis as unknown as { chrome?: ExtApi; browser?: ExtApi };
  const api = g.browser?.runtime?.id ? g.browser : g.chrome?.runtime?.id ? g.chrome : undefined;
  if (!api) throw new Error("FormFlow: not running inside a browser extension (chrome.runtime is missing)");
  return api;
}
