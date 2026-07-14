# @open-editor-hq/react

Official React wrapper for [Open Editor](https://www.npmjs.com/package/@open-editor-hq/core) — a 1.9KB shim, zero dependencies beyond React itself.

```jsx
import { OpenEditor } from '@open-editor-hq/react';

function App() {
  const [html, setHtml] = useState('<p>Hello</p>');
  return <OpenEditor value={html} onChange={setHtml} theme="auto" />;
}
```

- Controlled or uncontrolled — typing never disturbs the caret (echo-diffing built in)
- StrictMode-safe, SSR-safe to import (`"use client"` where you render it)
- Reactive props: `value`, `readOnly`, `theme`, `direction`; everything else is construct-time (remount via `key`)
- `ref` handle: `.editor` (full core instance), `getHTML()`, `getMarkdown()`, `focus()`
- `plugins={[createTablePlugin()]}` installs core plugin factories on mount

MIT. TypeScript types included (reused from the core — no forks).
