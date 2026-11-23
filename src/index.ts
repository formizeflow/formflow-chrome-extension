import { ext } from "./chrome";
import { DEFAULT_BASE, embedUrl, pageUrl, readEvent, type FormEvent, type FormOptions, type Scalar } from "./url";

export { embedUrl, pageUrl, readEvent, type FormEvent, type FormOptions, type Scalar };
export const version = "0.1.0";

/** extension_version, extension_id, platform ("chrome_extension") and locale, overridden by the attributes you pass. */
export function extensionAttributes(o: Pick<FormOptions, "attributes" | "autoAttributes" | "locale"> = {}): Record<string, Scalar> {
  if (o.autoAttributes === false) return { ...(o.attributes ?? {}) };
  const auto: Record<string, Scalar> = { platform: "chrome_extension" };
  try {
    const api = ext();
    auto.extension_version = api.runtime.getManifest().version;
    auto.extension_id = api.runtime.id;
    const lang = o.locale ?? api.i18n?.getUILanguage();
    if (lang) auto.locale = lang;
  } catch { /* outside an extension (tests, a plain web page): user attributes only */ }
  return { ...auto, ...(o.attributes ?? {}) };
}

export type MountOptions = FormOptions & {
  onReady?: (d: Record<string, unknown>) => void;
  onComplete?: (d: Record<string, unknown>) => void;
  onSkip?: () => void;
  onClose?: () => void;
  /** An ending asked to go somewhere. Default: open http(s) addresses in a new tab. */
  onRedirect?: (d: { url: string; route?: string }) => void;
  onEvent?: (e: FormEvent) => void;
  /** Grow the iframe to the form's height. Default true. */
  autoResize?: boolean;
  /** Extra iframe attributes, e.g. { title: "Feedback" }. */
  title?: string;
};

/**
 * Render a form in an extension page you own: popup, side panel, options page, or a new-tab page.
 * Plain iframe, no remote script, so it passes Manifest V3's no-remote-code rule. Returns `destroy()`.
 */
export function mountForm(container: HTMLElement, o: MountOptions): { iframe: HTMLIFrameElement; destroy: () => void } {
  const origin = (globalThis as { location?: Location }).location?.origin ?? "";
  const iframe = document.createElement("iframe");
  iframe.src = embedUrl(o, origin, extensionAttributes(o));
  iframe.title = o.title ?? "Form";
  iframe.allow = "clipboard-write; camera; microphone; geolocation";
  iframe.style.cssText = "border:0;width:100%;min-height:320px;display:block;color-scheme:normal";
  const on = (ev: MessageEvent) => {
    const e = readEvent(ev, iframe, o.baseUrl);
    if (!e) return;
    const d = e.data;
    switch (e.type) {
      case "ready": o.onReady?.(d); break;
      case "resize": if (o.autoResize !== false && typeof d.height === "number") iframe.style.height = `${Math.ceil(d.height)}px`; break;
      case "submit": o.onComplete?.(d); break; // an iframe embed reports a finished form as submit
      case "skip": o.onSkip?.(); break;
      case "close": o.onClose?.(); break;
      case "redirect": {
        const r = { url: String(d.url ?? ""), route: typeof d.route === "string" ? d.route : undefined };
        if (o.onRedirect) o.onRedirect(r);
        else if (/^https?:\/\//i.test(r.url)) openTab(r.url);
        break;
      }
    }
    o.onEvent?.(e);
  };
  window.addEventListener("message", on);
  container.appendChild(iframe);
  return { iframe, destroy: () => { window.removeEventListener("message", on); iframe.remove(); } };
}

function openTab(url: string) {
  try { const api = ext(); if (api.tabs) { void api.tabs.create({ url }); return; } } catch { /* not an extension */ }
  window.open(url, "_blank", "noopener");
}

/** Open the full-page form in a new tab (works from a service worker too). */
export function openFormTab(o: FormOptions): void {
  openTab(pageUrl(o, extensionAttributes(o)));
}

/**
 * Show a form once when the extension is installed (and optionally after updates). Call at the top level of your background
 * service worker so the listener is registered on every start. Needs no permissions.
 */
export function welcomeOnInstall(o: FormOptions & { onUpdate?: boolean }): void {
  ext().runtime.onInstalled.addListener((d) => {
    if (d.reason === "install" || (o.onUpdate && d.reason === "update")) openFormTab({ ...o, hidden: { ...(o.hidden ?? {}), install_reason: d.reason, ...(d.previousVersion ? { previous_version: d.previousVersion } : {}) } });
  });
}

/**
 * Point Chrome's uninstall page at a FormFlow form, so people who remove the extension can say why. Call again after sign-in to attach the uid.
 * Chrome caps the address at 1023 characters; attributes are dropped first, then hidden fields, if it is longer.
 */
export async function setUninstallSurvey(o: FormOptions): Promise<string> {
  const attrs = extensionAttributes(o);
  let url = pageUrl(o, attrs);
  if (url.length > 1023) url = pageUrl(o, {});
  if (url.length > 1023) url = pageUrl({ ...o, hidden: undefined, prefill: undefined }, {});
  if (url.length > 1023) throw new Error("FormFlow: uninstall URL is longer than Chrome's 1023-character limit");
  await ext().runtime.setUninstallURL(url);
  return url;
}

/** Response of POST /api/v1/public/onboarding/decide. */
export type OnboardingDecision = { show: boolean; reason: string; slug?: string | null; variantId?: string | null; experimentId?: string | null; formId?: string | null; fromCache?: boolean };

export type DecideOptions = {
  baseUrl?: string;
  /** The onboarding entry key (an A/B test's entry address). */
  entry: string;
  uid?: string;
  uidSignature?: string;
  /** Show once per person: show: false after it was shown, completed or skipped. */
  firstRunOnly?: boolean;
  /** With firstRunOnly: someone shown but not done keeps seeing it for this many hours (server default 24). */
  maxAgeHours?: number;
  test?: boolean;
  attributes?: Record<string, Scalar>;
  timeoutMs?: number;
};

/**
 * Ask FormFlow whether to show onboarding and which version. The decision is cached in chrome.storage.local (needs the "storage"
 * permission; without it, nothing is cached) and returned with fromCache: true when the network fails.
 */
export async function decide(o: DecideOptions): Promise<OnboardingDecision> {
  const key = `formflow:decision:${o.entry}:${o.uid ?? "anon"}`;
  const store = (() => { try { return ext().storage?.local; } catch { return undefined; } })();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), o.timeoutMs ?? 8000);
  try {
    const res = await fetch(`${(o.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "")}/api/v1/public/onboarding/decide`, {
      method: "POST", headers: { "content-type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ entry: o.entry, uid: o.uid, uid_sig: o.uidSignature, firstRunOnly: o.firstRunOnly, maxAgeHours: o.maxAgeHours, test: o.test, attributes: extensionAttributes({ attributes: o.attributes }) }),
    });
    if (!res.ok) throw new Error(`FormFlow: decide answered ${res.status}`);
    const j = (await res.json()) as { data?: OnboardingDecision } & OnboardingDecision;
    const dec = j.data ?? j;
    await store?.set({ [key]: dec }).catch(() => undefined);
    return dec;
  } catch (e) {
    const hit = (await store?.get(key).catch(() => undefined))?.[key] as OnboardingDecision | undefined;
    if (hit) return { ...hit, fromCache: true };
    throw e;
  } finally {
    clearTimeout(t);
  }
}
