# Configuration reference

Everything you can pass to the editor, how to pass it from every framework, and
what each option does. All options on this page are verified against the
editor's actual `DEFAULTS` — if it's documented here, it works.

> **One package:** everything ships as **`openeditor-text`** — the loader, the
> React/Vue/Angular wrappers, and the types. Earlier releases split the wrappers
> into separate packages; from 2.0 they are subpath imports of this one.

## Contents

- [Installation](#installation)
- [Passing configuration](#passing-configuration)
  - [Plain JavaScript](#plain-javascript)
  - [React](#react)
  - [Next.js](#nextjs)
  - [Vue 3](#vue-3)
  - [Angular](#angular)
- [Validation & safety](#validation--safety)
- [Core options](#core-options)
- [Sizing](#sizing)
- [Content & security](#content--security)
- [Toolbar](#toolbar)
- [Paste](#paste)
- [Images & uploads](#images--uploads)
- [Tables](#tables)
- [Typing behavior](#typing-behavior)
- [Insert dialogs & view](#insert-dialogs--view)
- [Callbacks & persistence](#callbacks--persistence)
- [Internationalization](#internationalization-locale)
- [Events](#events)
- [Migrating from Jodit](#migrating-from-jodit)

---

## Installation

One package, whatever your framework:

```bash
npm i openeditor-text
```

The React, Vue and Angular wrappers ship **inside** that package as subpath
imports — there is nothing extra to install:

| Your stack | Import from |
|---|---|
| Plain JavaScript / any framework | `openeditor-text` |
| **React** (and Next.js) | `openeditor-text/react` |
| **Vue 3** | `openeditor-text/vue` |
| **Angular** (≥ 17) | `openeditor-text/angular` |

React, Vue and Angular are **optional** peer dependencies, so you only pull in
the one you already use.

> **Upgrading from 1.x?** The separate `openeditor-text-react`,
> `openeditor-text-vue` and `openeditor-text-angular` packages are no longer
> used — uninstall them and switch to the subpath imports above. See
> [what changed in 2.0](#what-changed-in-20) below.

---

## Passing configuration

### Plain JavaScript

Options are the second argument to `createEditor`:

```js
import { createEditor } from 'openeditor-text';

const editor = await createEditor('#app', {
  endpoint: 'https://your-delivery-host.com',
  theme: 'dark',
  placeholder: 'Write something…',
  maxLength: 5000,
  onChange: ({ html }) => save(html),
});
```

The first argument is a selector string or an `HTMLElement`. The toolbar,
status bar, and all styling are injected by the editor itself.

Two things are new in 2.x:

- **`createEditor` is asynchronous.** Installing this package puts only a small
  loader on disk; the editor itself is downloaded when your page runs, so
  creating one returns a promise.
- **`endpoint` is required** — it is where the editor is downloaded from. You
  get the URL when you sign up, or it is your own server if you self-host.

Everything else on this page is an ordinary editor option and behaves exactly as
it always has.

### React

The wrapper takes the same object via the `config` prop:

```jsx
import { OpenEditor } from 'openeditor-text/react';

<OpenEditor
  value={html}
  onChange={(html) => setHtml(html)}
  config={{ placeholder: 'Write something…', maxLength: 5000 }}
/>
```

**Reactive vs construct-time — the wrapper contract (all three frameworks):**

| Kind | Props | Behavior |
|---|---|---|
| Reactive | `value` (`v-model` / `ngModel`), `readOnly`, `theme`, `direction` | Applied live when they change |
| Construct-time | `config`, `plugins` | Read once at mount. To change them, remount (React: give the component a new `key`) |

```jsx
// Changing a construct-time option = remount with a key:
<OpenEditor key={locale} config={{ locale }} />
```

Controlled usage is caret-safe: the wrapper diffs out echoes of its own
`onChange`, so feeding the same HTML back never moves the cursor.

### Next.js

The module is safe to import on the server; **construction needs a DOM**, so
render it client-side:

```jsx
import dynamic from 'next/dynamic';

const OpenEditor = dynamic(
  () => import('openeditor-text/react').then((m) => m.OpenEditor),
  { ssr: false },
);
```

Then use it exactly as in React above — `config` file + component is the
whole integration.

### Vue 3

```vue
<script setup>
import { ref } from 'vue';
import { OpenEditor } from 'openeditor-text/vue';

const html = ref('<p>Hello</p>');
const config = { placeholder: 'Write something…', maxLength: 5000 };
</script>

<template>
  <OpenEditor v-model="html" :config="config" />
</template>
```

A `useOpenEditor()` composable is also available for bring-your-own-element
setups — see the Vue wrapper's types.

### Angular

Standalone component + `ControlValueAccessor` — works with `[(ngModel)]` and
reactive forms:

```ts
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OpenEditorComponent } from 'openeditor-text/angular';

@Component({
  standalone: true,
  imports: [FormsModule, OpenEditorComponent],
  template: `<open-editor [(ngModel)]="html" [config]="config"></open-editor>`,
})
export class AppComponent {
  html = '<p>Hello</p>';
  config = { placeholder: 'Write something…', maxLength: 5000 };
}
```

`FormControl.disable()` automatically switches the editor to read-only.

---

## Validation & safety

- **Unknown top-level keys are ignored with a console warning**, and the
  warning suggests the closest known key (a misspelling like `readOnly` →
  suggests `readonly`). Nothing throws.
- `__proto__` / `constructor` / `prototype` keys are dropped — the config
  merge is prototype-pollution-safe.
- Only the top level is checked; nested shapes (`autosave.*`, `onChange.*`)
  are intentionally open.

---

## Core options

| Option | Type | Default | Description |
|---|---|---|---|
| `debug` | boolean | `false` | Enable info/warn console logging. |
| `logger` | object \| null | `null` | Custom logger `{ info, warn, error }`. |
| `toolbar` | boolean \| object | `true` | Render the toolbar; object form customizes it (see [Toolbar](#toolbar)). |
| `statusBar` | boolean | `true` | Render the status bar (live word count, char count, cursor line/column). |
| `readonly` | boolean | `false` | Start read-only (content viewable + selectable, editing off). |
| `spellcheck` | boolean | `false` | Native browser spellcheck on the editable. Off by default — it causes layout reflows on every keystroke in Chrome. |
| `autofocus` | boolean | `false` | Focus the editor on mount. |
| `iframe` | boolean | `false` | Render the editable inside a sandboxed iframe (full style isolation from the host page). |
| `direction` | `'ltr'\|'rtl'` | `'ltr'` | Base text direction. |
| `theme` | `'light'\|'dark'\|'minimal'\|'auto'` | `'light'` | Initial theme; `'auto'` follows the OS. See [THEMING.md](./THEMING.md). |

---

## Sizing

| Option | Type | Default | Description |
|---|---|---|---|
| `minHeight` | number (px) | `200` | Minimum editable height. |
| `maxHeight` | number \| null | `null` | Max height before the content area scrolls. |
| `height` | number \| null | `null` | Shorthand — sets both min and max unless they're given explicitly. |

```js
// A fixed 500px editor that scrolls internally (Jodit-style fixed height):
await createEditor('#app', { endpoint, height: 500 });

// Grows from 300px, scrolls after 600px:
await createEditor('#app', { endpoint, minHeight: 300, maxHeight: 600 });
```

---

## Content & security

| Option | Type | Default | Description |
|---|---|---|---|
| `defaultContent` | string (HTML) | `''` | Initial HTML, set at construction (no post-init `setHTML` needed). |
| `placeholder` | string | `'Start typing…'` | Empty-state placeholder. Pass `''` to disable. |
| `sanitize` | boolean | `true` | Sanitize input **and** output HTML. Leave `true` unless you fully trust all content. |
| `allowTags` | string[] \| null | `null` | Extra tags to keep (adds to the built-in safe set) — e.g. custom elements for a CMS. **Cannot re-enable denied tags** (`script`/`iframe`/`object`/`form`/… — the deny-list always wins, with a console warning). |
| `allowAttributes` | object \| null | `null` | Extra attributes per tag, e.g. `{ 'my-note': ['data-kind'] }`. **Cannot enable `on*` handlers or `srcdoc`** (always stripped, with a warning), and URL-sink attributes (`href`/`src`/`action`/…) stay scheme-checked on ANY tag. These guarantees are CI-locked by an adversarial test sweep. |
| `denyTags` | string[] \| null | `null` | Tags to strip even if otherwise allowed (narrows the built-in set). |
| `maxLength` | number \| null | `null` | Max character count; blocks further input and emits `maxLengthExceeded`. |

```js
await createEditor('#app', {
  endpoint,
  defaultContent: '<p>Draft loaded from the server…</p>',
  maxLength: 10000,
  allowTags: ['my-note'],
  allowAttributes: { 'my-note': ['data-kind'] },
});
```

See [SECURITY.md](../SECURITY.md) for the full sanitizer model.

---

## Toolbar

`toolbar` accepts three forms:

```js
toolbar: true                  // default — the full built-in toolbar
toolbar: false                 // no toolbar at all (bring your own UI)
toolbar: { items: [ /* groups */ ] }   // custom layout
```

### Custom layout — `toolbar.items`

`items` is an **array of groups**; each group is an **array of item
descriptors**. Groups render with a separator between them.

An item descriptor is one of:

| Shape | Renders |
|---|---|
| `{ type: 'button', name, command, icon, labelKey }` | A command button |
| `{ type: 'dropdown', name, kind, labelKey }` | A dropdown — `kind`: `heading` \| `fontFamily` \| `fontSize` \| `lineHeight` \| `changeCase` \| `styles` \| `textPartLanguage` |
| `{ type: 'color', name, kind, icon, labelKey }` | A color picker — `kind`: `textColor` \| `bgColor` |
| `{ type: 'listStyle', name, command, icon, labelKey, listTag }` | List button with style flyout (`listTag`: `'ul'` \| `'ol'`) |
| `{ type: 'alignment', name: 'alignment', labelKey: 'alignment' }` | The alignment picker |

A minimal writing toolbar:

```js
await createEditor('#app', {
  endpoint,
  toolbar: {
    items: [
      [
        { type: 'button', name: 'bold',   command: 'bold',   icon: 'bold',   labelKey: 'bold' },
        { type: 'button', name: 'italic', command: 'italic', icon: 'italic', labelKey: 'italic' },
      ],
      [
        { type: 'dropdown', name: 'heading', kind: 'heading', labelKey: 'heading' },
      ],
      [
        { type: 'button', name: 'undo', command: 'undo', icon: 'undo', labelKey: 'undo' },
        { type: 'button', name: 'redo', command: 'redo', icon: 'redo', labelKey: 'redo' },
      ],
    ],
  },
});
```

### The default layout (for copy-paste editing)

The built-in toolbar is these groups, in order — recreate it and remove what
you don't want:

| Group | Item names |
|---|---|
| text | `bold`, `italic`, `underline`, `strikethrough`, `superscript`, `subscript`, `inlineCode`, `removeFormat`, `changeCase` (dropdown), `styles`*, `textPartLanguage`* |
| block | `heading`, `fontFamily`, `fontSize`, `lineHeight` (dropdowns), `blockquote` |
| color | `textColor`, `bgColor` |
| lists + align | `ul`, `ol` (listStyle), `outdent`, `indent`, `alignment` |
| insert | `insertHorizontalRule`, `insertPageBreak` |
| history | `undo`, `redo` |
| view | `fullscreen`, `print` (action buttons), `showBlocks` |

\* `styles` and `textPartLanguage` only render when their config option
(`styles` / `textPartLanguages`) is non-empty.

Plugins (image, link, table, emoji, …) contribute their own toolbar buttons
when installed — you don't list those here.

### Custom buttons

Custom buttons use the **same descriptor as built-ins**, with an inline SVG
icon and optionally your own registered command:

```js
editor.commands.register('shout', {
  execute: (ed) => ed.commands.execute('insertText', 'HEY!'),
});

// in config:
toolbar: {
  items: [
    [{ type: 'button', name: 'shout', command: 'shout',
       icon: '<svg viewBox="0 0 24 24">…</svg>', tooltip: 'Shout' }],
  ],
}
```

---

## Paste

| Option | Type | Default | Description |
|---|---|---|---|
| `askBeforePasteHTML` | boolean | `true` | Prompt Keep / Text / Only on rich HTML paste. |
| `askBeforePasteFromWord` | boolean | `true` | Prompt on Word/Excel paste. |
| `defaultActionOnPaste` | `'keep'\|'text'\|'only'` | `'keep'` | Action when not prompting. |
| `defaultActionOnPasteFromWord` | same \| null | `null` | Word-specific default (`null` → `defaultActionOnPaste`). |
| `pasteStripStyles` | boolean | `true` | Drop leftover inline styles after cleanup promotion. |

```js
// Never prompt; always clean pasted HTML down to canonical tags:
await createEditor('#app', {
  endpoint,
  askBeforePasteHTML: false,
  askBeforePasteFromWord: false,
  defaultActionOnPaste: 'keep',
});
```

Ctrl/Cmd+Shift+V always pastes as plain text.

---

## Images & uploads

> **Connecting uploads to your own API + database?** This table is the reference;
> the step-by-step setup guide (with server examples for Node/Express, Next.js,
> and NestJS, plus auth) lives in **[Image uploads](/docs/IMAGE-UPLOAD)**.

| Option | Type | Default | Description |
|---|---|---|---|
| `imageUploadUrl` | string \| null | `null` | POST endpoint for image uploads. See the contract below. |
| `imageUploadHandler` | `(file,{signal,onProgress})=>url \| {url,width?,height?,sources?}` \| null | `null` | Take over the upload yourself — S3/R2 pre-signed URLs, Cloudinary, or any two-step flow `imageUploadUrl` cannot express. **Wins over `imageUploadUrl`.** See [Image uploads](/docs/IMAGE-UPLOAD#step-7--take-over-the-upload-entirely-s3-cloudinary-pre-signed-urls). |
| `imageUploadHeaders` | object \| `(file) => object` \| null | `null` | Extra request headers — e.g. `{ Authorization: 'Bearer …' }`, an API key, `X-CSRF-Token`. **Never set `Content-Type`** (it would break the multipart boundary; it is ignored). |
| `imageUploadWithCredentials` | boolean | `false` | Send cookies on a cross-origin upload (same-site session auth). |
| `imageUploadFieldName` | string \| null | `null` | Override the multipart field name (default `file`) — e.g. `image`, `upload`. |
| `imageUploadData` | object \| `(file) => object` \| null | `null` | Extra form fields sent with the file (folder id, CSRF token, post id to link the upload in your DB). |
| `imageUploadResponse` | `(json) => url \| {url,sources?}` \| null | `null` | Map a custom server response shape to a URL (Jodit's `process()` equivalent). |
| `imageMaxFileSize` | number | `10485760` | Max upload size in bytes (default 10 MB) — enforced on dialog, drop, and paste. |
| `imageRequireAlt` | boolean | `false` | Require non-empty alt text before an image can be inserted (accessibility). |
| `imageAllowDataUri` | boolean | `false` | Permit `data:` image URIs (security-relevant — off by default). |
| `imageDefaultWidth` | number \| null | `null` | Width applied to inserted images that carry no size. |
| `imageAvailableClasses` | `[{value,label}]` \| null | `null` | Class dropdown in the Image Properties dialog. |
| `imageOpenOnDblClick` | boolean | `true` | Double-click an image opens its properties dialog. |

### The upload contract

When `imageUploadUrl` is set, every inserted file (file picker, drag-and-drop,
clipboard paste) is sent as:

- **Request:** `POST imageUploadUrl`, `multipart/form-data`, file in the
  **`file`** field.
- **Response:** JSON with the hosted URL at the **top level**:

```json
{ "url": "https://cdn.example.com/uploads/photo.webp" }
```

`{ "src": "…" }` is accepted as an alias. Optionally include `sources` to emit
a responsive `<picture>` (the `<img>` stays as fallback):

```json
{
  "url": "https://cdn.example.com/photo.jpg",
  "sources": [
    { "srcset": "https://cdn.example.com/photo.avif", "type": "image/avif" },
    { "srcset": "https://cdn.example.com/photo-800.jpg 800w", "sizes": "100vw" }
  ]
}
```

Every returned URL (including each `srcset`) is scheme-checked with the same
URL policy as any `src` — an unsafe URL rejects the whole upload. The common
nested shape `{ "data": { "url": … } }` (NestJS/Laravel-style) is understood out
of the box. For any other shape, map it with **`imageUploadResponse`** — a
function that receives the parsed JSON and returns the URL string (or
`{ url, sources }`); this is the equivalent of Jodit's `process()` hook. Full
examples are in the [Image uploads guide](/docs/IMAGE-UPLOAD).

**Without `imageUploadUrl`:** local files become `data:` URIs, which are
blocked unless you opt in with `imageAllowDataUri: true`. Inserting by URL
always works.

```js
await createEditor('#app', {
  endpoint,
  imageUploadUrl: 'https://api.example.com/uploads/editor-image',
  imageDefaultWidth: 480,
  imageAvailableClasses: [
    { value: 'img-hero', label: 'Hero' },
    { value: 'img-thumb', label: 'Thumbnail' },
  ],
});
```

(The image plugin itself — resize handles, alignment, properties dialog,
captions — is covered in [PLUGINS.md](./PLUGINS.md).)

---

## Tables

| Option | Type | Default | Description |
|---|---|---|---|
| `tableAvailableClasses` | `[{value,label}]` \| null | `null` | Style presets offered on table insert. |
| `tableDefaultClass` | string \| null | `null` | Class applied to inserted tables when no preset is chosen. |
| `tableDefaultHeaderRow` | boolean | `false` | First row becomes a header on insert. |

---

## Typing behavior

| Option | Type | Default | Description |
|---|---|---|---|
| `autoformat` | boolean | `true` | Markdown-style typing shortcuts (`**bold**`, `# heading`, `- list`, `> quote`, …). `false` disables entirely. |
| `textTransformations` | boolean \| object | `true` | Typing autocorrect: `(c)`→©, `(r)`→®, `(tm)`→™, `1/2`→½-style fractions, `--`→– and `---`→— (on the following space), smart quotes. `false` disables all, or per-group `{ symbols, fractions, dashes, smartQuotes }`. Skipped inside `<code>`/`<pre>`; one undo restores the literal text. |
| `formatPainterSticky` | boolean | `false` | Format painter stays armed until toggled off. |
| `mentions` | `{ source }` \| null | `null` | `@mentions` data provider: `{ source: (query) => Promise<[{id,label}]> }`. Used only if the mentions plugin is installed. |

---

## Insert dialogs & view

| Option | Type | Default | Description |
|---|---|---|---|
| `specialCharacters` | `[{ch,label}]` \| string[] \| null | `null` | Special-chars grid (`null` = built-in set). |
| `emojis` | `[{ch,label,cat,keywords}]` \| null | `null` | Emoji grid (`null` = built-in set). |
| `codeBlockLanguages` | `[{value,label}]` \| null | `null` | Code-block language selector (`null` = built-in). |
| `sourceModeBeautify` | boolean | `true` | Pretty-print HTML in source view. |
| `sourceModeHighlight` | boolean | `true` | Syntax-highlight the source view (scroll-synced overlay). `false` = plain textarea. |
| `inlineToolbar` | boolean | `false` | Floating selection toolbar (bold/italic/underline/quote above a selection). |
| `blockquoteToolbar` | boolean | `true` | Blockquote style toolbar. |
| `styles` | `[{label, element?, classes}]` \| null | `null` | Named style presets → a toolbar Styles dropdown (rendered only when non-empty). Block `element` (p/h1–h6/blockquote/pre) converts the block + applies classes; element absent/`'span'` wraps the selection in a classed span. |
| `textPartLanguages` | `[{code, label?}]` \| null | `null` | Language list → a toolbar Language dropdown. Wraps the selection in `<span lang>` (auto `dir="rtl"` for RTL scripts) — WCAG 3.1.2 Language of Parts. |
| `warnOnUnload` | boolean | `false` | Native browser prompt before closing a tab with unsaved changes (`isDirty`). Opt-in. |

---

## Callbacks & persistence

**`onChange`** — one of:

- a function `({ html, text }) => {}` — called on every (debounced) change;
- `{ handler, debounce }` — same, with a custom debounce (ms);
- `{ debounce }` — event-only (listen via `editor.on('onChange', …)`).

The `onChange` **event** always fires regardless of this option. In the
framework wrappers you use the `onChange` prop / `v-model` / `ngModel`
instead — don't double-wire both.

**`autosave`** — `null` (off) or:

```js
autosave: {
  storage: 'localStorage',   // only 'localStorage' is supported
  key: 'oe-draft',           // storage key (default 'oe-draft')
  interval: 30000,           // save interval in ms (default 30000)
  restore: true,             // restore a saved draft on load (default true)
}
```

Emits `autosaveSaved` / `autosaveRestored` / `autosaveFailed` /
`autosaveDraftSkipped`.

---

## Internationalization (`locale`)

Open Editor ships a built-in **English** label set plus **four complete locale
packs** — Spanish, French, German, and Arabic — and a bring-your-own-locale
mechanism. Whatever you pass is merged over the English defaults, so partial
maps are fine (anything you omit falls back to English).

**`locale` takes a translation map** — an object whose keys are label names.
Whatever you pass is merged over English, so partial maps are fine:

```js
const editor = await createEditor('#app', {
  endpoint,
  locale: {
    bold: 'Gras',
    italic: 'Italique',
    insertLink: 'Insérer un lien',
    // …only the keys you translate; the rest stay English
  },
});
```

For a right-to-left language, pair the map with `direction`:

```js
const editor = await createEditor('#app', {
  endpoint,
  locale: myArabicLabels,
  direction: 'rtl',
});
```

> **Changed in 2.0.** In 1.x you imported a pack — `import { localeAr } from
> 'openeditor-text'`. That is not possible now: the engine is downloaded at
> runtime, so there is nothing on disk to import from, and
> `openeditor-text/locales/*` no longer resolves.
>
> A **string** locale code (`locale: 'es'`) is accepted but currently falls back
> to English — only an object map changes the labels. If you were relying on a
> shipped pack, supply the map yourself for now.

The status bar uses CJK-aware word counting.

---

## Events

Configuration callbacks cover the common cases; everything else is on the
frozen event map via `editor.on(name, handler)` (also `once` / `off`):

```js
editor.on('ready', () => console.log('editor is live'));
editor.on('maxLengthExceeded', ({ maxLength }) => toast(`Limit: ${maxLength}`));
```

| Group | Events |
|---|---|
| Content | `beforeChange`*, `onChange`, `beforeSetHTML`*, `setHTML`, `reset`, `maxLengthExceeded` |
| Focus & selection | `focus`, `blur`, `selectionChange` |
| State | `stateChange`, `readOnlyChange`, `directionChange`, `themeChange` |
| Commands | `beforeCommand`*, `afterCommand`, `undo`, `redo` |
| Paste | `beforePaste`*, `afterPaste` |
| Lifecycle | `beforeInit`, `init`, `afterInit`, `ready`, `beforeDestroy`, `destroy` |
| Autosave | `autosaveSaved`, `autosaveRestored`, `autosaveFailed`, `autosaveDraftSkipped` |
| Plugins & errors | `pluginInstalled`, `pluginUninstalled`, `error` |

\* Cancelable — the payload has `preventDefault()`.

In the wrappers, the common ones are props/outputs: React
`onChange/onReady/onFocus/onBlur/onError`; Vue emits
`change/ready/focus/blur/error`; Angular outputs
`changed/ready/focused/blurred/errored`. For anything else, grab the instance
(ref / template ref / `@ViewChild`) and call `editor.on(…)`.

---

## Migrating from Jodit

The most-used Jodit options and their equivalents here:

| Jodit | Open Editor | Note |
|---|---|---|
| `height` / `minHeight` / `maxHeight` | same names | `height` sets min+max together |
| `placeholder` | `placeholder` | `''` disables |
| `readonly` | `readonly` | |
| `toolbar: false` | `toolbar: false` | |
| `buttons: [...]` | `toolbar: { items: [...] }` | Groups of descriptors instead of a flat name list — see [Toolbar](#toolbar) |
| `toolbarAdaptive` | — | Toolbar overflow-scrolls on mobile automatically |
| `enter: 'div'` | — | Not configurable: blocks are always canonical `<p>` |
| `spellcheck` | `spellcheck` | |
| `iframe` | `iframe` | |
| `direction` | `direction` | |
| `language` | `locale` | Packs: es/fr/de/ar ship in the box |
| `theme` | `theme` | `light` / `dark` / `minimal` / `auto` |
| `askBeforePasteHTML` / `askBeforePasteFromWord` | same names | |
| `defaultActionOnPaste: 'insert_clear_html'` | `defaultActionOnPaste: 'keep'` | Values: `keep` / `text` / `only` |
| `showCharsCounter` / `showWordsCounter` | `statusBar` | Both counters are built into the status bar |
| `uploader.url` | `imageUploadUrl` | Multipart `file` field; response `{ "url": … }` — no `process()` hook, flat response required |
| `uploader.insertImageAsBase64URI` | `imageAllowDataUri` | Off by default (security) |
| `disablePlugins` | — | Inverse model: plugins are **opt-in installs**, nothing to disable |
| `events: { … }` | `onChange` config + `editor.on(…)` | See [Events](#events) |
| `style: { … }` | themes / CSS custom properties | See [THEMING.md](./THEMING.md) |

Two habits you can drop: wiring both `onBlur` **and** `onChange` to capture
content (here `onChange` alone is reliable and caret-safe), and
`saveSelectionOnBlur`-style flags (selection save/restore across toolbar
clicks is built in).

---

**More:** [THEMING.md](./THEMING.md) · [THEME-TOKENS.md](./THEME-TOKENS.md) ·
[PLUGINS.md](./PLUGINS.md) · [ACCESSIBILITY.md](./ACCESSIBILITY.md) ·
[SECURITY.md](../SECURITY.md) · [ERROR-REPORTING.md](./ERROR-REPORTING.md)
