# Open Editor — `openeditor-text`

**Open Editor** — a modern, zero-dependency rich text editor in pure JavaScript.
No framework required, no license key, no telemetry. MIT-licensed.

> **Stable.** Fully gated in CI: 2,060 unit + cross-browser e2e tests across
> Chromium/Firefox/WebKit, XSS-, size-, accessibility- (axe, WCAG 2.1 AA),
> and API-contract-gated. Ships with a WCAG conformance statement, a plugin
> authoring guide, and four UI locale packs (es/fr/de/ar incl. RTL).

## Why this editor

- **Zero runtime dependencies** — one package, nothing else lands in your tree.
- **Security-first** — input *and* output pass a hardened sanitizer (script/URL-scheme/
  mXSS vectors, sandboxed provider-allowlisted embeds). XSS-tested in CI.
- **Frozen 1.0 API** — the public surface is contract-tested; it does not drift.
- **Tree-shakeable** — ships as an ESM module tree: import only the editor and the
  plugins you use. Core ≈ 61KB min+gz; everything ≈ 112KB min+gz (smaller than
  Jodit or CKEditor).
- **TypeScript-native** — full hand-authored declarations, typed event payloads.
- **Modern UX built-in, free** — slash commands, markdown-as-you-type, @mentions,
  to-do lists, block drag-reorder, source view with syntax highlighting, find &
  replace (whole-word), tables with per-cell properties, responsive `<picture>`
  image output, dark/minimal/auto themes, RTL, autosave with crash recovery —
  plus (1.1.0): change case, typing autocorrect, page break, show blocks, Alt+0
  shortcut reference, `:emoji` autocomplete, bookmarks, style presets,
  text-part language, and `getMarkdown()` export.

## Install

```bash
npm install openeditor-text
```

## Use

```js
import { OpenEditor } from 'openeditor-text';

const editor = new OpenEditor('#app', {
  placeholder: 'Start typing…',
  theme: 'auto',
});

editor.setHTML('<p>Hello <strong>world</strong></p>');
editor.on('onChange', ({ html }) => save(html));
```

All chrome and styling are injected by the editor (CSP-safe). For SSR or
strict-CSP setups a static stylesheet ships too:

```js
import 'openeditor-text/styles';
```

### Plugins (opt-in, tree-shakeable)

```js
import {
  OpenEditor,
  createImagePlugin,
  createLinkPlugin,
  createTablePlugin,
  createTodoListPlugin,
} from 'openeditor-text';

const editor = new OpenEditor('#app');
editor.plugins.install(createImagePlugin());
editor.plugins.install(createLinkPlugin());
editor.plugins.install(createTablePlugin());
editor.plugins.install(createTodoListPlugin());
```

19 plugins ship in the box: bookmarks (named anchors), image (upload/resize/properties/responsive
`<picture>`), link, table, media embed, find & replace, source view, code
block, special characters, emoji, format painter, preview, spellcheck toggle,
resizable editor, slash commands, markdown autoformat, @mentions, block
drag-reorder, to-do lists.

### Script tag (UMD)

```html
<script src="https://unpkg.com/openeditor-text"></script>
<script>
  const { OpenEditor } = window.OpenEditor;
  new OpenEditor('#app');
</script>
```

## TypeScript

Full declarations ship in the package — typed config, typed event payloads
(`editor.on('onChange', ({ html, text }) => …)`), plugin and command
interfaces. No `@types/*` package needed.

## Distribution note

This package ships production (minified) builds only. The API is fully
documented via the bundled TypeScript declarations, and the code is
MIT-licensed.

## License

MIT — no license key, no usage metering, no paid tiers for anything in this
package. Premium extensions (collaboration, track changes, exports…) will ship
later as separate, clearly-scoped premium packages in the `openeditors` family
and never inside this one.
