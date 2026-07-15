# Open Editor for Angular (`openeditor-text-angular`)

The official Angular wrapper for **Open Editor** — a zero-dependency,
security-first rich text editor. ~61 KB gzipped core, 2,800+ tests, no license keys.

- **Forms-native** — implements `ControlValueAccessor`, so it plugs into
  `[(ngModel)]` *and* reactive forms (`formControl`) with zero glue code.
- **Caret-safe by design** — `writeValue()` diffs out echoes of the editor's own
  changes, so typing never re-enters `setHTML()` and the cursor never jumps.
- **Standalone component** — import it directly, no NgModule required.
- **Ships partial-Ivy FESM** — sole dependency is `tslib` (Angular's own
  mandated helper, already present in every Angular app).

---

## Requirements

| Peer dependency | Version |
|---|---|
| `@angular/core`, `@angular/forms` | ≥ 17 |
| `openeditor-text` | ≥ 1.1 |

## Installation

```bash
npm i openeditor-text openeditor-text-angular
# or:  npx openeditors add text   (auto-detects Angular and installs both)
```

Add the editor styles once, e.g. in `angular.json` → `styles`:

```json
"styles": ["node_modules/openeditor-text/dist/open-editor.css", "src/styles.css"]
```

## Quick start — template-driven forms

```ts
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OpenEditorComponent } from 'openeditor-text-angular';

@Component({
  standalone: true,
  imports: [FormsModule, OpenEditorComponent],
  template: `<open-editor [(ngModel)]="html"></open-editor>`,
})
export class AppComponent {
  html = '<p>Hello <strong>world</strong></p>';
}
```

## Quick start — reactive forms

```ts
import { Component } from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { OpenEditorComponent } from 'openeditor-text-angular';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, OpenEditorComponent],
  template: `<open-editor [formControl]="body"></open-editor>`,
})
export class ArticleComponent {
  body = new FormControl('<p>Draft…</p>');
  // this.body.disable() → editor becomes read-only, automatically
}
```

Both directions are caret-safe: the editor pushes HTML into the control on
change, and only genuinely *external* `setValue()` calls sync back in.

---

## Inputs

### Reactive inputs — the component responds when these change

| Input | Type | Description |
|---|---|---|
| `theme` | `'light' \| 'dark' \| 'minimal' \| 'auto'` | Visual theme. `'auto'` follows the OS. |
| `direction` | `'ltr' \| 'rtl'` | Text/UI direction. |
| *(disabled state)* | via forms | `control.disable()` / `[disabled]` with ngModel → read-only mode. |

### Construct-time inputs — read once when the editor initializes

| Input | Type | Description |
|---|---|---|
| `config` | `OpenEditorConfig` | Full editor configuration (see *Configuration*). |
| `plugins` | `EditorPlugin[]` | Plugin instances, installed at init. |

To change a construct-time input, recreate the component (e.g. toggle with
`@if`/`*ngIf` or key the parent).

### Outputs

| Output | Payload | Fires |
|---|---|---|
| `(ready)` | `OpenEditor` | Editor instance created and live. |
| `(changed)` | `{ html, text }` | Content changed (debounced by the core). |
| `(focused)` / `(blurred)` | event | Focus enters / leaves the editable area. |
| `(errored)` | `{ error, context }` | A recoverable internal error was captured. |

---

## Getting the editor instance

```ts
import { Component, ViewChild } from '@angular/core';
import { OpenEditorComponent } from 'openeditor-text-angular';

@Component({
  standalone: true,
  imports: [OpenEditorComponent],
  template: `
    <open-editor #ed (ready)="onReady()"></open-editor>
    <button (click)="exportMarkdown()">Markdown</button>
  `,
})
export class DemoComponent {
  @ViewChild('ed') ed!: OpenEditorComponent;

  exportMarkdown() {
    const editor = this.ed.editor;          // the live core instance
    console.log(editor?.getMarkdown());     // commands, selection, history… all available
  }
}
```

`OpenEditorComponent.editor` is the full core `OpenEditor` instance
(`null` before init / after destroy).

---

## Plugins

All plugins ship inside `openeditor-text` — no extra installs:

```ts
import {
  createTablePlugin,
  createMentionsPlugin,
  createFindReplacePlugin,
  createCodeBlockPlugin,
} from 'openeditor-text';

@Component({
  standalone: true,
  imports: [OpenEditorComponent],
  template: `<open-editor [plugins]="plugins"></open-editor>`,
})
export class EditorPage {
  plugins = [
    createTablePlugin(),
    createMentionsPlugin({ items: ['alice', 'bob'] }),
    createFindReplacePlugin(),
    createCodeBlockPlugin(),
  ];
}
```

Available factories: `createImagePlugin`, `createLinkPlugin`, `createTablePlugin`,
`createMediaPlugin`, `createCodeBlockPlugin`, `createFindReplacePlugin`,
`createMentionsPlugin`, `createSlashCommandPlugin`, `createEmojiPlugin`,
`createSpecialCharsPlugin`, `createFormatPainterPlugin`, `createPreviewPlugin`,
`createSourcePlugin`, `createResizeEditorPlugin`, `createSpellcheckPlugin`,
`createAutoformatPlugin`, `createBlockDragPlugin`, `createBookmarkPlugin`, and more.

---

## Configuration

Pass any core option via `[config]` (construct-time). The most used:

```ts
config: OpenEditorConfig = {
  placeholder: 'Write something…',
  minHeight: 300,
  maxLength: 10000,
  spellcheck: true,
  statusBar: true,
  sanitize: true,               // XSS-safe HTML pipeline (default: on)
  askBeforePasteHTML: true,     // Keep / Text-only prompt on rich paste
  autosave: { key: 'draft-1' },
};
```

```html
<open-editor [config]="config"></open-editor>
```

The full, versioned option reference lives in the repository's `CONFIG.md`.

## Theming, RTL & localization

```ts
import { ar } from 'openeditor-text/locales/ar';
```

```html
<open-editor theme="dark" direction="rtl" [config]="{ locale: ar }"></open-editor>
```

Built-in themes: `light`, `dark`, `minimal`, `auto`. Locale packs: `en` (built in),
`es`, `fr`, `de`, `ar` — each is a tree-shakeable import.

## SSR (Angular Universal)

The module is safe to import on the server; **construction needs a DOM**.
Render the component only in the browser (e.g. guard with
`isPlatformBrowser`, or `@defer` blocks in Angular 17+):

```html
@defer (on viewport) {
  <open-editor [(ngModel)]="html"></open-editor>
}
```

## TypeScript

```ts
import type { OpenEditorConfig, EditorPlugin } from 'openeditor-text';
```

All inputs, outputs, and the `editor` property are fully typed.

---

## FAQ

**The caret jumps when I type.** You're recreating the component (an `*ngIf`
flapping, or a parent `@for` without `track`) on every change-detection cycle.
Keep it mounted — the CVA echo-diffing makes forms binding caret-safe.

**How do I change `config` after init?** Construct-time by contract — recreate
the component. This is deliberate: it keeps the wrapper thin and predictable.

**Read-only?** Use the forms API: `control.disable()` or `[disabled]` with
`ngModel` — it maps to the editor's native read-only mode.

## License

MIT · [Repository](https://github.com/ami130/open-editor) · Part of the
**Open Editor** suite (`npx openeditors add text`)
