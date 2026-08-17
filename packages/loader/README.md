# Open Editor

A rich text editor for the web. `npm install` puts a small loader in your
`node_modules` — the editor itself is downloaded and mounted when your page
loads, so buying a licence upgrades your users on their next refresh with no
reinstall and no redeploy.

[Live demo](https://open-editor-text-web.vercel.app/demo) ·
[Docs](https://open-editor-text-web.vercel.app/docs) ·
[Pricing](https://open-editor-text-web.vercel.app/pricing)

## Installation

```bash
npm install openeditor-text
```

## Usage

```js
import { createEditor } from 'openeditor-text';

const editor = await createEditor('#editor', {
  endpoint: 'https://your-delivery-host.com',
});
```

That is the whole setup. `endpoint` is the one required option — the address the
editor is downloaded from, given to you when you sign up (or your own server if
you self-host). Everything else is optional.

### React

```jsx
import { useState } from 'react';
import { OpenEditor } from 'openeditor-text/react';

function App() {
  const [content, setContent] = useState('<p>Hello world</p>');

  return (
    <OpenEditor
      endpoint="https://your-delivery-host.com"
      value={content}
      onChange={setContent}
    />
  );
}
```

### Vue

```vue
<script setup>
import { ref } from 'vue';
import { OpenEditor } from 'openeditor-text/vue';

const content = ref('<p>Hello world</p>');
</script>

<template>
  <OpenEditor endpoint="https://your-delivery-host.com" v-model="content" />
</template>
```

### Angular

```ts
import { OpenEditorComponent } from 'openeditor-text/angular';

@Component({
  standalone: true,
  imports: [OpenEditorComponent, FormsModule],
  template: `
    <open-editor
      endpoint="https://your-delivery-host.com"
      [(ngModel)]="content"
    />
  `,
})
export class AppComponent {
  content = '<p>Hello world</p>';
}
```

React, Vue and Angular are optional peer dependencies — you only need the one
you use.

## Licence keys

**The free tier needs no key** — no signup, no account, no card.

When you buy a plan, pass the key you were emailed:

```js
const editor = await createEditor('#editor', {
  endpoint: 'https://your-delivery-host.com',
  licenceKey: 'eyJhbGciOiJFUzI1NiIs…',
});
```

The same `licenceKey` prop works in React, Vue and Angular. (`licenseKey` is
accepted too, so either spelling is fine.)

Keys are checked by the server on every page load and are tied to the domains
you registered. If a key is expired, revoked, or used on a domain you did not
register, the editor still loads on the free tier — your users get a working
editor, never a blank page.

### Upgrading a live editor

`applyLicence` re-verifies a key in place:

```js
import { applyLicence } from 'openeditor-text';

await applyLicence(editor, newKey, { endpoint });
```

If the new key only changes *which* features are granted, it applies instantly —
content, cursor and undo history all survive.

If it changes the **plan**, a reload is needed: the free build contains no
premium code, so there is nothing to switch on. Rather than re-mounting the
editor under someone who is mid-sentence, the loader shows a small dismissible
prompt and lets them pick the moment:

> **Premium unlocked — reload to activate it.**  [ Reload ]  ×

Pass `prompt: false` to suppress it and handle the reload yourself. Downgrades
never prompt — the premium bundle keeps running until the next natural page load.

### Buying premium from inside the editor

Customers can upgrade without pasting anything. Show them their editor ID:

```js
import { showInstallId } from 'openeditor-text';

// Put this behind your own "Upgrade" button — it is not rendered automatically.
showInstallId(document.querySelector('#upgrade-panel'));
```

They give that ID at checkout, and the next load of that same browser comes back
premium — the key is delivered automatically and remembered across reloads.
`getInstallId()` returns the raw value if you prefer your own markup.

The handover happens exactly once and then expires, so a leaked log line cannot
be replayed to steal the licence. If the browser blocks site storage (private
mode, sandboxed iframe) there is no ID, and `showInstallId()` says so plainly —
those customers paste the emailed key instead.

## Image uploads

Give the editor somewhere to POST files and the toolbar button, drag-and-drop
and paste-from-clipboard all start working:

```js
const editor = await createEditor('#editor', {
  endpoint: 'https://your-delivery-host.com',
  imageUploadUrl: '/api/uploads',
});
```

Your endpoint receives the file as multipart field `file` and replies with JSON:

```json
{ "url": "https://cdn.example.com/img/abc.jpg" }
```

That is the whole contract. For authenticated backends add
`imageUploadHeaders`, `imageUploadWithCredentials`, `imageUploadFieldName` or
`imageUploadData`; for S3, R2 or Cloudinary pre-signed flows, `imageUploadHandler`
lets you take over the upload entirely. Uploads are capped at 10 MB by default.

Full reference: [image upload docs](https://open-editor-text-web.vercel.app/docs/IMAGE-UPLOAD).

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `endpoint` | `string` | — | **Required.** Where the editor is downloaded from. |
| `licenceKey` | `string` | — | Unlocks paid features. Omit for the free tier. |
| `imageUploadUrl` | `string` | — | Where uploaded images are POSTed. |
| `plugins` | `'all' \| array` | `'all'` | Which plugins to install after mount. |
| `version` | `string` | — | Pin a specific engine version. |
| `cache` | `boolean` | `true` | Cache the engine in IndexedDB between visits. |

Any other option is passed straight to the editor — `placeholder`, `minHeight`,
`theme`, `toolbar`, and the rest. See the
[configuration docs](https://open-editor-text-web.vercel.app/docs/CONFIG).

## Content security policy

The engine runs from a `blob:` URL, so your CSP must allow it:

```
script-src 'self' blob:;
connect-src 'self' https://your-delivery-host.com;
```

Without `blob:` the editor will not start, and says so in the console.

## Good to know

**If the network fails**, the loader drops a plain `<textarea>` into your
container with the same `name` and `id` a form expects — so your users keep
writing and the form still submits.

**Returning visitors download nothing.** The engine is cached in IndexedDB after
the first visit; entitlements are still re-checked on every page load. Call
`clearCache()` to clear it.

**Privacy:** a random install id is stored per browser so anonymous traffic can
be rate-limited. It is never derived from your device, IP or user agent, and
identifies an install rather than a person. Your document content never leaves
the browser.

## Licence

[MIT](https://github.com/ami130/open-editor/blob/main/LICENSE).
