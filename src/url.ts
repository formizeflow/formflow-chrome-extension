export type Scalar = string | number | boolean;

export type FormOptions = {
  /** Your FormFlow host. Default https://formize.net */
  baseUrl?: string;
  /** Form slug, or an A/B test's entry address. */
  slug: string;
  /** Your stable user id (experiments, resume, attribution). */
  uid?: string;
  /** HMAC of uid made on YOUR server. Never sign inside the extension: anyone can read its code. */
  uidSignature?: string;
  /** Force an experiment variant id (QA; never counted). */
  variant?: string;
  locale?: string;
  hidden?: Record<string, Scalar>;
  prefill?: Record<string, Scalar>;
  /** Sent as attrs.<key> for targeting. extension_version, extension_id, platform and locale are added unless autoAttributes is false. */
  attributes?: Record<string, Scalar>;
  autoAttributes?: boolean;
  /** Statistics consent: true, false, or unset (the form forwards nothing to analytics destinations). */
  consent?: boolean;
  /** Show a Skip control. */
  skippable?: boolean;
  /** Show the in-form close button. */
  showClose?: boolean;
  /** Integration tests: nothing is counted. */
  test?: boolean;
  /** false starts over instead of resuming saved progress. */
  resume?: boolean;
  appearance?: { colorScheme?: "light" | "dark" | "system"; accent?: string; fontFamily?: string };
};

export const DEFAULT_BASE = "https://formize.net";
const base = (u?: string) => (u ?? DEFAULT_BASE).replace(/\/+$/, "");

function params(o: FormOptions, attrs: Record<string, Scalar>): URLSearchParams {
  const p = new URLSearchParams();
  const put = (k: string, v: Scalar | undefined) => { if (v !== undefined && v !== "") p.set(k, String(v)); };
  put("uid", o.uid); put("uid_sig", o.uidSignature); put("variant", o.variant); put("lang", o.locale);
  if (o.consent !== undefined) p.set("consent", o.consent ? "granted" : "denied");
  if (o.skippable) p.set("skippable", "1");
  if (o.showClose) p.set("close", "1");
  if (o.test) p.set("test", "1");
  if (o.resume === false) p.set("resume", "0");
  put("scheme", o.appearance?.colorScheme); put("accent", o.appearance?.accent); put("font", o.appearance?.fontFamily);
  for (const [prefix, obj] of [["hidden.", o.hidden], ["prefill.", o.prefill], ["attrs.", attrs]] as const)
    for (const k of Object.keys(obj ?? {}).sort()) put(prefix + k, obj![k]);
  return p;
}

/** The iframe address: `/embed/<slug>?origin=<this extension>&...`. The origin lets the form post its events back to your page. */
export function embedUrl(o: FormOptions, origin: string, attrs: Record<string, Scalar> = o.attributes ?? {}): string {
  const p = params(o, attrs);
  p.set("origin", origin);
  return `${base(o.baseUrl)}/embed/${encodeURIComponent(o.slug)}?${p}`;
}

/** The full-page form address (`/f/<slug>`), for a new tab or the uninstall URL. */
export function pageUrl(o: FormOptions, attrs: Record<string, Scalar> = o.attributes ?? {}): string {
  const q = params(o, attrs).toString();
  return `${base(o.baseUrl)}/f/${encodeURIComponent(o.slug)}${q ? `?${q}` : ""}`;
}

export type FormEvent = { type: string; formId: string; data: Record<string, unknown> };

/** A FormFlow event from a message event, or null. Checks the sender is the form's own frame and host. */
export function readEvent(ev: { origin: string; source: unknown; data: unknown }, frame: { contentWindow: unknown } | null, baseUrl?: string): FormEvent | null {
  if (!frame || ev.source !== frame.contentWindow) return null;
  try { if (ev.origin !== new URL(base(baseUrl)).origin) return null; } catch { return null; }
  const d = ev.data as { source?: unknown; type?: unknown; formId?: unknown; data?: unknown } | null;
  if (!d || d.source !== "formflow" || typeof d.type !== "string") return null;
  return { type: d.type, formId: typeof d.formId === "string" ? d.formId : "", data: d.data && typeof d.data === "object" ? (d.data as Record<string, unknown>) : {} };
}
