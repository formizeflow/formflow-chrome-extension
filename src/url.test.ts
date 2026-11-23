import { describe, expect, it } from "vitest";
import { embedUrl, pageUrl, readEvent } from "./url";
import { extensionAttributes } from "./index";

describe("chrome-extension urls", () => {
  it("builds the iframe address with the extension origin and sorted params", () => {
    const u = new URL(embedUrl({ slug: "feedback form", uid: "u1", consent: false, hidden: { b: 2, a: "x y" } }, "chrome-extension://abc", { plan: "pro" }));
    expect(u.origin + u.pathname).toBe("https://formize.net/embed/feedback%20form");
    expect(u.searchParams.get("origin")).toBe("chrome-extension://abc");
    expect(u.searchParams.get("consent")).toBe("denied");
    expect(u.searchParams.get("hidden.a")).toBe("x y");
    expect(u.searchParams.get("attrs.plan")).toBe("pro");
    expect([...u.searchParams.keys()].filter((k) => k.startsWith("hidden."))).toEqual(["hidden.a", "hidden.b"]);
  });
  it("builds the page address for tabs and the uninstall URL, without origin", () => {
    expect(pageUrl({ slug: "bye", baseUrl: "https://forms.example.com/" })).toBe("https://forms.example.com/f/bye");
    expect(pageUrl({ slug: "bye", test: true }, { extension_version: "1.2.0" })).toBe("https://formize.net/f/bye?test=1&attrs.extension_version=1.2.0");
  });
  it("accepts only messages from the form's frame and host", () => {
    const frame = { contentWindow: {} };
    const msg = { source: "formflow", type: "submit", formId: "frm_1", data: { submissionId: "s" } };
    expect(readEvent({ origin: "https://formize.net", source: frame.contentWindow, data: msg }, frame)).toEqual({ type: "submit", formId: "frm_1", data: { submissionId: "s" } });
    expect(readEvent({ origin: "https://evil.example", source: frame.contentWindow, data: msg }, frame)).toBeNull();
    expect(readEvent({ origin: "https://formize.net", source: {}, data: msg }, frame)).toBeNull();
    expect(readEvent({ origin: "https://formize.net", source: frame.contentWindow, data: { type: "submit" } }, frame)).toBeNull();
  });
  it("adds extension attributes inside an extension and lets yours win", () => {
    (globalThis as Record<string, unknown>).chrome = { runtime: { id: "extid", getManifest: () => ({ version: "2.0.1" }) }, i18n: { getUILanguage: () => "de" } };
    expect(extensionAttributes({ attributes: { platform: "edge" } })).toEqual({ platform: "edge", extension_version: "2.0.1", extension_id: "extid", locale: "de" });
    expect(extensionAttributes({ autoAttributes: false, attributes: { a: 1 } })).toEqual({ a: 1 });
    delete (globalThis as Record<string, unknown>).chrome;
    expect(extensionAttributes()).toEqual({ platform: "chrome_extension" });
  });
});
