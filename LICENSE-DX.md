# Licensing DX — "paste one key" (Phase 2)

The whole promise: **free = one install + one config; premium = the same, plus
one `licenseKey`.** No second package, no manual premium wiring, no async
`.create()`. This is the Phase-2 developer-experience contract across the core
(vanilla) editor and all three framework wrappers.

## The contract

- **Free tier** works on install with no key — exactly the same call you'd write
  today. All free features; premium is denied (fail-closed default).
- **Premium** = add one `licenseKey` (+ your published `licenseKeys` public key).
  The editor verifies it OFFLINE inside the package and unlocks exactly the
  purchased premium — no `@openeditor-premium` install, no host wiring.
- **Reactive**: change `licenseKey` (or `licenseKeys`) after mount and premium
  re-verifies IN PLACE (no remount, no content loss) — a license fetched async or
  entered by the user just works. Same editor instance throughout.
  - *Upgrade* (new/wider key) turns premium on immediately. *Clearing* the key
    (falsy) revokes access at the gate — premium features stop working right
    away — but an already-loaded premium plugin instance is not torn down in
    place; a full removal needs a remount. So "clear" = revoke access, not
    unload code.
- **Observable**: `licenseError` (bad key / wrong domain / expired) and
  `premiumReady` (premium finished its async load, with the installed list) are
  first-class events/callbacks — failure is never silent.

## Vanilla (core)

```js
import { OpenEditor } from 'openeditor-text';

// Free
const editor = new OpenEditor('#el', { placeholder: 'Write…' });

// Premium — one extra field
const editor = new OpenEditor('#el', {
  placeholder: 'Write…',
  licenseKey: 'eyJ…',           // the token your customer pasted
  licenseKeys: [{ kid, jwk }],  // your published public key, embedded at build
});
editor.on('premiumReady', ({ installed }) => {/* premium ready */});
editor.on('licenseError', ({ reason }) => {/* show a nudge */});
// Runtime change (reactive, in place):
await editor.setLicenseKey(newToken);
```

## React

```jsx
// Free
<OpenEditor />
// Premium — one prop
<OpenEditor
  licenseKey={token}
  licenseKeys={keys}
  onPremiumReady={({ installed }) => {}}
  onLicenseError={({ reason }) => {}}
/>
// Reactive: change the `licenseKey` prop → re-verifies in place, no remount.
```

## Vue

```vue
<!-- Free -->
<OpenEditor />
<!-- Premium — one prop -->
<OpenEditor
  :license-key="token"
  :license-keys="keys"
  @premium-ready="onReady"
  @license-error="onError"
/>
<!-- Reactive: bind :license-key to a ref → re-verifies in place, no remount. -->
```

## Angular

```html
<!-- Free -->
<open-editor></open-editor>
<!-- Premium — one input -->
<open-editor
  [licenseKey]="token"
  [licenseKeys]="keys"
  (premiumReady)="onReady($event)"
  (licenseError)="onError($event)">
</open-editor>
<!-- Reactive: bind [licenseKey] → ngOnChanges re-verifies in place, no recreate. -->
```

## Side-by-side vs the market

| | Free integration | Add premium | Reactive key |
|---|---|---|---|
| **Open Editor** | `new OpenEditor(el, {})` | + one `licenseKey` field | ✅ in place, no remount |
| Jodit | `new Jodit(el, {})` | license key in config | (n/a — no premium-plugin split) |
| CKEditor 5 | build/import + config | install premium **packages** + license key | remount |
| TinyMCE (self-host) | script + `tinymce.init({})` | plugins list + `license_key` | re-init |

Open Editor matches Jodit's one-object simplicity for the free case, and adds
premium with a **single field** — no separate premium package to install (the
CKEditor path) and no re-init (the TinyMCE path). The reactive in-place re-verify
is the differentiator: a key that arrives after mount unlocks premium without
throwing away the user's document.

## The honest ceiling (same for every browser editor)

The pasted key is verified **offline in the browser** — so it is a strong
deterrent + licensing/EULA boundary, not unbreakable DRM (a determined user with
the bundle can patch the client). Non-customers still get nothing premium
(fail-closed default), buyers get only what they bought, and the highest-value
logic (AI) runs server-side where it is never shipped. See `SECURITY.md`.
