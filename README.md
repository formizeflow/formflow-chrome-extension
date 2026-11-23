# @formizeflow/chrome-extension

[![CI](https://github.com/formizeflow/formflow-chrome-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/formizeflow/formflow-chrome-extension/actions/workflows/ci.yml)

FormFlow forms in browser extensions (Manifest V3: Chrome, Edge, Brave, Opera, and Firefox through `browser.*`).

- A form inside your popup, side panel, options page or new-tab page.
- A welcome or onboarding form that opens once on install.
- An uninstall survey: Chrome opens it when someone removes the extension.
- Onboarding A/B tests with a cached decision, so a slow network never blocks the extension.

No remote code: the form loads in an iframe, which Manifest V3 allows. Everything this package runs is bundled into your extension.

```
npm i @formizeflow/chrome-extension
```

## A form in an extension page

```ts
// popup.ts, sidepanel.ts or options.ts
import { mountForm } from "@formizeflow/chrome-extension";

mountForm(document.getElementById("form")!, {
  slug: "extension-feedback",
  uid: currentUser?.id,
  onComplete: () => window.close(),
});
```

`extension_version`, `extension_id`, `platform` (`chrome_extension`) and `locale` are sent as attributes for targeting. Pass `autoAttributes: false` to turn that off, or `attributes` to add your own (yours win).

Without the extension's origin on the form's allowed embed origins, the form still sends every event, but without submission ids or answers. To receive those, add `chrome-extension://<your extension id>` to the form's **Embed origins** (`settings.embedOrigins`).

## Welcome on install and uninstall survey

```ts
// background.ts (the service worker), at the top level so it runs on every start
import { welcomeOnInstall, setUninstallSurvey } from "@formizeflow/chrome-extension";

welcomeOnInstall({ slug: "welcome" });            // add onUpdate: true to also show it after updates
void setUninstallSurvey({ slug: "why-uninstall" }); // call again after sign-in with { uid } to link the answer
```

The welcome form gets hidden fields `install_reason` and, after an update, `previous_version`. Create them in the form to store them. Chrome caps the uninstall address at 1023 characters, so attributes are dropped first and then hidden fields if it would be longer.

Neither needs a manifest permission.

## Onboarding A/B tests

```ts
import { decide, mountForm } from "@formizeflow/chrome-extension";

const d = await decide({ entry: "extension-onboarding", uid, firstRunOnly: true }).catch(() => null);
if (d?.show && d.slug) mountForm(el, { slug: d.slug, variant: d.variantId ?? undefined, uid });
```

Add the `"storage"` permission to cache the decision in `chrome.storage.local`. When the network fails, the cached decision comes back with `fromCache: true`. With no cache, `decide` throws, so catch it and carry on. The public API allows any origin, so no `host_permissions` are needed.

## Signed uids

A uid in a URL can be forged. If a test or form relies on who the person is, have **your server** sign the uid with the workspace identity secret, then pass `uidSignature`. Never put the secret or an API key in the extension: anyone who installs it can read its code.

## Content scripts

Prefer an extension page (the side panel is ideal) over injecting the iframe into websites. A site's own Content Security Policy (`frame-src`) can block the frame there.

## API

| Export | What it does |
| --- | --- |
| `mountForm(el, options)` | Iframe in an extension page; returns `{ iframe, destroy }`. Callbacks: `onReady`, `onComplete`, `onSkip`, `onClose`, `onRedirect` (default: open http(s) in a new tab), `onEvent`. |
| `openFormTab(options)` | The full-page form in a new tab. Works from the service worker. |
| `welcomeOnInstall(options)` | Opens the form once on install (and on update with `onUpdate: true`). |
| `setUninstallSurvey(options)` | Sets the uninstall URL to the form; returns the address. |
| `decide(options)` | Onboarding decision with a `chrome.storage.local` cache. |
| `embedUrl`, `pageUrl`, `readEvent`, `extensionAttributes` | The building blocks, for your own UI. |

Options: `slug`, `baseUrl` (default `https://formize.net`), `uid`, `uidSignature`, `variant`, `locale`, `hidden`, `prefill`, `attributes`, `autoAttributes`, `consent`, `skippable`, `showClose`, `test`, `resume`, `appearance` (`colorScheme`, `accent`, `fontFamily`).
