# Configuration reference

Pass options as the second argument to the constructor:

```js
const editor = new OpenEditor('#app', {
  theme: 'dark',
  placeholder: 'Write something…',
  maxLength: 5000,
  onChange: ({ html }) => save(html),
});
```

Unknown top-level keys are **ignored with a warning** (a misspelling like
`readOnly` → suggests `readonly`). Nothing throws. `__proto__` / `constructor` /
`prototype` keys are dropped for safety.

## Core

| Option | Type | Default | Description |
|---|---|---|---|
| `debug` | boolean | `false` | Enable info/warn console logging. |
| `logger` | object \| null | `null` | Custom logger `{ info, warn, error }`. |
| `toolbar` | boolean | `true` | Render the toolbar. |
| `statusBar` | boolean | `true` | Render the status bar. |
| `readonly` | boolean | `false` | Start read-only (content viewable + selectable, editing off). |
| `spellcheck` | boolean | `false` | Native browser spellcheck on the editable. |
| `autofocus` | boolean | `false` | Focus the editor on mount. |
| `iframe` | boolean | `false` | Render the editable inside a sandboxed iframe (style isolation). |
| `direction` | `'ltr'\|'rtl'` | `'ltr'` | Base text direction. |
| `theme` | `'light'\|'dark'\|'minimal'\|'auto'` | `'light'` | Initial theme (see [THEMING.md](./THEMING.md)). |

## Sizing

| Option | Type | Default | Description |
|---|---|---|---|
| `minHeight` | number (px) | `200` | Minimum editable height. |
| `maxHeight` | number \| null | `null` | Max height before scrolling. |
| `height` | number \| null | `null` | Shorthand — sets both min and max unless they're given explicitly. |

## Content & security

| Option | Type | Default | Description |
|---|---|---|---|
| `defaultContent` | string (HTML) | `''` | Initial HTML. |
| `placeholder` | string | `'Start typing…'` | Empty-state placeholder. |
| `sanitize` | boolean | `true` | Sanitize input **and** output HTML. Leave `true` unless you fully trust all content. |
| `allowTags` | string[] \| null | `null` | Extra tags to keep (adds to the built-in safe set) — e.g. custom elements for a CMS. **Cannot re-enable denied tags** (`script`/`iframe`/`object`/`form`/… — the deny-list always wins, with a console warning). |
| `allowAttributes` | object \| null | `null` | Extra attributes per tag, e.g. `{ 'my-note': ['data-kind'] }`. **Cannot enable `on*` handlers or `srcdoc`** (always stripped, with a warning), and URL-sink attributes (`href`/`src`/`action`/…) stay scheme-checked on ANY tag. These guarantees are CI-locked by an adversarial test sweep (17.5.11). |
| `denyTags` | string[] \| null | `null` | Tags to strip even if otherwise allowed (narrows the built-in set). |
| `maxLength` | number \| null | `null` | Max character count; blocks further input and emits `maxLengthExceeded`. |

## Paste (Phase 12)

| Option | Type | Default | Description |
|---|---|---|---|
| `askBeforePasteHTML` | boolean | `true` | Prompt Keep/Text/Only on rich HTML paste. |
| `askBeforePasteFromWord` | boolean | `true` | Prompt on Word/Excel paste. |
| `defaultActionOnPaste` | `'keep'\|'text'\|'only'` | `'keep'` | Action when not prompting. |
| `defaultActionOnPasteFromWord` | same \| null | `null` | Word-specific default (`null` → `defaultActionOnPaste`). |
| `pasteStripStyles` | boolean | `true` | Drop leftover inline styles after promotion. |

## Feature options

| Option | Type | Default | Description |
|---|---|---|---|
| `imageUploadUrl` | string \| null | `null` | POST endpoint for image uploads (multipart `file` field). When unset, local files become `data:` URIs (blocked unless `imageAllowDataUri`). **Response contract:** JSON `{ "url": "https://…" }` (or `src`). Optionally include `"sources": [{ "srcset", "media"?, "type"?, "sizes"? }]` to emit a responsive `<picture>` — the `<img>` stays as fallback, and every `srcset` is scheme-checked with the same URL policy as `<img srcset>`; an unsafe response URL rejects the whole upload. |
| `imageAllowDataUri` | boolean | `false` | Permit `data:` image URIs (security-relevant). |
| `imageDefaultWidth` | number \| null | `null` | Width applied to inserted images with no size. |
| `imageAvailableClasses` | `[{value,label}]` \| null | `null` | Class dropdown in Image Properties. |
| `imageOpenOnDblClick` | boolean | `true` | Double-click an image opens its properties dialog. |
| `tableAvailableClasses` | `[{value,label}]` \| null | `null` | Style presets on table insert. |
| `tableDefaultClass` | string \| null | `null` | Class applied to inserted tables. |
| `tableDefaultHeaderRow` | boolean | `false` | First row becomes a header on insert. |
| `specialCharacters` | `[{ch,label}]` \| string[] \| null | `null` | Special-chars grid (null = built-in set). |
| `emojis` | `[{ch,label,cat,keywords}]` \| null | `null` | Emoji grid (null = built-in set). |
| `formatPainterSticky` | boolean | `false` | Format painter stays armed until toggled off. |
| `codeBlockLanguages` | `[{value,label}]` \| null | `null` | Code-block language selector (null = built-in). |
| `sourceModeBeautify` | boolean | `true` | Pretty-print HTML in source view. |
| `sourceModeHighlight` | boolean | `true` | Syntax-highlight the source view (a scroll-synced colored overlay behind the editable textarea). Set `false` for a plain textarea. |
| `inlineToolbar` | boolean | `false` | Show the floating selection toolbar. |
| `blockquoteToolbar` | boolean | `true` | Show the blockquote style toolbar. |
| `locale` | string \| object | `'en'` | Locale code or a `{ key: string }` translation map (partial maps merge over EN). **Four complete packs ship in the box (17.11):** `import { localeEs, localeFr, localeDe, localeAr } from '@open-editor-hq/core'` or per-language subpaths `import { ar } from '@open-editor-hq/core/locales/ar'` — pass as `{ locale: localeAr, direction: 'rtl' }`. Unused packs tree-shake away. |
| `warnOnUnload` | boolean | `false` | Prompt (native browser dialog) before closing a tab with unsaved changes (`isDirty`). Opt-in. |
| `textTransformations` | boolean \| object | `true` | Typing autocorrect (17.5.2): `(c)`→©, `(r)`→®, `(tm)`→™, `1/2`→½-style fractions (on the following space), `--`→– and `---`→— (on the following space), smart quotes. `false` disables all; or per-group `{ symbols, fractions, dashes, smartQuotes }`. Skipped inside `<code>`/`<pre>`. One undo restores the literal typed text. |
| `autoformat` | boolean | `true` | Markdown-style typing shortcuts (`**bold**`, `# heading`, `- list`, `> quote`, etc. — Phase 16.6.2). Set `false` to disable entirely. |
| `mentions` | `{ source }` \| `null` | `null` | `@mentions` data provider: `{ source: (query) => Promise<[{id,label}]> } `. Only used if the mentions plugin is installed; `null` means the popup stays empty (Phase 16.6.3). |

## Callbacks & persistence

**`onChange`** — one of:
- a function `({ html, text }) => {}` — called on every (debounced) change;
- `{ handler, debounce }` — same, with a custom debounce (ms);
- `{ debounce }` — event-only (listen via `editor.on('onChange', …)`).

The `onChange` **event** always fires regardless of this option.

**`autosave`** — `null` (off) or:

```js
autosave: {
  storage: 'localStorage',   // only 'localStorage' is supported
  key: 'oe-draft',           // storage key (default 'oe-draft')
  interval: 30000,           // save interval in ms (default 30000)
  restore: true,             // restore a saved draft on load (default true)
}
```

Emits `autosaveSaved` / `autosaveRestored` / `autosaveFailed` / `autosaveDraftSkipped`.

## Internationalization (`locale`)

Open Editor ships with a built-in **English** label set and a
**bring-your-own-locale** mechanism — you supply a translation map and the
editor merges it over the English defaults, so you only override the keys you
care about (anything you omit falls back to English, and any unknown key falls
back to the key name itself).

```js
// Full or partial override — merged over the built-in EN labels.
const editor = new OpenEditor('#app', {
  locale: {
    bold: 'Gras',
    italic: 'Italique',
    insertLink: 'Insérer un lien',
    // …only the keys you translate; the rest stay English
  },
});
```

Passing a string (e.g. `locale: 'en'`) selects the built-in set. The label keys
are stable and documented by the built-in `EN_LOCALE` export.

**Shipped locale packs (17.11):** complete translations for Spanish, French,
German, and Arabic ship in the package — tree-shaken away unless imported:

```js
import { OpenEditor, localeAr } from '@open-editor-hq/core';
// or per-language subpath: import { ar } from '@open-editor-hq/core/locales/ar';

const editor = new OpenEditor('#app', {
  locale: localeAr,
  direction: 'rtl',      // pair Arabic (or Hebrew maps) with RTL
});
```

Every pack covers the full key set (CI-enforced lockstep with `EN_LOCALE`, so
a new UI string can never silently ship untranslated). Translations are
community-sourced; native-speaker review PRs are welcome.

> Only English is bundled today. A translated locale is a plain object you
> provide; there is no separate locale package to install.
