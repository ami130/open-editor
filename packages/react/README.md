# Open Editor for React (`openeditor-text-react`)

The official React wrapper for **Open Editor** — a zero-dependency, security-first
rich text editor. ~61 KB gzipped core, 2,800+ tests, no license keys.

- **Caret-safe by design** — typing never re-enters `setHTML()`, so the cursor
  never jumps (the classic rich-text-wrapper bug, solved at the wrapper level).
- **StrictMode-safe** — mount/unmount cycles are fully idempotent.
- **SSR-safe to import** — works with Next.js (render client-side, see below).
- **Zero build transforms** — the package ships plain JS, no JSX compilation needed.
- **TypeScript-first** — full typings included, reused from the core (no forks).

---

## Requirements

| Peer dependency | Version |
|---|---|
| `react` | ≥ 18 |
| `openeditor-text` | ≥ 1.1 |

## Installation

```bash
npm i openeditor-text openeditor-text-react
# or:  npx openeditors add text   (auto-detects React and installs both)
```

## Quick start

```jsx
import { OpenEditor } from 'openeditor-text-react';
import 'openeditor-text/styles';

export default function MyForm() {
  return (
    <OpenEditor
      value="<p>Hello <strong>world</strong></p>"
      onChange={(html) => console.log(html)}
    />
  );
}
```

That's the whole integration: a toolbar, status bar, sanitization, undo history,
tables, images, and keyboard shortcuts are all on by default.

---

## Props

### Reactive props — the component responds when these change

| Prop | Type | Description |
|---|---|---|
| `value` | `string` | HTML content. Initial content + external updates (see *Controlled vs uncontrolled*). |
| `readOnly` | `boolean` | Toggle read-only mode. |
| `theme` | `'light' \| 'dark' \| 'minimal' \| 'auto'` | Visual theme. `'auto'` follows the OS. |
| `direction` | `'ltr' \| 'rtl'` | Text/UI direction. |

### Construct-time props — read once when the editor mounts

| Prop | Type | Description |
|---|---|---|
| `config` | `OpenEditorConfig` | Full editor configuration (see *Configuration*). |
| `plugins` | `EditorPlugin[]` | Plugin instances, installed at mount. |
| `className` / `style` | — | Applied to the host `<div>`. |

To change a construct-time prop, remount with a React `key`:

```jsx
<OpenEditor key={locale} config={{ locale }} />
```

### Event props

| Prop | Signature | Fires |
|---|---|---|
| `onChange` | `(html, { text, editor }) => void` | Content changed (debounced by the core). |
| `onReady` | `(editor) => void` | Editor instance created and live. |
| `onFocus` / `onBlur` | `(event) => void` | Focus enters / leaves the editable area. |
| `onError` | `({ error, context }) => void` | A recoverable internal error was captured. |

---

## Getting the editor instance

Use a ref for imperative access:

```jsx
import { useRef } from 'react';
import { OpenEditor } from 'openeditor-text-react';

function Demo() {
  const ref = useRef(null);

  return (
    <>
      <OpenEditor ref={ref} />
      <button onClick={() => alert(ref.current.getHTML())}>HTML</button>
      <button onClick={() => alert(ref.current.getMarkdown())}>Markdown</button>
      <button onClick={() => ref.current.focus()}>Focus</button>
    </>
  );
}
```

| Ref member | Returns |
|---|---|
| `ref.current.editor` | The live core `OpenEditor` instance (full API: commands, selection, history, plugins…) — `null` before mount. |
| `ref.current.getHTML()` | Sanitized HTML string. |
| `ref.current.getMarkdown()` | GitHub-flavored Markdown export. |
| `ref.current.focus()` | Focuses the editable area. |

---

## Controlled vs uncontrolled

The wrapper is **uncontrolled by default** — the editor owns its content and you
receive updates via `onChange`. You may still drive `value` like a controlled
input: the wrapper diffs out the echoes of its own `onChange`, so feeding the
same HTML back **never disturbs the caret**. Only genuinely *external* values
(e.g. loading a saved draft) trigger a content sync.

```jsx
const [html, setHtml] = useState('<p></p>');
<OpenEditor value={html} onChange={setHtml} />   // safe: typing never loops
```

---

## Plugins

All plugins ship inside `openeditor-text` — no extra installs:

```jsx
import { OpenEditor } from 'openeditor-text-react';
import {
  createTablePlugin,
  createMentionsPlugin,
  createFindReplacePlugin,
  createCodeBlockPlugin,
} from 'openeditor-text';

const plugins = [
  createTablePlugin(),
  createMentionsPlugin({ items: ['alice', 'bob'] }),
  createFindReplacePlugin(),
  createCodeBlockPlugin(),
];

<OpenEditor plugins={plugins} />
```

Available factories: `createImagePlugin`, `createLinkPlugin`, `createTablePlugin`,
`createMediaPlugin`, `createCodeBlockPlugin`, `createFindReplacePlugin`,
`createMentionsPlugin`, `createSlashCommandPlugin`, `createEmojiPlugin`,
`createSpecialCharsPlugin`, `createFormatPainterPlugin`, `createPreviewPlugin`,
`createSourcePlugin`, `createResizeEditorPlugin`, `createSpellcheckPlugin`,
`createAutoformatPlugin`, `createBlockDragPlugin`, `createBookmarkPlugin`, and more.

---

## Configuration

Pass any core option via `config` (construct-time). The most used:

```jsx
<OpenEditor
  config={{
    placeholder: 'Write something…',
    minHeight: 300,
    maxLength: 10000,
    spellcheck: true,
    statusBar: true,
    inlineToolbar: false,
    sanitize: true,               // XSS-safe HTML pipeline (default: on)
    askBeforePasteHTML: true,     // Keep / Text-only prompt on rich paste
    autosave: { key: 'draft-1' },
  }}
/>
```

The full, versioned option reference lives in the repository's `CONFIG.md`.

## Theming, RTL & localization

```jsx
import { ar } from 'openeditor-text/locales/ar';

<OpenEditor theme="dark" direction="rtl" config={{ locale: ar }} />
```

Built-in themes: `light`, `dark`, `minimal`, `auto`. Locale packs: `en` (built in),
`es`, `fr`, `de`, `ar` — each is a tree-shakeable import.

## Next.js / SSR

The module is safe to import on the server; **construction needs a DOM**, so
render it client-side:

```jsx
import dynamic from 'next/dynamic';
const OpenEditor = dynamic(
  () => import('openeditor-text-react').then((m) => m.OpenEditor),
  { ssr: false },
);
```

## TypeScript

```tsx
import type { OpenEditorConfig, EditorPlugin } from 'openeditor-text';
```

The component's props and the ref handle are fully typed out of the box.

---

## FAQ

**The caret jumps when I type.** You're re-mounting the component (changing its
`key` or parent identity) on every keystroke. Keep the component mounted; the
wrapper's echo-diffing handles controlled `value` safely.

**How do I change `config` after mount?** Construct-time by contract — remount
with a new `key`. This is deliberate: it keeps the wrapper thin and predictable.

**Where are the styles?** `import 'openeditor-text/styles'` once, anywhere in
your app.

## License

MIT · [Repository](https://github.com/ami130/open-editor) · Part of the
**Open Editor** suite (`npx openeditors add text`)
