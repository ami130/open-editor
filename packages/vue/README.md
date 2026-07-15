# Open Editor for Vue 3 (`openeditor-text-vue`)

The official Vue 3 wrapper for **Open Editor** — a zero-dependency, security-first
rich text editor. ~61 KB gzipped core, 2,800+ tests, no license keys.

- **`v-model` with caret safety** — echoes of the editor's own updates never
  re-enter `setHTML()`, so typing never makes the cursor jump.
- **Two idioms** — a drop-in `<OpenEditor>` component *and* a
  `useOpenEditor()` composable for bring-your-own-element setups.
- **No SFC compiler needed** — the package ships render-function JS,
  zero build-time transforms.
- **TypeScript-first** — full typings included, reused from the core (no forks).

---

## Requirements

| Peer dependency | Version |
|---|---|
| `vue` | ≥ 3.3 |
| `openeditor-text` | ≥ 1.1 |

## Installation

```bash
npm i openeditor-text openeditor-text-vue
# or:  npx openeditors add text   (auto-detects Vue and installs both)
```

## Quick start

```vue
<script setup>
import { ref } from 'vue';
import { OpenEditor } from 'openeditor-text-vue';
import 'openeditor-text/styles';

const html = ref('<p>Hello <strong>world</strong></p>');
</script>

<template>
  <OpenEditor v-model="html" />
</template>
```

That's the whole integration: toolbar, status bar, sanitization, undo history,
tables, images, and keyboard shortcuts are all on by default.

---

## Props

### Reactive props — the component responds when these change

| Prop | Type | Description |
|---|---|---|
| `modelValue` (`v-model`) | `string` | HTML content — two-way bound, caret-safe. |
| `readOnly` | `boolean` | Toggle read-only mode. |
| `theme` | `'light' \| 'dark' \| 'minimal' \| 'auto'` | Visual theme. `'auto'` follows the OS. |
| `direction` | `'ltr' \| 'rtl'` | Text/UI direction. |

### Construct-time props — read once when the editor mounts

| Prop | Type | Description |
|---|---|---|
| `config` | `OpenEditorConfig` | Full editor configuration (see *Configuration*). |
| `plugins` | `EditorPlugin[]` | Plugin instances, installed at mount. |

To change a construct-time prop, remount with `:key`:

```vue
<OpenEditor :key="locale" :config="{ locale }" />
```

### Events

| Event | Payload | Fires |
|---|---|---|
| `update:modelValue` | `html: string` | Content changed (drives `v-model`). |
| `change` | `(html, { text, editor })` | Content changed — richer payload. |
| `ready` | `editor` | Editor instance created and live. |
| `focus` / `blur` | `event` | Focus enters / leaves the editable area. |
| `error` | `{ error, context }` | A recoverable internal error was captured. |

---

## Getting the editor instance

### Template ref

```vue
<script setup>
import { ref } from 'vue';
import { OpenEditor } from 'openeditor-text-vue';

const ed = ref(null);

function showHtml() {
  alert(ed.value.getHTML());
  // ed.value.editor  → the live core instance (commands, selection, history…)
}
</script>

<template>
  <OpenEditor ref="ed" />
  <button @click="showHtml">HTML</button>
</template>
```

Exposed on the template ref: `editor` (the full core `OpenEditor` instance),
`getHTML()`, `getMarkdown()`, `focus()`.

### Composable — bring your own element

```vue
<script setup>
import { ref } from 'vue';
import { useOpenEditor } from 'openeditor-text-vue';

const host = ref(null);
const { editor } = useOpenEditor(host, {
  config: { theme: 'dark' },
  onReady: (ed) => console.log('ready', ed),
});
// `editor` is a shallowRef: null until mounted, the core instance after.
</script>

<template>
  <div ref="host"></div>
</template>
```

Lifecycle (create on mount, destroy on unmount) is handled for you in both idioms.

---

## Plugins

All plugins ship inside `openeditor-text` — no extra installs:

```vue
<script setup>
import { OpenEditor } from 'openeditor-text-vue';
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
</script>

<template>
  <OpenEditor :plugins="plugins" />
</template>
```

Available factories: `createImagePlugin`, `createLinkPlugin`, `createTablePlugin`,
`createMediaPlugin`, `createCodeBlockPlugin`, `createFindReplacePlugin`,
`createMentionsPlugin`, `createSlashCommandPlugin`, `createEmojiPlugin`,
`createSpecialCharsPlugin`, `createFormatPainterPlugin`, `createPreviewPlugin`,
`createSourcePlugin`, `createResizeEditorPlugin`, `createSpellcheckPlugin`,
`createAutoformatPlugin`, `createBlockDragPlugin`, `createBookmarkPlugin`, and more.

---

## Configuration

Pass any core option via `:config` (construct-time). The most used:

```vue
<OpenEditor
  :config="{
    placeholder: 'Write something…',
    minHeight: 300,
    maxLength: 10000,
    spellcheck: true,
    statusBar: true,
    sanitize: true,               // XSS-safe HTML pipeline (default: on)
    askBeforePasteHTML: true,     // Keep / Text-only prompt on rich paste
    autosave: { key: 'draft-1' },
  }"
/>
```

The full, versioned option reference lives in the repository's `CONFIG.md`.

## Theming, RTL & localization

```vue
<script setup>
import { ar } from 'openeditor-text/locales/ar';
</script>

<template>
  <OpenEditor theme="dark" direction="rtl" :config="{ locale: ar }" />
</template>
```

Built-in themes: `light`, `dark`, `minimal`, `auto`. Locale packs: `en` (built in),
`es`, `fr`, `de`, `ar` — each is a tree-shakeable import.

## Nuxt / SSR

The module is safe to import on the server; **construction needs a DOM**, so
render it client-side:

```vue
<template>
  <ClientOnly>
    <OpenEditor v-model="html" />
  </ClientOnly>
</template>
```

## TypeScript

```ts
import type { OpenEditorConfig, EditorPlugin } from 'openeditor-text';
```

---

## FAQ

**The caret jumps when I type.** You're re-mounting the component (a changing
`:key` or `v-if` flapping) on every keystroke. Keep it mounted — `v-model`
echo-diffing makes two-way binding caret-safe.

**How do I change `config` after mount?** Construct-time by contract — remount
with a new `:key`. This is deliberate: it keeps the wrapper thin and predictable.

**Where are the styles?** `import 'openeditor-text/styles'` once, anywhere in
your app.

## License

MIT · [Repository](https://github.com/ami130/open-editor) · Part of the
**Open Editor** suite (`npx openeditors add text`)
