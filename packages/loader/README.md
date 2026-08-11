# @openeditors/loader

The runtime loader for Open Editor. This package is the **only** code that lands
in your `node_modules` — the editor engine itself is fetched at page load,
verified, and mounted. Nothing of the editor ever touches your disk.

```js
import { createEditor } from '@openeditors/loader';

const editor = await createEditor('#app', {
  endpoint: 'https://delivery.yourdomain.com',
  licenceKey: 'oe_live_…',        // omit for the free tier
  placeholder: 'Start typing…',   // any editor option, forwarded untouched
});
```

## ⚠️ Your CSP must allow `blob:`

```
Content-Security-Policy: script-src 'self' blob:;
```

**This is required, not optional.** The engine is downloaded, hash-verified, and
only then executed — which means it is evaluated from a blob URL rather than a
`<script src>`. We measured every alternative in Chromium, Firefox and WebKit:

| Your CSP | Works? |
|---|---|
| `script-src 'self'` | ❌ |
| `script-src 'self' blob:` | ✅ |
| `script-src 'self' 'unsafe-eval'` | ❌ (and it is the worse directive) |

If your CSP cannot be changed, use the `openeditor-text` npm package instead.
When a CSP does block loading, the error names the exact directive to add.

## What happens when it cannot load

Never a blank box. By default the container gets a **plain, usable textarea**
carrying your `defaultContent` and form field `name`, so someone mid-sentence
keeps writing and the form still submits.

```js
await createEditor('#app', {
  endpoint: '…',
  name: 'body',              // the textarea's form field name
  fallback: 'Editor unavailable — plain text for now.',   // or false to disable
  onError: (err) => report(err),
});
```

## Options

Everything not listed below is forwarded to the editor untouched — including
functions like `onChange` and upload handlers, which are passed by reference and
never serialised. A new editor option needs **no loader release** to be usable.

| Option | Default | |
|---|---|---|
| `endpoint` | — | **Required.** Your delivery API origin |
| `licenceKey` | `null` | Unlocks premium. Absent → free tier, no signup |
| `version` | `null` | Pin a build (a licence-level pin still wins) |
| `plugins` | `'all'` | `[]` for none, or an array of plugin factories |
| `cache` | `true` | `false` for kiosks or strict privacy policies |
| `fallback` | `true` | `false` to disable, or a string to change the message |
| `name` | — | Form field name for the fallback textarea |
| `onError` | — | Called with any load failure |

## Storing images and content

Everything below is your infrastructure — the editor never stores content.
These are ordinary editor options, forwarded untouched through the loader
(including functions, which are passed by reference, never serialised).

```js
await createEditor('#app', {
  endpoint: '…',

  // Images → your API, which decides folder vs database.
  imageUploadUrl: 'https://api.you/upload',
  imageUploadHeaders: { Authorization: `Bearer ${token}` },

  // Content → wherever you like, on every edit.
  onChange: ({ html }) => save(html),
});
```

For **S3/R2 pre-signed uploads, Cloudinary, or any two-step flow** that a
single POST URL cannot express, take the upload over entirely — the file can go
straight to storage without passing through your server:

```js
imageUploadHandler: async (file, { signal, onProgress }) => {
  const { uploadUrl, publicUrl } = await fetch('/api/sign', {
    method: 'POST', body: JSON.stringify({ name: file.name }), signal,
  }).then((r) => r.json());
  await fetch(uploadUrl, { method: 'PUT', body: file, signal });
  onProgress(100);
  return publicUrl;
},
```

`imageUploadHandler` wins over `imageUploadUrl` when both are set. Pass `signal`
to your requests so cancel works, and call `onProgress` so the progress bar
moves. Full reference: [Image uploads](https://openeditor.dev/docs/IMAGE-UPLOAD).

## Caching

The engine is cached in IndexedDB, so a returning visitor mounts with **no
network request for the bundle at all**. Entries are keyed by
`endpoint + version + plan` — never version alone, or an upgraded customer would
keep loading the free bundle — and evicted by least-recent use.

```js
import { clearCache } from '@openeditors/loader';
await clearCache();   // support answer: "try clearing your editor cache"
```

## Framework wrappers

```js
import { OpenEditor } from '@openeditors/loader/react';
import { OpenEditor } from '@openeditors/loader/vue';
import { OpenEditorComponent } from '@openeditors/loader/angular';
```

Each mirrors its `openeditor-text-*` counterpart: uncontrolled by default,
echoes of your own `onChange` never re-enter the editor, and the same reactive
props. One difference matters — **mounting is asynchronous**, so `editor` is
`null` until the engine has downloaded.

```jsx
<OpenEditor
  endpoint="https://delivery.yourdomain.com"
  licenceKey={key}
  value={html}
  onChange={setHtml}
  onLoadError={(err) => report(err)}
/>
```

### Upgrading a live editor

Changing `licenceKey` re-verifies in place. But the **plan** decides which
bundle was downloaded, and a free bundle contains **no premium code at all** —
so a free editor handed a premium licence unlocks nothing. There is nothing to
install. A reload is required.

The editor is **never swapped underneath a live document**. Someone has just
paid and is mid-sentence; re-mounting to fetch a different bundle risks the
worst possible outcome on their first paid transaction. Instead, the loader
shows a small, dismissible prompt and lets them choose the moment:

> **Premium unlocked — reload to activate it.**  [ Reload ]  ×

It never steals focus, announces politely to screen readers, and is opt-out
(`prompt: false`) for hosts with their own design system. **Downgrades never
prompt** — losing a feature is survivable, and interrupting someone's work to
offer them *fewer* features is pure harm; the premium bundle keeps running
until their next natural page load.

A same-plan entitlement change needs no reload at all, and is measured safe:
content, cursor, undo history and typing all survive it untouched.

```jsx
<OpenEditor
  licenceKey={key}
  onLicenceApplied={({ applied, reloadRequired }) => {
    if (reloadRequired) showBanner('Premium unlocked — reload to activate');
  }}
/>
```

Vue emits `licence-applied`; Angular emits `licenceApplied`.

## Privacy

An anonymous install id is stored per browser profile so anonymous traffic can
be rate-limited and usage counted. It is **random** — never derived from your
device, IP, or user agent — and clearing site data resets it. It identifies an
install, not a person.
