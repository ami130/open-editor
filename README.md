# Open Editor

A framework-independent, production-grade rich text editor built in pure JavaScript.
Zero dependencies. Runs forever. You own every line.

---

## Philosophy

- **Zero dependencies** — no npm packages in core, ever. Ships in 2025, still works in 2035.
- **Modular** — every feature is a plugin. Use only what you need.
- **You own the DOM** — no contenteditable surprises. The editor controls its own document.
- **Framework agnostic** — works with React, Vue, Angular via thin wrappers. Core never changes.
- **Premium-ready** — free core, licensed premium features, clean separation.

---

## Quickstart

> **Status:** `1.0.0` staged — `1.0.0-rc.1` is **LIVE on npm** (published
> 2026-07-14). One name, forever: **`@open-editor-hq/core`**
> (`npm install @open-editor-hq/core`). The API below is **frozen** and
> contract-tested; post-1.0.0 features (Phase 17.5+) land additively in 1.x.

```js
import { OpenEditor } from '@open-editor-hq/core';

// 1. Construct on any element (selector string or HTMLElement).
const editor = new OpenEditor('#app', {
  placeholder: 'Start typing…',
  theme: 'light',            // 'light' | 'dark' | 'minimal' | 'auto'
});

// 2. That's it — the toolbar, chrome, and all styling are injected by the
//    editor itself. No CSS file to import.

// 3. Read / write content.
editor.setHTML('<p>Hello <strong>world</strong></p>');
const html = editor.getHTML();          // sanitized HTML out
editor.on('onChange', ({ html }) => save(html));
```

**Optional plugins** are opt-in via factories (tree-shakeable — you only ship what you install):

```js
import { OpenEditor, createImagePlugin, createLinkPlugin, createTablePlugin } from '@open-editor-hq/core';

const editor = new OpenEditor('#app');
editor.plugins.install(createImagePlugin());
editor.plugins.install(createLinkPlugin());
editor.plugins.install(createTablePlugin());
// …createMediaPlugin, createEmojiPlugin, createFindReplacePlugin,
//    createCodeBlockPlugin, createSourcePlugin, createPreviewPlugin, etc.
```

**Configuration** → [docs/CONFIG.md](docs/CONFIG.md) · **Theming** → [docs/THEMING.md](docs/THEMING.md) · **Error reporting** → [docs/ERROR-REPORTING.md](docs/ERROR-REPORTING.md) · **Security** → [SECURITY.md](SECURITY.md)

---

## Architecture

**Design model: DOM-first.** The contenteditable DOM **is** the single source of
truth for document content. There is no separate in-memory document model that
the DOM mirrors — the editor reads the DOM directly (`getHTML()` returns the
live DOM), and structure is kept correct by a central **Normalizer** that
cleans the browser's messy output into a known **Canonical DOM Shape** (see the
"Canonical DOM Shape" section). The `STATE MANAGER` tracks only flags and
metadata (dirty flag, read-only, counts) — never content. This is the Jodit /
TinyMCE approach, chosen deliberately: it is the only architecture that a pure,
zero-dependency, single-maintainer project can ship and harden incrementally.
(A model-first design like ProseMirror / CKEditor 5 buys cleaner complex
operations and collaboration, but costs a full parser + renderer + input
interception engine before a single feature ships — the wrong trade here.)

`getJSON()` / `setJSON()` are a serialization *convenience* for storage, NOT an
internal model — the editor never edits through them.

```
USER INPUT
    ↓
TOOLBAR / MENUS / STATUS BAR
    ↓
PUBLIC API  (editor.getHTML / editor.commands.execute / editor.on)
    ↓
COMMAND MANAGER  (bold, italic, heading, list, insert...)
    ↓
PLUGIN MANAGER  (image, link, table, code, emoji, media...)
    ↓
SELECTION ENGINE  (cursor, ranges, save/restore, cross-browser)
    ↓
HISTORY ENGINE  (undo/redo, full-HTML snapshots)
    ↓
STATE MANAGER  (flags + metadata only — dirty, read-only, counts; NOT content)
    ↓
NORMALIZER  (cleans browser DOM → Canonical DOM Shape; runs after input + paste)
    ↓
DOM  (contenteditable — the source of truth; event capture)

SHARED UI LAYER  (modal system, tooltip system, context menu system)

PREMIUM LAYER (separate, license-gated)
    License Key → Feature Manager → SEO / Export / AI / Collaboration
    (Collaboration builds a lightweight model DERIVED from the DOM — the one
     place a model is needed, isolated to where it pays for itself.)
```

---

## Canonical DOM Shape

Because the editor is DOM-first, the DOM **is** the model — so the editor only
stays consistent if every command, paste, and normalization pass produces the
*same* known structure. This section is that contract: the canonical shape the
Normalizer enforces and every command must obey. It is the DOM-first substitute
for a schema. **If two operations can produce different DOM for the same visual
result, this document decides which one wins.**

**Top level**
- The editable root contains only **block elements** — never loose text nodes.
  Bare text typed at the root is wrapped in `<p>` (force-paragraph mode).
- Allowed top-level blocks: `p`, `h1`–`h6`, `blockquote`, `pre`, `ul`, `ol`,
  `dl`, `table`, `figure`, `hr`, and plugin block islands
  (`contenteditable="false"` wrappers).

**Empty states**
- An empty editor is a single `<p><br></p>` — never a bare `<br>`, never empty.
- An empty block (paragraph the user cleared) is `<p><br></p>`; the `<br>` is a
  placeholder so the caret has somewhere to sit. It is stripped on serialization
  output where a block has other content.
- A pending-format wrapper (empty `<strong>` created by toggling bold on a
  collapsed caret) holds a single ZWSP so the caret can enter it; the ZWSP is
  stripped by `getHTML()` and never survives serialization.

**Inline formatting**
- Canonical tags: **`<strong>`** (not `<b>`), **`<em>`** (not `<i>`),
  `<u>`, `<s>` (not `<strike>`/`<del>`), `<sup>`, `<sub>`, `<code>`, `<a>`.
- Color, font, size, spacing, decoration → a single `<span style="...">`.
  Re-applying a property **updates the existing span in place**, never nests a
  second span. Toggling a partial selection **splits** the run (before/after
  stay wrapped, the selected part is unwrapped) — text is never reordered.
- Inline elements never wrap block elements. Adjacent identical-format spans are
  merged. Empty inline elements are pruned.

**Lists**
- `ul`/`ol` contain only `li`. A nested list lives **inside** an `<li>`, as a
  child of that `li` — never as a direct child of another list.
- Outdenting an item splits the sublist so trailing siblings stay nested.

**Blocks inside structure**
- Heading/paragraph commands are no-ops inside a list item (a list item is not
  reformatted to a heading; leave the list to apply a block format first).
- Blockquote on a list item wraps the item's **contents**
  (`<li><blockquote>…</blockquote></li>`), never the `<li>` itself.

**History & serialization**
- Undo/redo are **full-HTML snapshots** of the canonical DOM — no diffing, no
  operational model. Snapshots store the selection bookmark alongside the HTML.
- `getHTML()` returns canonical, serialization-safe HTML (placeholders/ZWSP
  stripped). `getJSON()`/`setJSON()` round-trip *that* HTML — they are storage
  convenience, not an internal model.

Every milestone's "clean output" is judged against this shape. A
**snapshot-test suite** (sequence of operations → assert exact `getHTML()`)
is the primary mechanism that keeps the canonical shape from drifting.

---

## Folder Structure

> **Note:** the tree below is the original aspirational layout and is partly out of date. The shipped reality: everything lives under **`packages/core/src/`** as a single package — there is no separate `toolbar/` or standalone `ui/` package. Toolbar, status bar, and shared UI are in `packages/core/src/ui/`; plugins in `packages/core/src/plugins/`; the paste engine in `packages/core/src/paste/`; the sanitizer in `packages/core/src/sanitizer/`. The `normalizer.js` shown as "planned" was instead realized as `_ensureParagraphMode` (in `editor-dom.js`) plus `utils/html-normalize.js`. Treat the annotations inside the tree as historical.

```
open-editor/
├── packages/
│   ├── core/                      ← engine (pure JS, zero deps)
│   │   ├── src/
│   │   │   ├── editor.js          ← OpenEditor bootstrap class
│   │   │   ├── editor-api.js      ← public API methods (mixin, keeps editor.js ≤300 lines)
│   │   │   ├── editor-events.js   ← DOM/lifecycle event wiring (mixin)
│   │   │   ├── editor-maxlength.js← maxLength enforcement helpers (mixin)
│   │   │   ├── editor-config.js   ← config DEFAULTS + prototype-safe deep merge
│   │   │   ├── index.js           ← package entry point
│   │   │   ├── version.js
│   │   │   ├── events/
│   │   │   │   └── event-emitter.js
│   │   │   ├── state/
│   │   │   │   └── editor-state.js
│   │   │   ├── selection/
│   │   │   │   ├── selection-manager.js
│   │   │   │   └── range-utils.js
│   │   │   ├── commands/
│   │   │   │   ├── command-manager.js
│   │   │   │   ├── setup-commands.js   ← registers built-in commands + shortcuts
│   │   │   │   ├── text-commands.js
│   │   │   │   ├── inline-unwrap.js    ← partial-selection split/unwrap (DOM surgery)
│   │   │   │   ├── block-commands.js
│   │   │   │   ├── list-commands.js    ← (+ list-dom.js, list-dom-indent.js, list-keyboard.js)
│   │   │   │   ├── style-commands.js   ← typography / decoration commands
│   │   │   │   ├── color-commands.js   ← text/background color + clear
│   │   │   │   └── normalizer.js       ← (planned) enforces Canonical DOM Shape after input/paste
│   │   │   ├── history/
│   │   │   │   └── history-manager.js
│   │   │   ├── sanitizer/
│   │   │   │   ├── sanitizer.js        ← tag/attr whitelist, URL/CSS guards, mXSS pass
│   │   │   │   └── sanitizer-utils.js  ← encoding/text/structure + URL/CSS safety helpers
│   │   │   ├── shortcuts/
│   │   │   │   └── shortcut-manager.js
│   │   │   ├── logger/
│   │   │   │   └── logger.js
│   │   │   ├── ui/                     ← shared UI primitives (Phase 6, lives in core)
│   │   │   │   ├── modal-manager.js
│   │   │   │   ├── tooltip-manager.js
│   │   │   │   ├── context-menu-manager.js
│   │   │   │   ├── focus-trap.js
│   │   │   │   └── ui-styles.js
│   │   │   └── utils/
│   │   │       ├── base-css.js
│   │   │       ├── clipboard.js
│   │   │       ├── debounce.js
│   │   │       └── html-normalize.js
│   │   ├── tests/                 ← Vitest unit + jsdom integration tests
│   │   └── package.json
│   │
│   │   # NOTE: There is NO parser/ or renderer/ — the editor is DOM-first, so
│   │   # the DOM is the model. Structure is enforced by commands/normalizer.js
│   │   # (the Normalizer) against the Canonical DOM Shape, not by a model layer.
│   │   # plugins/plugin-manager.js is planned (Phase 8+) and not yet implemented.
│   │   # The toolbar/ and a standalone ui/ package below are planned (Phase 7);
│   │   # Phase 6 UI currently ships inside core/src/ui/.
│   │
│   ├── toolbar/                   ← (planned, Phase 7) toolbar + status bar UI
│   │   ├── src/
│   │   │   ├── toolbar.js
│   │   │   ├── button.js
│   │   │   ├── dropdown.js
│   │   │   ├── color-picker.js
│   │   │   ├── status-bar.js
│   │   │   ├── inline-toolbar.js
│   │   │   └── menu.js
│   │   └── package.json
│   │
│   ├── plugins/                   ← official plugins
│   │   ├── image/
│   │   ├── link/
│   │   ├── table/
│   │   ├── code/
│   │   ├── emoji/
│   │   ├── media/
│   │   ├── special-chars/
│   │   ├── find-replace/
│   │   ├── source-code/
│   │   └── paste-engine/
│   │
│   ├── themes/                    ← CSS only, no JS
│   │   ├── default/
│   │   ├── dark/
│   │   └── minimal/
│   │
│   ├── premium/                   ← license-gated features
│   │   ├── seo/
│   │   ├── export/
│   │   ├── ai/
│   │   ├── collaboration/
│   │   └── mentions/
│   │
│   └── wrappers/                  ← framework adapters
│       ├── react/
│       ├── vue/
│       └── angular/
│
├── apps/
│   ├── playground/                ← dev sandbox (Vite)
│   └── docs/                      ← documentation site
│
├── examples/
│   ├── basic/
│   ├── with-react/
│   └── full-featured/
│
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## Status

**Phases 0–16.7 (incl. 4.5 and 7.5) are implemented and verified** — the editor is feature-complete through Accessibility & Mobile (14), the Theme System (15), the frozen Public API (16, `1.0.0-rc.1`), Production Hardening (16.5), Modern Editing UX (16.6), and the Competitive Parity Pass (16.7). Phase 13 (Content Plugins) adds 11 plugins — Source Code view (zero-dep, XSS-verified round-trip), Find & Replace (CSS Custom Highlight API), Special Characters, Emoji, Media Embed (sandboxed provider iframes, 72-probe XSS-verified), Horizontal Rule, Code Block, Resizable Editor, Format Painter, Spellcheck, and Preview — with Emoji, dedicated Code Block, and sandboxed Media Embed going **beyond standard Jodit**. Phase 12 (Paste Engine) is complete — staged cleanup pipeline, ask-on-paste dialog, Ctrl+Shift+V, context-aware insertion — also beyond Jodit in several respects. Phase 11 (Table) is complete on a formal-matrix model. The core package has **1964 passing unit tests** (Vitest + jsdom, 151 files) and the playground has **638 e2e tests passing across Chromium, Firefox, and WebKit (13 skipped of 651 runs)**, including a public-API freeze contract test, a 100-cycle memory-leak test, and performance-budget gates. Every source file is within the 300-line limit.

Phase 4.5 (block editing semantics) is fully shipped: Enter-split, Backspace/Delete-merge, structural conversions, multi-block delete, `contenteditable="false"` island handling, editor floor, and block indent/outdent.

Phase 7.5 (Playwright Verification Gate) moved the bulk of the jsdom-only tests into real browsers. Phase 14 (Accessibility & Mobile) then hardened the remaining gaps: mobile tap targets are now **44×44px** (e2e asserts it), the editable has a visible focus ring, the color picker is fully keyboard-operable, RTL/bidi and high-contrast/reduced-motion are supported, and long-press/touch behaviours are wired. `7.18` (sticky-on-scroll rigorous verification) remains the one `[~]` deferred to on-device testing.

Phase 9 (Image Plugin) is fully shipped: insert by URL or file upload, drag-and-drop, clipboard paste, click-to-select, corner-handle resize with Shift-locked aspect ratio, four alignment modes, alt/title/link via context menu, `<figure>/<figcaption>` semantic structure, `loading="lazy"` by default, and `contenteditable="false"` island contract for all future embedded content plugins.

Phase 9.1 (Image Properties) adds a Jodit-style properties dialog opened by double-click or the context menu / action bar: edit source, alt, title, width/height with lock-aspect, alignment, border-radius, and per-side margins (with lock), plus a Delete action. Phase 9.4 adds a floating quick-action bar on a selected image (align left/center/right, edit, link, delete) so common actions don't require right-click. Sizing/border-radius/margins are written as inline `style` on the `<img>` (already allowed by the sanitizer and guarded by `isUnsafeStyle`); alignment stays on the `<figure>`.

Phase 9.2 (Advanced) adds an Advanced group to the properties dialog — CSS class (a multi-select when `imageAvailableClasses` is configured, else free text), `id`, and an inline-style field (managed properties are hidden from it so they can't be clobbered). Phase 9.3 adds config: `imageDefaultWidth` (applied to inserted images that carry no size), `imageAvailableClasses`, and `imageOpenOnDblClick`. Phase 9.5 polish: a decorative-alt accessibility nudge in the dialog, a `plugin:image:loaderror` event when an inserted image fails to load (for host toasts), and a clearer caption affordance on selected images. The crop/rotate image editor remains a deliberately separate future phase.

Phase 8 (Plugin System) is complete: `PluginManager` with register/install/uninstall/get/getAll, full plugin lifecycle hooks via EventEmitter, automatic listener cleanup, dependency resolution with circular detection, plugin error isolation, toolbar button contribution, and the `createTestEditor` test harness.

Phase 10 (Link Plugin) is fully shipped: Ctrl/Cmd+K dialog, toolbar button, wrap-selection (block-safe), custom inline popover (open/edit/unlink) on existing links, edit href + text, unlink, paste-autolink, `href` whitelist (`isAllowedLinkHref`), `rel` noopener/nofollow handling, CSS class + aria-label fields, dbl-click-open and readonly-nav-guard behaviors. Video→iframe embeds (`processVideoLink`) were intentionally deferred to Phase 13 to keep the iframe security surface out of the link phase, and are now delivered there (Media Embed plugin).

### Implemented vs. Planned

**Built and verified (Phases 0–13, 4.5, 7.5):** core engine, state, selection, command system, block-editing semantics, history/undo-redo, shared UI (modal/tooltip/context-menu), state-aware toolbar with dropdowns + custom canvas color picker, inline bubble toolbar, status bar, i18n, fullscreen, print, sanitizer (security-hardened), plugin system, **image plugin** (insert/upload/drag-drop/paste, resize, properties dialog, action bar), **link plugin** (dialog, popover, autolink, color), **table plugin** (formal-matrix model), **paste engine** (Word/Google-Docs cleanup, ask-on-paste, context-aware insertion), and the **11 content plugins** below.

| Content plugin (Phase 13) | Status |
|---|---|
| Source-code (HTML) view — XSS-verified round-trip | built |
| Find & Replace — CSS Custom Highlight API | built |
| Video / iframe embed (YouTube / Vimeo) — sandboxed, `processVideoLink` | built |
| Special characters + Emoji inserter | built |
| Format painter (copy formatting) | built |
| Horizontal rule | built |
| Code block | built |
| Resizable editor | built |
| Spellcheck toggle | built |
| Preview | built |

**Planned but NOT yet built (Phases 15–19):** documented as milestone plans below, not shipped code. Everything in this list is a gap versus a full Jodit-class editor:

| Roadmap item | Phase | Status |
|---|---|---|
| **Accessibility & Mobile** (ARIA depth, full keyboard nav incl. color picker, touch targets, RTL/bidi, high-contrast, reduced-motion) | 14 | **built** |
| **Theme System** (CSS custom properties, dark/minimal/auto themes, runtime switch, CSP-safe injection) | 15 | ✅ done |
| **Public API** (frozen surface, contract test, config validation) | 16 | ✅ done (`1.0.0-rc.1`) |
| **Production hardening** (perf throttle + CI gates, dirty guard, crash recovery, leak test) | 16.5 | ✅ done |
| **Modern Editing UX** (slash-commands, markdown autoformat, @mentions, block drag-reorder) | 16.6 | ✅ done |
| **Competitive Parity Pass** (list style auto-progression, typed-URL autolink, to-do lists, F&R whole-word, table properties split, table header-click selection, source syntax highlighting, responsive images, selection word count) | 16.7 | ✅ done |
| **npm Publishing** (ships as `@open-editor-hq/core` — rc.1 LIVE on `next`; minified-only distribution; ESM/CJS/UMD, `types` export, size-gated, WCAG conformance statement, plugin guide, 4 locale packs) | 17 | ✅ **done — 1.0.0 LIVE on npm (2026-07-14)** |
| **Free-Tier Competitive Sweep** (autocorrect, change case, bookmarks, page break, show blocks, a11y help dialog, `:` emoji autocomplete, styles dropdown, sanitizer allowlist config, type-around, text-part language, Markdown export) | 17.5 | ✅ **12/12 core done (2026-07-14) — ships as 1.1.0; 2 stretch items deferred** |
| **Framework wrappers** (React / Vue / Angular) | 18 | planned |
| **Premium layer** (license, SEO/Export/AI/Collaboration/Comments/**Track-Changes**/Version-History + document-app plugins — amended per 2026-07 competitive analysis) | 19 | planned |
| **Engineering Moats** (large-doc perf benchmarks, Android IME hardening, offline-first autosave, Excel paste cleanup, image crop/rotate, file manager) | 20 | planned |

Nearest-term priority order: **npm Publishing (17) → Free-Tier Competitive Sweep (17.5) →
Framework Wrappers (18) → Premium Layer (19) → Engineering Moats (20, ongoing)**.
Phase 17 is the hard gate — nothing in 17.5+ starts until `npm install open-editor` works.
(Accessibility & Mobile (14), Theme System (15), Public API freeze (16), Production
Hardening (16.5), and Modern Editing UX (16.6) are all complete). A full re-audit against
CKEditor/Jodit (2026-07) found Phases 0–16.6 genuinely solid with only cosmetic doc drift
— but surfaced concrete, verified feature gaps (16.7) worth closing before publishing,
so the free-tier feature set is at its strongest when it ships.

---

## Development Phases

Every phase has a defined goal, output, and test. Phase N must be complete and clean before Phase N+1 starts.

Two phases use decimal numbering (**4.5**, **7.5**) so they slot into the
existing sequence without renumbering everything after them — they are full
phases with the same gate discipline, not optional add-ons.

---

### PHASE 0 — Project Foundation
**Goal:** Monorepo running, dev environment working, build pipeline verified.

Milestones:
- [x] 0.1 — pnpm workspace initialized, all package.json files in place
- [x] 0.2 — Rollup configured for `core` package (ESM + CJS + UMD output)
- [x] 0.3 — Vite playground running, hot reload working
- [x] 0.4 — Vitest configured and a passing dummy test exists
- [x] 0.5 — Playwright configured with a passing browser smoke test

**Clean output:** `pnpm dev` opens playground at localhost. `pnpm test` passes.

---

### PHASE 1 — Core Engine
**Goal:** The editor mounts on a DOM element, owns its container, fires lifecycle events.

Milestones:
- [x] 1.1 — `EventEmitter` class (on/off/emit/once) with full tests
- [x] 1.2 — `OpenEditor` class mounts on a container element
- [x] 1.3 — Creates contenteditable div, wrapper, applies base styles
- [x] 1.4 — Config system: defaults + deep merge of user config
- [x] 1.5 — Lifecycle: `beforeInit` → `init` → `afterInit` → `beforeDestroy` → `destroy`
- [x] 1.6 — Raw DOM events captured: input, keydown, keyup, mousedown, mouseup, focus, blur
- [x] 1.7 — IME composition events handled: compositionstart, compositionupdate, compositionend
- [x] 1.8 — Placeholder text: shown when editor is empty, hidden on first keystroke (CSS + JS)
- [x] 1.9 — `autofocus` config option: focuses editor on mount when true
- [x] 1.10 — `debug` config option: logs all events, commands, and state changes to console when true
- [x] 1.11 — Shift+Enter inserts `<br>` (soft line break); Enter inserts new `<p>` (hard break)
- [x] 1.12 — Force paragraph mode on init: bare text always wrapped in `<p>`, never loose in div
- [x] 1.13 — `minHeight` / `maxHeight` / `height` config options (`height` sets both min and max equally)
- [x] 1.14 — `defaultContent` config option: initial HTML set at construction time (no post-init `setHTML` call needed)
- [x] 1.15 — `readonly` as constructor config option (not just `setReadOnly()` API method)
- [x] 1.16 — `spellcheck` config option: exposed as boolean (default false to prevent layout reflows)
- [x] 1.17 — `toolbar: false` config: skips toolbar initialization entirely for custom-toolbar integrations
- [x] 1.18 — `statusBar: false` config: skips status bar initialization
- [x] 1.19 — Config deep merge is prototype-pollution-safe: strips `__proto__`, `constructor`, `prototype` keys
- [x] 1.20 — `ShortcutManager`: central registry for all keyboard shortcuts — `register(keys, command, label)`, `unregister(keys)`, `getAll()`, conflict detection (warns if two handlers claim same keys), plugins register their own shortcuts here on install and unregister on destroy
- [x] 1.21 — `Logger` module: wraps all internal `console.*` calls — active only when `debug: true`, levels (info / warn / error), plugins call `editor.logger.warn(...)` not `console.warn(...)` directly, integrators can replace with custom logger via `config.logger`
- [x] 1.22 — `iframe` config option: `iframe: true` renders the contenteditable inside a sandboxed `<iframe>` for full CSS isolation from host page — host page styles cannot bleed in; editor injects its own stylesheet into the iframe document
- [x] 1.23 — `beforeinput` event used as primary input handler where available (Chrome 60+, Firefox 87+, Safari 14+); `keydown`+`input` fallback for gaps
- [x] 1.24 — Destroy cleanup checklist enforced: all event listeners removed, MutationObservers disconnected, timers cancelled, DOM nodes removed, all references nullified
- [x] 1.25 — MutationObserver strategy defined: used to catch programmatic DOM changes that `input` event misses; set up on init, disconnected on destroy
- [x] 1.26 — `ready` event fires once after init *(plugin-`onInit` gating is wired in once the plugin system lands in Phase 8; today it fires right after `init`/`afterInit`)*

**Clean output:** `new OpenEditor('#target', config)` renders editor with placeholder. `editor.destroy()` cleans up with zero leaks. `toolbar: false` produces a bare contenteditable with no toolbar DOM.

---

### PHASE 2 — State Manager
**Goal:** A single source of truth for document state — dirty flag, metadata, and read-only mode — so every part of the editor reads the same document status.

Milestones:
- [x] 2.1 — `EditorState`: holds `content`, `isDirty`, `isReadOnly`, `metadata` (title, author, wordCount)
- [x] 2.2 — `isDirty` set to `true` on every `input` event; reset to `false` on `setHTML()` or explicit `markClean()`
- [x] 2.3 — `isReadOnly` toggle: `setReadOnly(true/false)` — disables contenteditable, dims toolbar buttons
- [x] 2.4 — `onChange` fires on content change, debounced (default 300ms, configurable) — coalesces a burst of keystrokes into one event; suppressed during `setHTML()` and IME composition
- [x] 2.5 — `metadata` object updated via `editor.state.setMeta(key, value)`, read via `editor.state.getMeta(key)`
- [x] 2.6 — `editor.state.wordCount` / `charCount` updated live via `MutationObserver` (reuses observer from Phase 1)
- [x] 2.7 — `editor.state.serialize()` / `deserialize(snapshot)`: JSON round-trip of content + metadata (used by autosave plugins)
- [x] 2.8 — State changes emit events via Phase 1 `EventEmitter` (`stateChange`, `readOnlyChange`)

**Clean output:** `editor.state.isDirty` is `true` after typing. `setReadOnly(true)` prevents all input. `onChange` fires once per dirty transition, not per keystroke.

---

### PHASE 3 — Selection Engine
**Goal:** A reliable, cross-browser selection and range abstraction that every command depends on.

Milestones:
- [x] 3.1 — `SelectionManager`: wraps native `Selection` / `Range` API, exposes `get()`, `set()`, `save()`, `restore()`
- [x] 3.2 — `get()` returns `{ startNode, startOffset, endNode, endOffset, collapsed, commonAncestor }`
- [x] 3.3 — `save()` / `restore()` use serializable bookmark (node + offset path, not live `Range` objects) — survives DOM mutations between save and restore
- [x] 3.4 — `selectAll()` — selects all editor content
- [x] 3.5 — `collapse(node, offset)` — collapses cursor to a specific position
- [x] 3.6 — `insertAtCursor(htmlOrNode)` — inserts at current cursor position, selection updates to cover new content
- [x] 3.7 — `isInsideEditor()` — returns false if selection is outside the editor element
- [x] 3.8 — `getSelectedText()` — returns plain-text string of the current selection
- [x] 3.9 — `getSelectedHTML()` — returns serialized HTML of the current selection *(serialization logic-tested; cross-browser edge cases need Playwright)*
- [x] 3.10 — `expandToWord()` — expands a collapsed selection to the nearest word boundaries
- [x] 3.11 — Range utilities (`range-utils.js`): `walkUp`, `getParentBlock`, `isInsideTag`, `getDeepestNode` — shared helpers used by selection, commands, and plugins

**Clean output:** `editor.selection.save()` returns a bookmark; `editor.selection.restore(bookmark)` puts the cursor back in the exact same position after DOM changes. All commands use `SelectionManager` exclusively — zero direct `window.getSelection()` calls outside selection layer.

---

### PHASE 4 — Command System
**Goal:** All editing actions go through a unified, testable command interface.

Milestones:
- [x] 4.1 — `CommandManager`: register, execute, isEnabled, isActive, getAll
- [x] 4.2 — `execCommand` wrapper with save/restore selection baked in (commands return `SKIP_RESTORE` when they place the caret themselves)
- [x] 4.3 — Text commands: bold, italic, underline, strikethrough, superscript, subscript
- [x] 4.4 — Inline code span command: wraps selection in `<code>` (distinct from code block)
- [x] 4.5 — Block commands: paragraph, h1-h6, blockquote, pre/code block
- [x] 4.6 — Alignment commands: left, center, right, justify (toggle-off supported)
- [x] 4.7 — List commands: unordered list, ordered list, indent, outdent
- [x] 4.8 — List keyboard behavior: Tab indents list item, Shift+Tab outdents, double-Enter on empty item exits list
- [x] 4.9 — Insert commands: insertHTML, insertText, insertHorizontalRule, insertNonBreakingSpace
- [x] 4.10 — Format commands: removeFormat, selectAll, cut, copyAsPlainText
- [x] 4.11 — Font commands: fontFamily (sets `font-family` style), lineHeight (sets `line-height` style)
- [x] 4.12 — `isActive('bold')` returns true when cursor is inside bold text
- [x] 4.13 — Built-in keyboard shortcuts registered through `ShortcutManager` (not hardcoded): Ctrl/Cmd+B/I/U, Ctrl+Shift+X, Ctrl/Cmd+A, Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z — each bound to its command by name *(Ctrl+K link / Ctrl+Shift+V paste-plain register with their plugins in later phases)*
- [x] 4.14 — Public custom command registration API: `editor.commands.register(name, { execute, isActive, isEnabled })`
- [x] 4.15 — `editor.commands.unregister(name)`: plugins call this on uninstall to remove their commands cleanly
- [x] 4.16 — Typography commands: `letterSpacing`, `textIndent`, `textTransform` (uppercase/lowercase/capitalize), `fontWeight` (numeric 100–900)
- [x] 4.17 — Text decoration commands: `overline`, `dotted-underline` (via `text-decoration-style`)
- [x] 4.18 — List style type command: `listStyleType(value)` — disc, circle, square, decimal, lower-alpha, lower-roman applied to current list
- [x] 4.19 — Ordered list `start` attribute: `setListStart(n)` sets the starting number on the current `<ol>` (preserves `start="0"`)
- [x] 4.20 — Definition list command: inserts an empty `<dl><dt></dt><dd></dd></dl>` (editable term/definition rows) at cursor
- [x] 4.21 — Nested list: nesting via manual DOM construction — not `execCommand('indent')`; a nested list uses its parent list's type, and outdent splits the sublist so trailing siblings stay nested
- [x] 4.22 — Nested blockquote: re-applying `blockquote` toggles off (unwraps) on re-application; `paragraph` peels one level back (symmetric)
- [x] 4.23 — Transaction / batch API: `editor.commands.batch(fn)` groups multiple operations into one undo step
- [x] 4.24 — `writing-mode` command: vertical-rl for CJK vertical text layout (clears to default on `horizontal-tb`)

**Clean output:** Every formatting operation works via `editor.commands.execute('bold')`. No direct DOM calls outside commands. Batch operations produce one undo step. Custom commands register and work identically to built-ins.

---

### PHASE 4.5 — Block Editing Semantics
**Goal:** Correct, cross-browser behavior for the structural edits that
contenteditable handles badly on its own — merging, splitting, and deleting
across block boundaries. This is the hardest core engine work and the dividing
line between a toy and an advanced editor; it gets its own phase instead of
being scattered as one-off keydown patches. Everything here produces the
**Canonical DOM Shape**.

Milestones:
- [x] 4.5.1 — **Enter splits a block** at the caret: text before stays, text after moves into a new sibling block of the same type (heading→p after split is configurable; list items handled by Phase 4 list rules).
- [x] 4.5.2 — **Backspace at block start merges** the current block into the previous block (caret lands at the join point); merging preserves inline formatting on both sides.
- [x] 4.5.3 — **Delete at block end merges** the next block into the current one (mirror of 4.5.2).
- [x] 4.5.4 — **Backspace at the start of a list item** outdents it (nested → one level out; top-level → converts to a paragraph after the list), never deletes the bullet silently.
- [x] 4.5.5 — **Backspace at the start of a blockquote/heading/pre** converts it to a plain paragraph first (one keystroke = one structural step), then merges on the next press.
- [x] 4.5.6 — **Delete/Backspace across a multi-block selection**: remove the spanned content, merge the partial first and last blocks into one valid block, place the caret at the join.
- [x] 4.5.7 — **Deleting into / out of a `contenteditable="false"` island** (image, embed): select the island as a unit, delete it whole — never let the caret enter and corrupt it.
- [x] 4.5.8 — **Empty-editor floor:** any delete sequence that would empty the editor leaves the canonical `<p><br></p>`, never a bare or empty root.
- [x] 4.5.9 — **Block-level indent / outdent** for non-list blocks (paragraph, heading) via margin/`<blockquote>` step — distinct from list indent (4.7).
- [x] 4.5.10 — Snapshot-test battery: each of the above is locked with an exact-`getHTML()` before/after assertion, **verified in real Chromium** (jsdom cannot be trusted for caret-position-dependent merges).

**Clean output:** Enter/Backspace/Delete behave identically across Chrome, Firefox, and Safari for every block combination. No keystroke ever produces invalid HTML or loses formatting on the unselected side of a merge.

---

### PHASE 5 — History Engine
**Goal:** Undo/redo that works correctly and never loses content.

Milestones:
- [x] 5.1 — `HistoryManager`: snapshot stack, index pointer
- [x] 5.2 — Snapshot taken on: Enter key, command execute, paste, IME commit, 1.5s idle after typing (consecutive identical snapshots de-duplicated; a no-net-change snapshot after an undo still discards the stale redo branch)
- [x] 5.3 — `undo()` restores previous snapshot + selection position
- [x] 5.4 — `redo()` moves forward in stack
- [x] 5.5 — `canUndo()` / `canRedo()` boolean methods
- [x] 5.6 — Browser native Ctrl+Z / Cmd+Z intercepted (shortcut handler `preventDefault`s) and replaced with our own
- [x] 5.7 — Max 100 snapshots, oldest dropped when limit hit
- [x] 5.8 — Selection position saved in snapshot, restored on undo

**Clean output:** Ctrl+Z / Ctrl+Y works correctly for all command types. Rapid typing collapses into one undo step.

---

### PHASE 6 — Shared UI System
**Goal:** Reusable modal, tooltip, and context menu primitives that every plugin uses — built once, never duplicated.

Milestones:
- [x] 6.1 — `ModalManager`: open(config), close(), stack support (modal on top of modal)
- [x] 6.2 — Modal features: title, body (HTML or DOM node), footer buttons, close on Escape, close on backdrop click
- [x] 6.3 — Focus trap inside open modal: Tab cycles within modal only, re-asserts if focus escapes; returns focus to the triggering element on close (WCAG 2.1 / 2.4.3)
- [x] 6.4 — Modal returns a Promise that resolves with the user's action (confirm/cancel/value)
- [x] 6.5 — `TooltipManager`: show(element, text), hide(), auto-positions above/below/left/right, never off-screen; preserves any pre-existing `aria-describedby`
- [x] 6.6 — `ContextMenuManager`: show(x, y, items[]), hide(), keyboard navigation (arrow keys, Enter, Escape) including into and out of sub-menus
- [x] 6.7 — Context menu items support: label, icon, shortcut hint, separator, disabled state, sub-menu
- [x] 6.8 — All three systems are scoped to editor container (no document-level pollution)
- [x] 6.9 — All three systems are keyboard navigable and screen-reader accessible (ARIA roles, `aria-activedescendant` roving focus, `role="dialog"`/`menu`/`tooltip`)

**Clean output:** A plugin can call `editor.ui.modal.open(...)` and get a clean dialog. No plugin ever builds its own modal from scratch.

---

### PHASE 7 — Toolbar System
**Goal:** A fully functional, state-aware toolbar built in pure JS DOM.

Milestones:
- [x] 7.1 — `ToolbarManager`: renders toolbar into the editor wrapper from a group config
- [x] 7.2 — `Button` component: icon (inline SVG), tooltip (via Phase 6 TooltipManager), active state, disabled state
- [x] 7.3 — `Dropdown` component: off-screen-aware positioning, keyboard navigation (arrow keys, Escape) *(positioning logic-tested under jsdom; pixel-accurate flip pending Playwright)*
- [x] 7.4 — Full keyboard-only toolbar navigation: roving `tabindex`, arrow keys move between buttons (WCAG 2.1)
- [x] 7.5 — ARIA roles: `role="toolbar"`, `aria-pressed` on toggle buttons, `aria-label` on all buttons
- [x] 7.6 — Heading dropdown: P, H1-H6, Pre, Blockquote
- [x] 7.7 — Font family dropdown: configurable list of font names
- [x] 7.8 — Font size dropdown: configurable sizes (preset list + free-text custom input; implemented in toolbar-dropdown.js)
- [x] 7.9 — Line height dropdown: configurable values (1, 1.5, 2, 2.5)
- [x] 7.10 — Color picker: text color, background color (custom swatch grid + hex input, zero deps; backed by new `textColor`/`backgroundColor` commands)
- [x] 7.11 — Toolbar groups: text / block / color / list+align / insert / history / view
- [x] 7.12 — State sync: on `selectionchange`/`afterCommand`/`input`, button active/disabled states update — throttled via `requestAnimationFrame` (not debounce)
- [x] 7.13 — Toolbar click saves selection on `mousedown` (before blur), restores before the command runs
- [x] 7.14 — Toolbar is configurable: pass `toolbar: { items: [...] }` to reorder/remove/add groups
- [x] 7.15 — Custom toolbar button API: descriptor `{ type:'button', name, icon, tooltip, command, onClick? }` — same contract built-ins use
- [x] 7.16 — Fullscreen toggle: `editor.toggleFullscreen()` expands to viewport, Escape exits, emits `fullscreenEnter`/`fullscreenExit`
- [x] 7.17 — Print button: `editor.print()` prints editor content only via a scoped print window
- [x] 7.18 — Sticky toolbar on scroll *(verified by Playwright: `toolbar stays pinned (position:sticky) when its scroll container scrolls`, toolbar.test.js)*
- [x] 7.19 — Inline bubble toolbar (`inlineToolbar: true`): appears above a non-collapsed selection (bold/italic/underline/quote) *(anchoring logic-tested; pixel placement needs Playwright)*
- [x] 7.20 — Status bar: renders below editor, live word count, char count, cursor line/column
- [x] 7.21 — Mobile toolbar: larger tap targets + horizontal overflow scroll *(verified by Playwright: `mobile viewport: toolbar buttons meet minimum touch target size` asserts ≥44×44px, toolbar.test.js)*
- [x] 7.22 — `aria-describedby` on toolbar buttons → hidden shortcut-hint node sourced from `shortcuts.getAll()`
- [x] 7.23 — i18n system: strings externalized into a locale bundle; default `en` bundle ships with the package
- [x] 7.24 — Locale config: `locale: 'en'` (built-in) or `locale: { bold: 'Gras', … }` (override); status bar uses CJK-aware word counting
- [x] 7.25 — Performance benchmark CI gate (16ms / 50ms) *(smoke tests in toolbar-buttons.test.js verify toolbar sync + getHTML on large documents without throwing)*

**Clean output:** Toolbar renders, bold button highlights when cursor is in bold text, dropdowns open/close, color picker applies colors, fullscreen + print work, status bar updates live, all strings overridable. **All source files ≤300 lines.** Pixel-level positioning (dropdown flip, bubble anchoring, sticky, mobile touch) needs Playwright verification. `[~]` = shipped-but-needs-browser-verification.

---

### PHASE 7.5 — Playwright Verification Gate
**Goal:** Prove the foundation (phases 0–7 + 4.5) actually works in real
browsers before a single plugin is built on top of it. jsdom has already let
real bugs ship (text-reordering on partial toggle, the color-nesting bug) — it
cannot model selection, focus, caret position, or layout. This gate converts
every `[~]` marker into a `[x]` backed by a real-browser test, and is a **hard
blocker**: Phase 8 does not start until this is green.

Milestones:
- [x] 7.5.1 — Playwright runs the suite against **Chromium, Firefox, and WebKit** (the three engines behind all six target browsers), wired into CI.
- [x] 7.5.2 — **Selection & caret** verified live: save/restore across DOM mutation, RTL selection normalization, double-click word selection, partial-toggle split (clears the 3.9 `[~]`).
- [x] 7.5.3 — **Block editing (Phase 4.5)** re-run in all three engines — caret-dependent merges/splits confirmed identical.
- [x] 7.5.4 — **Toolbar pixel behavior**: dropdown off-screen flip (7.3), inline bubble anchoring (7.19), sticky-on-scroll (7.18), mobile overflow + touch targets (7.21) — all `[~]` cleared.
- [x] 7.5.5 — **Clipboard** paths that jsdom can't run: copy/cut/paste, permission fallbacks, plain-text fallback.
- [x] 7.5.6 — **Undo/redo** with real keystrokes and real selection restoration.
- [x] 7.5.7 — **Accessibility** smoke pass with axe-core rules: ARIA roles, focus rings, keyboard-only toolbar traversal.
- [x] 7.5.8 — **Snapshot regression** suite (operation sequence → exact `getHTML()`) runs in real browsers as the standing guard against canonical-shape drift.
- [x] 7.5.9 — A documented "no `[~]` left in phases 0–7" checklist — the gate is only passed when zero shipped-but-unverified markers remain.

**Clean output:** Every phase 0–7 + 4.5 feature has a passing real-browser test in all three engines. No `[~]` markers remain. CI fails if any cross-browser test fails. Only now does plugin work begin.

---

### PHASE 8 — Plugin System
**Goal:** Any feature can be added or removed without touching core.

Milestones:
- [x] 8.1 — `PluginManager`: register, install, uninstall, get, isInstalled, getAll
- [x] 8.2 — Plugin interface contract defined (name, install, destroy, hooks)
- [x] 8.3 — Plugin lifecycle hooks: onInit, onChange, onKeyDown, onPaste, onFocus, onBlur, onContextMenu
- [x] 8.4 — Plugin can contribute toolbar buttons via `getToolbarButtons()`
- [x] 8.5 — Plugin can contribute context menu items via `getContextMenuItems()`
- [x] 8.6 — Plugin can intercept keydown (return true = handled, stops propagation)
- [x] 8.7 — Plugin can access `editor.commands`, `editor.selection`, `editor.state`, `editor.ui`
- [x] 8.8 — Plugins communicate via editor EventEmitter only (no direct coupling)
- [x] 8.9 — Plugin error isolation: one plugin crash does not kill the editor
- [x] 8.10 — `editor.plugins.getAll()` returns map of all installed plugin instances
- [x] 8.11 — Plugin dependency declaration: plugin spec includes optional `dependencies: ['link']` field; PluginManager installs dependencies first and throws descriptive error if a dependency is missing
- [x] 8.12 — Plugin test harness: minimal editor instance (no toolbar, no UI) exported as test utility so plugin authors can mount and unit-test their plugin in Vitest without a full browser

**Clean output:** A demo plugin installs, adds a toolbar button, handles a keystroke, uninstalls cleanly.

---

### PHASE 9 — Image Plugin
**Goal:** Insert, upload, resize, align images inside the editor.

Milestones:
- [x] 9.1 — Toolbar button: "Insert Image" (uses Phase 6 modal)
- [x] 9.2 — Insert by URL: dialog → `<img>` inserted at cursor
- [x] 9.3 — Insert by file: file picker → FileReader → base64 or upload
- [x] 9.4 — Upload handler: configurable URL, returns hosted image URL, shows progress
- [x] 9.5 — Drag & drop image files directly into editor
- [x] 9.6 — Paste image from clipboard: reads `image/*` from `ClipboardEvent.clipboardData` on Ctrl+V
- [x] 9.7 — Image selected state: click image to select it
- [x] 9.8 — Resize handles: drag corners to resize (maintains aspect ratio with Shift)
- [x] 9.9 — Alignment: float left, center, float right, inline
- [x] 9.10 — Alt text input in dialog
- [x] 9.11 — Delete selected image with Backspace/Delete key
- [x] 9.12 — `src` sanitization: block `data:` URIs and `javascript:` scheme on insert; preserve `srcset` and `sizes` attributes on paste/import
- [x] 9.13 — `<figure>` + `<figcaption>` semantic structure: images inserted as `<figure><img><figcaption></figcaption></figure>` (affects SEO and accessibility)
- [x] 9.14 — `loading="lazy"` attribute set by default on inserted images; configurable
- [x] 9.15 — `title` attribute input in dialog alongside alt text
- [x] 9.16 — Image as link: context menu option on selected image to wrap it in `<a>` (interaction contract between image plugin and link plugin defined explicitly)
- [x] 9.17 — Upload abort: cancel button in progress UI calls `AbortController.abort()` on in-flight upload
- [x] 9.18 — `contenteditable="false"` island contract: defines how plugins create non-editable embedded content regions — standard wrapper pattern used by image, media, and code block plugins

**Clean output:** Full image workflow from upload to resize to alignment works. Clipboard paste image works.

---


### PHASE 10 — Link Plugin
**Goal:** Create, edit, open and remove hyperlinks.

Milestones:
- [x] 10.1 — Keyboard shortcut: Ctrl/Cmd+K opens link dialog (handled in the plugin's `onKeyDown`; the async dialog is deliberately NOT a CommandManager command, whose synchronous bookmark restore would fight the modal)
- [x] 10.2 — Toolbar button: "Insert Link" (with `isActive` — highlights when the caret is inside a link)
- [x] 10.3 — Dialog: URL input, link text input, open-in-new-tab checkbox (+ nofollow, CSS class, aria-label)
- [x] 10.4 — Wraps selected text in `<a>` (block-spanning/select-all selections wrap inline content *inside* each block — `<p><a>…</a></p>` — never the invalid `<a><p>…</p></a>` the sanitizer would unwrap)
- [x] 10.5 — Caret in an existing link shows a **custom inline popover** (cloned from `inline-toolbar` positioning; the Phase 6 tooltip is text-only and cannot host actions) with the URL + open / edit / unlink — Jodit's order
- [x] 10.6 — Edit link: updates href *and* display text on the existing `<a>`
- [x] 10.7 — Remove link: unwraps `<a>` leaving text intact (with pre-op history snapshot + cursor placement)
- [x] 10.8 — Auto-detect **pasted** URLs and convert to links (configurable via `linkAutoDetect`, default on — matches Jodit's paste-only `processPastedLink`; typed-URL detection is intentionally out of scope)
- [x] 10.9 — `href` whitelist (`isAllowedLinkHref`): allow `http`/`https`/`mailto`/`tel`/`#anchor`/relative; block `javascript:`/`data:`/`vbscript:`/`blob:`/unknown schemes. A link-local helper — the shared `isUnsafeUrl` blocklist is left unchanged to avoid regressing `src`/`cite`/`action` sanitization
- [x] 10.10 — `rel="noopener noreferrer"` auto-applied when `target="_blank"` (already enforced by the sanitizer)
- [x] 10.11 — `rel="nofollow"` dialog checkbox (merged into `rel` without clobbering `noopener`)
- [x] 10.12 — URL validation: warn/re-prompt on empty or unsafe href; merely-odd-but-valid URLs are allowed (warn-not-block)
- [x] 10.13 — Dialog primary button flips "Insert Link" ↔ "Update"; title "Insert Link" ↔ "Edit Link"
- [x] 10.14 — `linkFollowOnDblClick` (default false, like Jodit): double-clicking a link opens it
- [x] 10.15 — `linkPreventReadOnlyNavigation` (default true, like Jodit): clicking a link in a readonly editor does not navigate
- [x] 10.16 — Selection containing an image wraps the `<img>` inside the `<a>`
- [x] 10.17 — CSS class + `aria-label` fields (required whitelisting `class` + `aria-label` on `<a>` in the sanitizer)
- [x] 10.18 — Link **color** picker: applies an inline `style="color: …"` (required whitelisting `style` on `<a>`; the value is still guarded by the sanitizer's `isUnsafeStyle`). A "No custom color" toggle clears it.
- [x] 10.19 — Dialog **Unlink** button (shown only when editing an existing link, Jodit-style) — removes the `<a>` and closes.
- [x] 10.20 — Stale-`rel` fix: `noopener`/`noreferrer` are tied to `target="_blank"` and stripped when "open in new tab" is turned off, so unchecking it leaves no dead `rel` tokens.
- [x] 10.21 — `processVideoLink`: convert YouTube/Vimeo links to `<iframe>` embeds — **delivered in Phase 13** (Media Embed plugin, `media-providers.js`) with a hardcoded host allowlist + mandatory minimal `sandbox`, as originally deferred

**Clean output:** Full link CRUD workflow. Custom inline popover appears on existing links. Paste-autolink, href whitelist, and Jodit-parity dialog/behaviors.

---

### PHASE 11 — Table Plugin
**Goal:** Insert and edit HTML tables with full keyboard navigation.

> **Foundation & safety (added after Jodit-parity review):**
> - **11.0 — Formal-matrix model** (`table-matrix.js`): a pure 2D grid built from a `<table>` that accounts for `colspan`/`rowspan` — a spanned cell appears in every grid position it covers. Maps cell↔(row,col) and computes selection bounds. **Every** structural operation (add/remove row-col, merge, split) is expressed against this matrix, and it normalizes away redundant span=1 attributes. Built and exhaustively unit-tested with zero UI before any DOM mutation — this is the bedrock that keeps colspan/rowspan bookkeeping correct.
> - **11.19 — Cell key-guard**: `td`/`th` are block elements, so the Phase 4.5 Enter-split / Backspace-merge logic would otherwise treat a cell as a block and corrupt the table (creating a sibling `<td>` outside a `<tr>`, merging cells, etc.). The plugin intercepts Enter/Backspace/Delete/Tab via `onKeyDown` (which runs *before* block-editing) whenever the caret is inside a cell, so cell editing never triggers structure-breaking block operations.
> - **Sanitizer widening**: `<caption>` and `<colgroup>`/`<col>` (for column widths) are added to the tag allowlist (guarded like all other tags), since the current allowlist strips them.

Milestones:
- [x] 11.0 — Formal-matrix model (`table-matrix.js`) + sanitizer widening for `<caption>`/`<colgroup>`/`<col>` *(shipped in sub-phase 11.A)*
- [x] 11.1 — Toolbar button: grid picker (hover NxM to select size)
- [x] 11.2 — Inserts clean `<table>` HTML at cursor (with `<colgroup>` for column widths)
- [x] 11.3 — Tab key: move to next cell (inserts new row at last cell) *(11.B)*
- [x] 11.4 — Shift+Tab: move to previous cell *(11.B)*
- [x] 11.5 — Arrow keys navigate between cells (conservative, boundary-aware) *(11.B)*
- [x] 11.6 — Right-click context menu (uses Phase 6 ContextMenuManager): insert row above/below, insert column left/right *(11.B)*
- [x] 11.7 — Delete row, delete column, delete entire table *(11.B)*
- [x] 11.19 — Cell key-guard: Enter=line-break-in-cell, Backspace/Delete don't merge cells (never corrupts the table) *(11.B)*
- [x] 11.8 — Column resize: drag a cell's right border (mouse + touch); shifts width between adjacent `<col>`s, preserving the row total *(11.D)*
- [x] 11.9 — Header row toggle (td↔th) with `scope="col"` set automatically; spans/content preserved through the tag swap (WCAG 1.3.1 / H63) *(11.D)* — column headers; `scope="row"` not yet
- [x] 11.10 — Table styling: table border (applied to table + cells), width, and alignment (left/center/right) via the format menu *(11.D)*
- [x] 11.11 — Cell background + text colour via the context menu (currently a native colour input; a full canvas picker can replace it later) *(11.D)*
- [x] 11.12 — Per-side cell border control: Border all-sides / top / right / bottom / left + Remove borders, on the selected cells, via the format menu *(11.D)*
- [x] 11.13 — Cell merge (colspan/rowspan): merge selected cells + split cell vertically/horizontally — matches Jodit's span arithmetic; every op keeps the grid rectangular *(11.C)*
- [x] 11.14 — Table caption: insert/edit/remove `<caption>` (inserted as the required first child) via the format menu *(11.D)*
- [x] 11.15 — Copy entire table to the clipboard as clean HTML (`text/html` when the async Clipboard API is available; strips editor-only classes + placeholder `<br>`) *(11.D)*
- [x] 11.16 — Multi-cell selection: click-and-drag to select a rectangular range of cells, with visual highlight; right-click preserves the selection so operations act on the whole range (Jodit `select-cells` parity) *(11.C)*
- [x] 11.17 — Cell content alignment: horizontal (left/center/right) and vertical (top/middle/bottom), per cell or per selection *(11.D)*
- [x] 11.18 — Table presets / extra classes: a `tableAvailableClasses` config surfaces a style selector on the insert picker (e.g. Bordered / Striped); the chosen preset class is applied to the new table while preserving `oe-table` *(11.D)*

**Clean output:** Tables insert, navigate with keyboard, rows/columns add and remove correctly, ranges of cells can be selected and operated on together.

---

### PHASE 12 — Paste Engine
**Goal:** Paste from any source (Word, Google Docs, browser) produces clean HTML.

> **Reuses the Phase 0–2 sanitizer — does NOT build a second one.** The security
> sanitizer (tag/attr whitelist, URL/CSS guards, mXSS pass) already exists and
> runs on every paste. This phase adds *source-specific cleanup* (Word/GDocs
> garbage, list reconstruction, span merging) that runs **after** the security
> sanitizer, then normalizes the result into the Canonical DOM Shape.
>
> **Already in place (reused, not rebuilt):** `editor-paste.js` (`_onPaste`)
> intercepts every paste, reads `text/html` (falling back to `text/plain`),
> runs it through the security sanitizer, escapes plain text with `\n`→`<br>`,
> enforces `maxLength`, and emits a cancelable `paste` event (already used by
> image-paste and lone-URL autolink). The sanitizer is a **security** filter,
> not a **cleanliness** filter — it *allows* `style`/`class` on most tags, so
> Word/GDocs garbage (`mso-*`, `class="MsoNormal"`, empty/style-only spans,
> `docs-internal-guid-…`, fake list bullets) survives it. That garbage is
> exactly what this phase removes.

Milestones:
- [x] 12.1 — Intercept paste event, read `text/html` from clipboard — *satisfied by existing `editor-paste.js`*
- [x] 12.2 — Run pasted HTML through the existing Phase 2 security sanitizer (whitelist + URL/CSS guards) before any source-specific cleanup — *satisfied by existing `editor-paste.js`; ordering is correct*
- [x] 12.3 — Strip inline styles (configurable via `pasteStripStyles`, default strip) — runs **after** 12.13 so style-driven formatting is promoted to semantic tags *before* the raw `style` attribute is dropped (never lose bold/italic). `packages/core/src/paste/normalize-paste.js`.
- [x] 12.4 — Strip Microsoft Word garbage: `mso-*` style props, `class="Mso…"`, fake-bullet spans, redundant attrs (`<o:p>`/`<w:*>`/`<v:*>`/xml islands/comments are already unwrapped by the security sanitizer upstream). Preserves the `mso-list` marker for 12.6. `packages/core/src/paste/clean-word.js`.
- [x] 12.5 — Strip Google Docs garbage: unwrap the `docs-internal-guid` wrapper, drop noise styles (line-height, margins, font-family/size, default color) + `dir="ltr"`, keep semantic style hints for 12.13. **Exceeds Jodit**, which has *no Google-Docs-specific path at all*. `packages/core/src/paste/clean-gdocs.js`.
- [x] 12.6 — Convert Word list structures to proper nested `<ul>`/`<ol>` from `mso-list:lN levelM` + Symbol/Wingdings bullet detection (ordered/unordered hint stamped by 12.C, level-stack rebuild). **Exceeds Jodit**, which only deletes the fake bullets and never rebuilds real lists. Adversarially verified (2 type-correctness bugs found & fixed). `packages/core/src/paste/word-lists.js`.
- [x] 12.7 — Merge adjacent identical-format spans + unwrap attribute-less `<span>`/`<font>` (Jodit does **not** do this on paste). `normalize-paste.js`.
- [x] 12.8 — Remove empty inline elements (empty *blocks* kept; cascade removal until stable). `normalize-paste.js`.
- [x] 12.9 — Plain-text: blank-line-separated chunks → separate `<p>`s, single newline → `<br>`, CRLF/CR normalized, markup escaped. `packages/core/src/paste/paste-plain.js`.
- [x] 12.10 — "Paste as plain text" shortcut Ctrl/Cmd+Shift+V — one-shot force-plain flag armed on keydown (not a registered shortcut, so the native paste still fires). **Exceeds Jodit** (no such shortcut there).
- [x] 12.11 — Encoding cleanup: smart quotes/en-dash/ellipsis → ASCII (**exceeds Jodit**), strip BOM + zero-width chars, nbsp → space. `normalize-paste.js`.

New milestones (Jodit parity + beyond — from a source-verified gap analysis against `github.com/xdan/jodit`):
- [x] 12.12 — **"Ask on paste" dialog** — Jodit's signature paste behavior. On a rich-HTML paste, prompt **Keep / Insert as Text / Insert only Text** (Word variant labels the middle option **"Clean"**). Config: `askBeforePasteHTML` (default `true`), `askBeforePasteFromWord` (default `true`), `defaultActionOnPaste` (default `'keep'`), `defaultActionOnPasteFromWord` (default `null` → falls back to `defaultActionOnPaste`). The three action values are **`'keep'`** (run the full clean pipeline, formatting preserved), **`'text'`** (escaped text with line breaks, no HTML — the "Insert as Text"/"Clean" button), and **`'only'`** (plain-text paragraphs, all formatting stripped). Set the `ask*` flags to `false` to paste silently using the default action. `packages/core/src/paste/paste-dialog.js`.
- [x] 12.13 — **Style → semantic-tag conversion** (`font-weight:bold|700`→`<strong>`, `font-style:italic`→`<em>`, `text-decoration:line-through`→`<s>`, `underline`→`<u>`, `vertical-align:super/sub`→`<sup>/<sub>`; multiple formats nest). **More advanced than Jodit**, which never promotes style formatting on paste. Runs before 12.3. `packages/core/src/paste/style-to-semantic.js`.
- [x] 12.14 — **Paste pipeline events** — `paste`/`beforePaste` (cancelable entry; a listener may `preventDefault()`) then `afterPaste` after insertion. Existing plugins (image paste, lone-URL autolink) hook `paste`. `packages/core/src/editor-paste.js`.
- [x] 12.15 — **Context-aware paste** — block-level paste at an inline caret splits the host block (no invalid `<p>`-in-`<p>`); `<td>`/`<th>`/`<li>` are **not** split open (content inserted inside them). `packages/core/src/paste/paste-insert.js`.
- [x] 12.16 — **RTF-only clipboard**: documented decision — `text/rtf` is intentionally not decoded, so an RTF-only clipboard degrades to plain text (matches Jodit). RTF decoding + `\pict` image extraction is deferred to a later phase (documented in `editor-paste.js`, not silently dropped).

**Test strategy:** a fixture corpus of realistic Microsoft Word and Google Docs paste HTML (`packages/core/tests/fixtures/paste-fixtures.js`) asserted against expected clean output, per-source unit tests for every cleanup step, and `apps/playground/tests/paste-engine.test.js` covering the ask-on-paste dialog, Keep/Clean/plain actions, Word list reconstruction, and Ctrl+Shift+V across Chromium + WebKit (Firefox headless skips synthetic paste events, matching the existing clipboard suite).

**Clean output:** Paste from Word produces clean semantic HTML. No MSO garbage survives, style-driven formatting is preserved as `<strong>`/`<em>`/`<s>`/`<u>`, and the user can choose Keep / Clean / plain-text per paste.

---

### PHASE 13 — Content Plugins
**Goal:** Complete the standard plugin set to Jodit feature parity.

Milestones:
- [x] 13.1 — **Source Code Plugin**: toggle WYSIWYG ↔ raw-HTML `<textarea>` (zero-dep, in-house beautifier — no CDN/Ace). SECURITY: the textarea re-enters the DOM ONLY via `setHTML()` (sanitized), never `innerHTML` — verified with 53 adversarial probes (no bypass). `<pre>` content is preserved byte-exact through the round-trip. `packages/core/src/plugins/source/`.
- [x] 13.2 — **Find & Replace Plugin**: Ctrl+F (find) / Ctrl+H (replace), match counter + prev/next, replace one / replace all, case toggle. Highlighting via the **CSS Custom Highlight API** (zero-dep, no DOM mutation) with graceful degrade when unsupported. `packages/core/src/plugins/find-replace/`.
- [x] 13.3 — **Special Characters Plugin**: searchable Unicode grid modal (~75 chars: punctuation, currency, math, arrows, accented Latin, Greek), click-to-insert. Reusable `buildCharGrid`. Config `specialCharacters`. `packages/core/src/plugins/chars/`.
- [x] 13.4 — **Emoji Plugin**: categorized emoji grid (tabs + keyword search), click-to-insert — reuses `buildCharGrid`. **Beyond Jodit** (which ships no emoji plugin). Config `emojis`. `packages/core/src/plugins/emoji/`.
- [x] 13.5 — **Media Embed Plugin**: embed YouTube/Vimeo by URL (toolbar dialog, or paste a bare URL to auto-embed — matches CKEditor's AutoMediaEmbed; raw pasted `<iframe>` HTML is deliberately NOT adopted, same secure stance) → sandboxed `<iframe>` in a `<figure>`. **Defense in depth**: strict provider allowlist in the plugin AND an independent sanitizer policy (`isSafeEmbedIframe`) — iframe stays deny-by-default, kept only with a mandatory minimal `sandbox` + host allowlist. **Security-verified: 72 adversarial XSS probes, no bypass.** Click-to-select, 8-handle drag resize (aspect ratio preserved via CSS `aspect-ratio`, not the legacy padding-bottom trick — the embed's own width-driven ratio, unlike a parent-relative percentage, actually responds to a resize), and left/center/right alignment — the exact same island-selection/resize-overlay/action-bar UI the image plugin uses, shared via `ui/resize-overlay-styles.js` and `ui/island-actionbar-styles.js` rather than reimplemented. `packages/core/src/plugins/media/` (`media-selection.js`, `media-resize.js`, `media-actionbar.js`, `media-paste.js`).
- [x] 13.6 — **Horizontal Rule**: toolbar button wired to the existing `insertHorizontalRule` command (from Phase 4.9) with the `hr` icon.
- [x] 13.7 — **Code Block Plugin**: insert `<pre><code class="language-X">` with a language selector; Tab inserts spaces / Shift+Tab outdents INSIDE code only — verified NOT to disturb list-indent (4.5) or table-nav (11) Tab elsewhere. **Beyond Jodit** (which has no fenced-code plugin). `packages/core/src/plugins/code-block/`.
- [x] 13.8 — **Resizable Editor**: statusbar-style drag grip on the wrapper resizes height, clamped to min/maxHeight; mouse + touch; disabled in fullscreen/readonly. Pure `clampHeight` math. `packages/core/src/plugins/resize-editor/`.
- [x] 13.9 — **Format Painter Plugin**: capture inline formatting at the caret, paint it onto the next selection; single-use or sticky (`formatPainterSticky`). Adversarial-verified — a CRITICAL nesting bug + HIGH silent-no-op on boundary-crossing selections were found and fixed (per-text-node wrap, add-only). `packages/core/src/plugins/format-painter/`.
- [x] 13.10 — **Spellcheck control**: toolbar toggle for the native `spellcheck` attribute (off by default per Phase 1); `isActive` reads the live DOM. No custom dictionary engine (out of scope). `packages/core/src/plugins/spellcheck/`.
- [x] 13.11 — **Preview Plugin**: render the current (sanitized) HTML in a **sandboxed iframe** modal — companion to Source view. `packages/core/src/plugins/preview/`.

*Deferred to a later phase (explicit scope decision): AI assistant + speech-to-text (need external services), class-span, xpath breadcrumb, add-new-line bar. `fullscreen`/`print`/`inline-popup`/`char-word counter`/`Word-paste cleaning`/`line-height`/`sticky toolbar` are already shipped in earlier phases.*

**Clean output:** All 11 plugins install and work independently, every source file ≤300 lines, zero dependencies. Source view round-trips correctly (incl. byte-exact `<pre>`); Format painter paints across selections without nesting; Media Embed is XSS-verified. Emoji, dedicated Code Block, and sandboxed Media Embed go **beyond standard Jodit**.

---

### PHASE 14 — Accessibility & Mobile
**Goal:** Editor is fully keyboard-navigable and works correctly on touch devices.

> **Pull foundational items forward.** A few of these affect elements created in
> Phase 1 (the editable) and Phase 7 (the toolbar). Retrofitting them after 13
> plugins exist means re-touching every plugin. Implement the *foundational*
> pieces in their home phase and only **verify** them here: **14.1** (ARIA on the
> editable) belongs in Phase 1; **14.6 / 14.10** (touch handling + 44×44px tap
> targets) belong in Phase 7. This phase then becomes the WCAG-AA + device
> verification pass over work already wired in, plus the genuinely
> mobile-specific items (virtual keyboard, long-press, pinch-zoom, RTL/bidi).

Milestones:
- [x] 14.1 — ARIA on contenteditable: `role="textbox"`, `aria-multiline="true"`, `aria-label`, `aria-readonly` (`editor-dom.js`, `editor-api.js`)
- [x] 14.2 — ARIA live region: status bar is `role="status"` + `aria-live="polite"` (`status-bar.js`)
- [x] 14.3 — Visible focus rings: toolbar buttons use `:focus-visible`; the editable now has an inset `:focus-visible` ring (was `outline:none` with no replacement)
- [x] 14.4 — Toolbar WCAG AA: roving tabindex + labels; **color picker is now keyboard-operable** (open+focus+arrow-nav+Esc), closing the last keyboard gap
- [x] 14.5 — Dialogs announce title via `role="dialog"` + `aria-modal` + `aria-labelledby` (`modal-manager.js`)
- [x] 14.6 — Touch handling: `touchstart`/`touchend` on interactive controls (resize, color-canvas, image); toolbar buttons via native click
- [~] 14.7 — Virtual-keyboard scroll-into-view on focus (`editor-mobile.js`) — logic shipped & unit-tested; the true on-device `visualViewport` resize path can only be confirmed on a real phone (CI headless engines don't raise a soft keyboard). Intentionally left partial rather than falsely marked done.
- [x] 14.8 — Long-press (500ms) → context menu on touch, cancelled by a drag past tolerance (`editor-mobile.js`)
- [x] 14.9 — Pinch/double-tap-zoom suppressed inside the editable via `touch-action: pan-y`
- [x] 14.10 — Touch targets are 44×44px on mobile; toolbar has horizontal overflow scroll (e2e asserts ≥44px)
- [x] 14.11 — RTL: `direction` config + `dir` on editable/wrapper + runtime `setDirection()`/`getDirection()`; toolbar mirrors via `[dir="rtl"]`
- [x] 14.12 — Bidi: `unicode-bidi: isolate` on the editable, `plaintext` per block so mixed RTL/LTR runs don't reorder neighbours
- [~] 14.13 — iOS Safari `cursor: text` + `-webkit-user-select: text` shipped in base CSS; tap-focus behaviour confirmed in WebKit e2e (real-device pass pending)
- [x] 14.14 — iOS late-input: content read on `touchend` too, guarded against IME composition (`editor-mobile.js`)
- [x] 14.15 — High contrast: `@media (forced-colors: active)` keeps editable/toolbar borders + active state visible
- [x] 14.16 — `@media (prefers-reduced-motion: reduce)` disables editor-chrome transitions/animations (scoped to editor classes)
- [x] 14.17 — Drag-drop text within editor fires `onChange` (browsers skip `input` on drop) without breaking the native move
- [x] 14.18 — Shadow DOM documented as unsupported (see note below)

> **Shadow DOM (14.18):** open-editor scopes its CSS with an `.oe-` class prefix on a global/iframe `<style>` tag. This does **not** pierce Shadow DOM boundaries — mounting the editor inside a shadow root leaves its styles in the outer document and the chrome will render unstyled. Shadow DOM is explicitly **unsupported**; mount the editor in the light DOM (or use `iframe: true` for isolation).

**Clean output:** Editor passes WCAG 2.1 AA for keyboard, focus, contrast, and motion; RTL/bidi and touch behaviours implemented and unit-tested. `[~]` = implemented, awaiting real-device (not just WebKit-emulated) confirmation.

---

### PHASE 15 — Theme System
**Goal:** Fully skinnable editor with CSS custom properties.

Milestones:
- [x] 15.1 — All colors, spacing, fonts defined as CSS custom properties (3-tier token model: primitive `--oe-c-*` → semantic → component)
- [x] 15.2 — Default light theme (semantic values pixel-identical to the pre-token hardcoded palette — proven by unchanged e2e snapshots)
- [x] 15.3 — Dark theme (overrides the semantic tier only, keyed off `data-oe-theme="dark"`)
- [x] 15.4 — Minimal theme (flat: no shadows, no radius — stripped-back, embed-friendly)
- [x] 15.5 — `editor.setTheme('dark')` switches at runtime with no flash (emits `themeChange`)
- [x] 15.6 — `editor.setCSSVar('--oe-primary', '#ff0000')` for per-instance overrides (name + value guarded against CSS injection)
- [x] 15.7 — CSS scoped to editor container (zero global CSS pollution)
- [x] 15.8 — Read-only mode visual treatment (`.oe-readonly`): content stays legible + selectable, neutral cursor, faint tint, toolbar muted/inert — distinct from disabled
- [x] 15.9 — CSP compatibility: zero `eval`/`new Function()`/dynamically injected `<style>` — Constructable Stylesheets (`adoptedStyleSheets`) with a `<style>` fallback only for Safari <16.4/jsdom; works under `script-src 'self'` with no `unsafe-eval`/`unsafe-inline`
- [x] 15.10 — `editor.setTheme('auto')` follows the OS via `prefers-color-scheme` (bonus)
- [x] 15.11 — Flash guard: `data-oe-theme` stamped on wrapper + editable in `_buildDOM` *before the wrapper is attached to the document* — the configured theme is present on the first attached frame (bonus)

**Clean output:** Theme switch at runtime with no flash. Zero global CSS side effects. Read-only looks different from enabled. ✅ **Phase 15 complete** — full tokenization: **all 149 color literals across 14 style files migrated to semantic tokens**, enforced by a `no-color-literals` guard test so dark mode can't silently break again. 15 unit tests (theme-system) + 4 (readonly) + 6 (inject-style) + 15 (tokenization guard); e2e proves each surface (empty editor, source view, char grid, callouts, read-only) actually reskins in dark, dark→light restores pixel-identically, and light stayed byte-identical through the migration. All 3 browsers.

📖 Guides: [docs/THEMING.md](docs/THEMING.md) (how to skin the editor) · [docs/THEME-TOKENS.md](docs/THEME-TOKENS.md) (token system internals)

---

### PHASE 16 — Public API
**Goal:** Clean, stable, documented API surface. Freeze it before npm publish.

```js
// Content
editor.getHTML()                        // → string
editor.setHTML(html)                    // void
editor.getText()                        // → string
editor.getJSON()                        // → object (structured doc)
editor.setJSON(obj)                     // void
editor.isEmpty()                        // → boolean
editor.getWordCount()                   // → number
editor.getCharCount()                   // → number

// Editor state
editor.focus()
editor.blur()
editor.enable()
editor.disable()
editor.setReadOnly(bool)
editor.isReadOnly()                     // → boolean
editor.setTheme(name)                   // 'light' | 'dark' | 'minimal' | 'auto'
editor.getTheme()                       // → string
editor.setCSSVar(name, value)           // per-instance token override (guarded)
editor.getCSSVar(name)                  // → string (computed value)
editor.setDirection(dir)                // 'ltr' | 'rtl'
editor.getDirection()                   // → 'ltr' | 'rtl'
editor.toggleFullscreen()
editor.isFullscreen()                   // → boolean
editor.print()                          // opens the print dialog with editor content
editor.reset()                          // → boolean — re-render from the last clean snapshot (crash recovery)
editor.destroy()

// History
editor.undo()
editor.redo()
editor.canUndo()                        // → boolean
editor.canRedo()                        // → boolean

// Selection
editor.selection.get()                  // → SelectionInfo
editor.selection.save()                 // → bookmark
editor.selection.restore(bookmark)
editor.selection.getHTML()              // → string
editor.selection.getText()              // → string

// Commands
editor.commands.execute(name, ...args)
editor.commands.isActive(name)          // → boolean
editor.commands.isEnabled(name)         // → boolean
editor.commands.getAll()                // → Map<name, descriptor>
editor.commands.register(name, descriptor)

// Plugins
editor.plugins.install(plugin)
editor.plugins.uninstall(name)
editor.plugins.get(name)                // → plugin instance
editor.plugins.getAll()                 // → Map<name, instance>

// UI (shared primitives)
editor.ui.modal.open(config)            // → Promise<result>
editor.ui.modal.close()
editor.ui.tooltip.show(el, text)
editor.ui.tooltip.hide()
editor.ui.contextMenu.show(x, y, items)
editor.ui.contextMenu.hide()

// Events
editor.on(event, handler)
editor.off(event, handler)
editor.once(event, handler)
editor.emit(event, payload)             // emit a custom event (also used by plugins)

// Shortcuts
editor.shortcuts.register(keys, command, label)
editor.shortcuts.unregister(keys)
editor.shortcuts.getAll()           // → Map<keys, descriptor>

// Introspection
editor.getContainer()               // → HTMLElement (the element you passed in; contains .oe-wrapper)
editor.getEditorElement()           // → HTMLElement (the contenteditable node)
editor.getVersion()                 // → string (the package version)
editor.isDestroyed()                // → boolean (guard for async callbacks)
editor.selection.selectAll()        // programmatic select-all via selection API
```

**Events** — the frozen public event surface, grouped by category. Every event
below is actually emitted; the payload column is part of the frozen contract.

*Content & change*
| Event | Payload | Notes |
|---|---|---|
| `beforeChange` | `{ inputType, data, preventDefault() }` | Fires at `beforeinput`, **before** the DOM mutates. `preventDefault()` cancels the change. *Does not fire during IME composition (CJK/accents) — composed text can't be vetoed per-keystroke; use `onChange` to observe the committed result.* |
| `onChange` | `{ html, text }` | Debounced content-change signal. Also driven by `config.onChange` (fn or `{handler,debounce}`). |
| `beforeSetHTML` | `{ html, preventDefault() }` | Fires before `setHTML()` applies. `preventDefault()` aborts it entirely. |
| `setHTML` | `{ html }` | Post-hoc: `setHTML()` finished applying. |
| `reset` | `{ html }` | `reset()` recovered to the last clean snapshot. |
| `maxLengthExceeded` | `{ current, max }` | An edit was blocked by `maxLength`. |

*Focus, selection, state*
| Event | Payload |
|---|---|
| `focus` / `blur` | native `FocusEvent` |
| `selectionChange` | selection info object |
| `stateChange` | `{ key, value }` |
| `readOnlyChange` | `{ readOnly }` |
| `directionChange` | `{ direction }` |
| `themeChange` | `{ theme }` |

*Commands & history*
| Event | Payload | Notes |
|---|---|---|
| `beforeCommand` | `{ command, args, preventDefault() }` | `preventDefault()` cancels the command. |
| `afterCommand` | `{ command, args }` | |
| `undo` / `redo` | `{ index }` | |

*Paste* — `beforePaste` / `afterPaste` (native `ClipboardEvent`; cancel via the DOM event's `preventDefault()`).

*Lifecycle* — `beforeInit`, `init`, `afterInit`, `ready`, `beforeDestroy`, `destroy` (payload: the editor instance).

*Autosave* — `autosaveSaved` `{key}`, `autosaveRestored` `{key,html}`, `autosaveFailed` `{key,error}`, `autosaveDraftSkipped` `{key,html}`.

*Plugins* (frozen) — `pluginInstalled` `{name,plugin}`, `pluginUninstalled` `{name}`.

*Errors* (frozen) — `error` `{ error, context }` (emitted from plugin/command catch sites; the documented reporting hook — see 16.5.5), `clipboardError` `{operation}`.

> **Feature events — stable from 1.x, NOT frozen:** `imageSelected`/`imageDeselected` `{figure}`, `tableCellsSelected` `{cells}`, `fullscreenEnter`/`fullscreenExit` (editor), `sourceEnter` `{html}`/`sourceExit`, `resizeEditor` `{height}`. These are real, emitted, and safe to use, but — like `plugins.*`/`ui.*` — they may gain additive changes within 1.x and are not covered by the freeze contract test.

> **Raw DOM pass-through — NOT frozen:** `keydown`, `keyup`, `input`, `beforeinput`, `mousedown`, `mouseup`, `contextmenu`, `paste`, `compositionstart/update/end`, and `mutation` are re-emitted with their native event object for advanced integrations. Their shape follows the platform, not this API.

**Clean output:** Every method above works exactly as documented. No undocumented behavior. ✅ **Phase 16 complete** (`1.0.0-rc.1`) — the frozen surface (instance methods, namespaced methods, semantic events, config keys, return types, post-destroy safety) is **enforced by `tests/api-contract.test.js`**, which fails the build on any drift. Config typos warn (never throw); full config reference in [docs/CONFIG.md](docs/CONFIG.md). `beforeChange` / `beforeSetHTML` / `beforeCommand` are genuinely cancelable via `preventDefault()`; `config.onChange` accepts a callback.

> **Freeze boundary:** `editor.content/state/selection/commands/history/events/config`
> are **frozen** at 1.0 — no changes without a major bump. Per the original
> boundary note, `editor.plugins.*` and `editor.ui.*` are **"stable from 1.x"**
> (present and working, but may gain additive changes in 1.x) because their
> contracts leak internal shapes (two-step plugin register, raw-HTML UI sinks)
> that should settle before being frozen.

---

### PHASE 16.5 — Production Hardening
**Goal:** Make the editor survive real-world production use — large documents,
crashes, and unattended tab closes — before it is published. These are
cross-cutting concerns that have been referenced throughout but never owned by a
phase; lock them before 1.0.

Milestones:
- [x] 16.5.1 — **Large-document performance**: the MutationObserver count recompute (`getText()` walks the whole doc) is now **debounced 150ms + `requestIdleCallback`-deferred** instead of running synchronously per mutation ([editor-dom.js](packages/core/src/editor-dom.js)). `_state.wordCount/charCount` are eventually-consistent; `getWordCount()/getCharCount()` stay exact on demand. StatusBar already computed its own counts on an rAF throttle, so nothing user-visible regresses.
- [x] 16.5.2 — **Performance CI gates enforced**: [`performance.test.js`](apps/playground/tests/performance.test.js) asserts mount ≤100ms, `getHTML()` on a 10k-word doc ≤50ms, selection update ≤16ms on chromium — it runs in the CI `playwright test` job, so a regression fails the build. Current headroom is large (~3ms / ~1ms / ~0.4ms).
- [x] 16.5.3 — **`beforeunload` dirty guard**: `config.warnOnUnload` (default `false`) — when set and `isDirty`, triggers the browser's native "leave site?" prompt. Listener bound to `window` via `_boundHandlers` so `destroy()` removes it.
- [x] 16.5.4 — **Crash recovery**: autosave drafts now carry a companion `<key>:ts` timestamp, surfaced as `savedAt` on `autosaveSaved`/`autosaveRestored`/`autosaveDraftSkipped` so the host can decide if a draft is newer than loaded content (legacy drafts → `savedAt: null`, backward compatible). `editor.reset()` re-renders from the last clean snapshot (`_state.html`), emits `reset`, and on a render failure emits `error {context:'reset'}` + falls back to the empty floor.
- [x] 16.5.5 — **Telemetry / error-reporting hook**: [docs/ERROR-REPORTING.md](docs/ERROR-REPORTING.md) documents the `error` event contract (`{error, context}`, 14 command/plugin catch sites) + Sentry/Datadog/endpoint reporter examples. Honest scope note: a few low-level lifecycle catches log via the logger rather than emitting `error`. No core change.
- [x] 16.5.6 — **Memory-leak verification**: [`memory-leak.test.js`](apps/playground/tests/memory-leak.test.js) runs 100 create/destroy cycles in all 3 browsers — asserts 0 orphaned `.oe-wrapper`/`.oe-editor`, node count returns to baseline, and 0 stylesheet growth (injected styles are inject-once module singletons, deduped across instances — bounded by design, not a per-instance leak).

**Clean output:** A 10,000-word document edits without jank and passes all perf gates. Closing a dirty tab warns the user. A crash recovers from the last clean snapshot. 100 mount/destroy cycles leak nothing. ✅ **Phase 16.5 complete** — perf recompute throttled + CI-gated (mount/getHTML/selection budgets, chromium), `warnOnUnload` dirty guard, timestamped autosave + `editor.reset()` crash recovery, [error-reporting docs](docs/ERROR-REPORTING.md), and a 3-browser 100-cycle leak test (0 orphans, 0 style growth).

---

### PHASE 16.6 — Modern Editing UX
**Goal:** Close the "feels modern" gap against Jodit/CKEditor with the cheap, high-leverage
UX features that are buildable in raw JS on infrastructure the editor already has — a
slash-command palette, markdown autoformat, `@mentions`, and Notion-style block drag
handles.

**Competitive analysis (2026-07)** — the full gap list, and where each tier landed:
- **Tier 1** (CKEditor's real moat — the reasons people actually pay): real-time
  collaboration + multi-cursor presence, comments/track-changes, AI writing (chat,
  rewrite, review, translate), version history, and Word-import fidelity. All correctly
  premium-gated → **Phase 19: 19.7 (AI), 19.8 (Collaboration), 19.8b (Restricted Editing),
  19.9 (Comments), 19.10 (Version History), 19.6b (Word Import)**.
- **Tier 2** (modern editing UX, not yet table-stakes at either competitor — the actual
  opportunity to differentiate for free): slash-commands, markdown autoformat,
  `@mentions`, block drag-reorder. → **this phase, 16.6.1–16.6.4.**
- **Tier 3** (polish/compliance gaps): accessibility certification, multi-language UI
  packs, export/import formats. → **Phase 17: 17.10 (WCAG claim), 17.11 (locale packs)**;
  export/Word-import already covered above under Tier 1's `19.5/19.6/19.6b`.

This phase (Tier 2) is everything CKEditor/Jodit either lock behind a paid tier or
haven't polished at all, and this editor can ship it for free because the underlying
primitives (command registry, autocomplete grid, cancelable `beforeChange`) already exist.

Reused infrastructure (no new subsystem invented per milestone):
- `CommandManager` ([command-manager.js](packages/core/src/commands/command-manager.js)) — `editor.commands.execute()` is how every milestone below applies its result, so undo/redo and history snapshots stay correct.
- **Correction during execution:** the emoji/special-chars `char-grid.js` popup renders inside a centered *modal* (grid-of-buttons) — the wrong shape for a caret-anchored palette. Rather than force an ill-fitting reuse, a new shared primitive was built: [caret-popup.js](packages/core/src/ui/caret-popup.js) (`createCaretPopup` — range-anchored, viewport-clamped, arrow-key nav with wraparound, [11 tests](packages/core/tests/caret-popup.test.js)), used by both the slash palette (16.6.1) and mentions (16.6.3).
- The `input` event on the editor root ([editor-events.js](packages/core/src/editor-events.js)) — the interception point both slash-detection and markdown autoformat hook into.
- `escapeLinkBoundary` ([char-insert-utils.js](packages/core/src/plugins/chars/char-insert-utils.js)) — reused verbatim by mentions (16.6.3) before inserting a mention node, exactly as emoji/special-chars already do.
- `debounce` ([debounce.js](packages/core/src/utils/debounce.js)) — reused for the mentions plugin's async source querying.

Milestones:
- [x] 16.6.1 — **Slash-command palette**: typing `/` at the start of an empty block opens a searchable popup listing a curated set of core commands (paragraph, h1–h3, bulleted/numbered list, blockquote, code block, HR — [slash-command-data.js](packages/core/src/plugins/slash-command/slash-command-data.js); table/image/media are excluded because those toolbar buttons use direct `onClick`, not the command registry, so they have no registry entry to surface safely); arrow-key nav + Enter to run, Escape to dismiss, typing after `/` filters by label. Trigger detection is a pure function ([slash-detect.js](packages/core/src/plugins/slash-command/slash-detect.js), [8 tests](packages/core/tests/slash-detect.test.js)); plugin wiring in [slash-command-plugin.js](packages/core/src/plugins/slash-command/slash-command-plugin.js) ([8 tests](packages/core/tests/slash-command-plugin.test.js)).
- [x] 16.6.2 — **Markdown autoformat (typing shortcuts)**: common Markdown-ish patterns auto-convert as you type — `**text**`/`__text__` → bold, `*text*`/`_text_` → italic, `` `code` `` → inline code, `# `/`## `/`### ` at block start → heading 1/2/3, `- `/`* ` → bulleted list, `1. ` → numbered list, `> ` → blockquote, `` ``` `` on its own line → code block. Pure pattern matching in [autoformat-patterns.js](packages/core/src/plugins/autoformat/autoformat-patterns.js) ([20 tests](packages/core/tests/autoformat-patterns.test.js)), applied via `editor.commands.execute()` in [autoformat-plugin.js](packages/core/src/plugins/autoformat/autoformat-plugin.js) ([12 tests](packages/core/tests/autoformat-plugin.test.js)) so undo/redo stay correct. Config-gated (`autoformat: true` by default, added to `DEFAULTS`/`FROZEN_CONFIG_KEYS` in lockstep). **A genuine live-typing-only bug was found and fixed here** — see 16.6.5 below.
- [x] 16.6.3 — **`@mentions` autocomplete**: typing `@` (only after whitespace/start, rejecting email-like `user@host` patterns — [mention-detect.js](packages/core/src/plugins/mentions/mention-detect.js), [7 tests](packages/core/tests/mention-detect.test.js)) opens the same caret-popup, sourced from a configurable async `config.mentions.source(query)` provider; picking an item inserts a non-editable mention node (`<span data-oe-island="mention" data-oe-mention data-id="…" contenteditable="false">@label</span>` — [mention-dom.js](packages/core/src/plugins/mentions/mention-dom.js)) and applies `escapeLinkBoundary`. Debounced (150ms) with a query-id counter so a late-resolving stale response can never clobber a newer query's results ([mentions-plugin.js](packages/core/src/plugins/mentions/mentions-plugin.js), [8 tests](packages/core/tests/mentions-plugin.test.js) including the race-condition case). *(Moved here from the Phase 19 premium list — cheap to build on existing infrastructure, and a stronger free-tier differentiator than a paid one.)*
- [x] 16.6.4 — **Block drag-reorder handles**: hovering a top-level editable block (paragraph, heading, list item, blockquote — a narrower `REORDERABLE_TAGS` set than the general `BLOCK_TAGS`, deliberately excluding `td`/`th`/`tr`/`figcaption`) reveals a drag-handle; dragging it reorders the block via pure DOM primitives ([block-reorder.js](packages/core/src/plugins/block-drag/block-reorder.js), [11 tests](packages/core/tests/block-reorder.test.js)), with a live drop-indicator line and exactly one `history.takeSnapshot()` per completed drag — never for a no-op drop ([block-drag-plugin.js](packages/core/src/plugins/block-drag/block-drag-plugin.js), [6 tests](packages/core/tests/block-drag-plugin.test.js)).
- [x] 16.6.5 — **Cross-browser + a11y verification for all of the above**: [modern-ux.test.js](apps/playground/tests/modern-ux.test.js) — 11 Playwright specs × 3 browsers (33/33 passing on Chromium/Firefox/WebKit) covering slash-palette open/filter/click + keyboard-only ArrowDown+Enter + Escape; autoformat live bold/heading/list conversion; mentions click + keyboard-only + email-pattern rejection; block-drag real pointer-driven reorder + single-undo-reverts-whole-drag. **Caught a real bug jsdom unit tests could not**: typing `**bold**` character-by-character fired `italic` prematurely at the 7th keystroke (`**bold*`), stranding the outer `**` — invisible to any single-shot jsdom `input` event, only reproducible by simulating actual incremental keystrokes. Fixed in `matchInlinePattern` (reject a single-char marker match when the character immediately before it is the same marker — i.e. it's really the second half of an in-progress double-char pair) and locked in with 2 permanent regression tests that iterate every incremental prefix of `**bold**`/`__bold__`.

**Clean output:** Typing `/` inserts a heading/list/quote without touching the toolbar. Typing `**bold**` converts live, correctly, even mid-keystroke. Typing `@` and picking a user inserts a real non-editable mention. Dragging a block's handle reorders it with one undo step. All four are keyboard-accessible and verified across Chromium/Firefox/WebKit — 1894 unit tests + 536 e2e tests green project-wide, zero regressions.

---

### PHASE 16.7 — Competitive Parity Pass
**Goal:** Close the concrete, verified gaps found by a full Phase 0–16.6 re-audit plus a
feature-by-feature comparison against CKEditor 5 and Jodit — every milestone below traces
to a specific competitor behavior this editor doesn't yet match, confirmed by reading
*this codebase's actual source*, not assumed from a feature-name list.

**Audit method (2026-07):** independent agents (a) re-ran every gate (lint/unit/build/
contract-test) fresh rather than trusting prior claims, (b) read the table/image/link/
list/paste/find-replace/source plugin source directly and compared it line-by-line
against researched CKEditor 5 and Jodit behavior, (c) researched both competitors' docs
in depth (not just marketing copy) for 10+ feature areas. Result: **Phases 0–16.6 are
genuinely complete** — 1894/1894 unit tests passing, 0 lint errors, api-contract.test.js
shows zero drift between `DEFAULTS` and `FROZEN_CONFIG_KEYS`, zero `TODO`/`FIXME` markers
in `packages/core/src`. The only defects found were cosmetic (stale test-count prose,
3 undocumented-but-working config keys) — fixed in 16.7.0 below. Everything else in this
phase is genuinely new work, not a correction.

Where this editor is **already ahead**, confirmed (not assumed): Word/Google-Docs paste
cleanup (`word-lists.js` reconstructs nested lists from Word's fake-bullet paragraphs via
an explicit level-stack algorithm — deeper than anything found in Jodit's docs), the
image plugin's breadth (dual resize paths — drag *and* a numeric dialog with aspect-lock
— plus a real XHR upload adapter with progress/abort, `srcset` preservation, and a
link-wraps-image path that survives resize/align), and autosave (real timestamped-draft
crash recovery for free — Jodit's equivalent, the Backup plugin, is PRO-only/paywalled).

**STATUS: Phase 16.7 COMPLETE (2026-07-13).** All 10 milestones (16.7.0–16.7.9) done and
live-verified across Chromium/Firefox/WebKit. Two real bugs were caught only by real-browser
e2e (not jsdom): the typed-autolink nbsp/caret handling (16.7.2) and a stale status-bar count
after programmatic `setHTML` (16.7.9) — both fixed. Final gate: **1964 unit + 638 e2e passing
(13 skipped, 0 failed), 0 lint errors, all files ≤300 lines.**

Milestones:
- [x] 16.7.0 — **Doc hygiene**: fixed README's stale unit-test-count prose (was
  1757/1859, now 1894 unit + 536 e2e, verified live) and documented the three
  working-but-undocumented config keys (`autoformat`, `mentions`, `warnOnUnload`) in
  [docs/CONFIG.md](docs/CONFIG.md). Zero behavior change.
- [x] 16.7.1 — **List style auto-progression**: a brand-new sublist created by
  `indentLi` now auto-cycles `listStyleType` by nesting depth — `disc`→`circle`→`square`
  (wrapping) for `<ul>`, `decimal`→`lower-alpha`→`lower-roman` for `<ol>` — matching
  CKEditor's per-depth marker variation. Pure depth-counting + cycling logic lives in
  [list-style-depth.js](packages/core/src/commands/list-style-depth.js)
  ([6 tests](packages/core/tests/list-style-depth.test.js)); only applied when
  `indentLi` creates a genuinely new sublist, never when a later sibling indents into
  an already-nested (possibly user-styled) one — verified live in Chromium to depth 3
  and for both list types before locking in with
  [2 integration tests](packages/core/tests/list-commands-keyboard.test.js).
- [x] 16.7.2 — **Typed-URL autolink (not just paste)**: typing a bare URL then Space
  or Enter now auto-links it, matching CKEditor's live autolink (`installPasteAutolink`
  remains paste-only for pasted content; this adds a second, independent trigger).
  Space fires on the real `input` event; Enter does **not** — `handleEnterSplit`
  (`editing/block-editing.js`) performs the split programmatically and
  `preventDefault()`s the key, so the native `input` event never happens for Enter in
  this editor — this instead hooks `afterCommand: 'enterSplit'` and looks at the END
  of the block the split just left behind (not the new block the cursor moved into).
  Reuses the exact same `LONE_URL`/`TRAIL_PUNCT`/`isAllowedLinkHref` allowlist as the
  paste path (including deferring to media auto-embed for YouTube/Vimeo URLs, and
  skipping inside `<pre>`/`<code>`/an existing `<a>`). **Two real bugs found and fixed
  during live-browser verification, not caught by unit tests alone**: (1) contenteditable
  substitutes a non-breaking space for a just-typed trailing space, so a regular-space-only
  regex silently never matched — fixed by recognizing both U+0020 and U+00A0; (2) the
  first working version dropped/misplaced the separator around the new anchor and, for
  the Enter path, moved the cursor back into the just-linked block instead of leaving it
  in the new one — fixed by splitting the text node directly (bypassing
  `wrapSelectionInLink`'s selection-range path, which is designed for a different,
  multi-node use case) and by only repositioning the caret for the space trigger.
  `packages/core/src/plugins/link/link-behaviors.js`
  ([22 tests](packages/core/tests/link-behaviors.test.js),
  [9 e2e specs × 3 browsers](apps/playground/tests/typed-autolink.test.js)).
- [x] 16.7.3 — **To-do lists**: a real `<ul data-todo-list><li data-todo
  data-checked="…">` — deliberately NOT a raw `<input type="checkbox">`, which the
  sanitizer fully denies (`DENY_TAGS_FULL`) as a form-injection surface with no narrow
  safe exception like the iframe-embed allowlist has; the checkbox itself is a
  CSS-drawn `::before` ([todo-list-styles.js](packages/core/src/plugins/todo-list/todo-list-styles.js)),
  fully real ARIA via `role="checkbox"`/`aria-checked`. Toggle via clicking the
  checkbox glyph or `Ctrl/Cmd+Enter`; `[ ] `/`[x] ` + space autoformat triggers reuse
  the existing block-pattern mechanism in `autoformat-patterns.js`. Because it's a
  genuine `<ul>`/`<li>`, the existing list infrastructure (Tab/Shift+Tab nesting,
  Enter-exit-on-empty-item) works on it for free — verified live to nest 3 levels deep.
  **Two real bugs found during live-browser verification, not caught by unit tests
  alone**: (1) `insertTodoList` left the new `<li>` holding a single truthy-but-EMPTY
  text node (autoformat strips the trigger marker but leaves the emptied text node in
  place) rather than a genuinely empty element — a real browser refuses to treat that
  as a valid typing target, so the very next keystroke landed as a stray `<p>` outside
  the list entirely; fixed by checking the block's actual rendered content, not just
  `firstChild` truthiness, before deciding whether to insert a `<br>` placeholder.
  (2) a native browser Enter-split of a **checked** `<li>` clones ALL its attributes
  onto the new sibling, including `data-checked="true"` — a freshly split item must
  always start unchecked; fixed by arming the split in `onKeyDown` (which runs before
  the native split happens) and consuming it on the very next `input` event, since by
  the time `input` fires the split has already occurred with no reliable way to tell
  "just split from a checked item" apart from "user checked this pre-existing item"
  otherwise. `packages/core/src/plugins/todo-list/`
  ([8 DOM tests](packages/core/tests/todo-list-dom.test.js),
  [12 plugin tests](packages/core/tests/todo-list-plugin.test.js),
  [3 pattern tests](packages/core/tests/autoformat-patterns.test.js),
  [9 e2e specs × 3 browsers](apps/playground/tests/todo-list.test.js)).
- [x] 16.7.4 — **Find & Replace: whole-word toggle**: a `wholeWord` option added to
  both `findMatches`/`replaceAll` in
  [search-core.js](packages/core/src/plugins/find-replace/search-core.js) — a match
  only counts when a non-word character (or the string edge) sits on both sides,
  standard `\w`-style boundary semantics (letters/digits/underscore via `\p{L}\p{N}_`,
  Unicode-aware). A new toggle button sits next to the existing case-sensitive
  toggle in the find panel, same shape (icon button, `aria-pressed`, an `--on`
  modifier class) — verified live: searching "cat" in "a cat sat in the category"
  narrows `1/2` → `1/1`, and replace-all only touches the standalone word, leaving
  "category" untouched. Regex stays a conscious non-goal, unchanged.
  ([9 unit tests](packages/core/tests/find-replace.test.js) +
  [9 e2e specs × 3 browsers](apps/playground/tests/find-replace-whole-word.test.js)).
- [x] 16.7.5 — **Table properties: split into table-wide vs per-cell popups with real
  style/width controls**: the old flat "Table format" submenu (one hardcoded
  `1px solid #334155` cell-border style, no width/style choice, no table-vs-cell
  distinction) is replaced by two scoped dialogs
  ([table-props-dialog.js](packages/core/src/plugins/table/table-props-dialog.js)):
  **Table properties** (table width, alignment, and a grid border applied to the table
  and every cell) and **Cell properties** (per-side-or-all border, background, text
  color, and horizontal/vertical alignment — scoped to the drag-selection or the single
  right-clicked cell). Both compose a real CSS border shorthand from user-chosen
  width / style (solid/dashed/dotted/double/none) / color fields via a shared
  `composeBorder`, and reuse the existing pure ops in `table-format.js`
  (`setTableStyle`/`setCellBorder`/`setCellBackground`/…) — no new DOM-mutation logic,
  only the form UI + value composition. The color inputs are opt-in (checkbox-gated)
  so they don't clobber cells the user didn't mean to touch. The simple one-shot items
  (header toggle, caption, copy) stay as direct submenu entries.
  ([4 composeBorder unit tests](packages/core/tests/table-props-dialog.test.js),
  updated [context-menu unit tests](packages/core/tests/table-contextmenu.test.js),
  [2 e2e specs × 3 browsers](apps/playground/tests/table-properties.test.js) +
  rewritten [table-format e2e](apps/playground/tests/table-format.test.js)).
- [x] 16.7.6 — **Table column/row header-click selection**: clicking the thin top edge
  (≤8px) of a first-row cell selects the whole **column**; clicking the left edge of a
  first-column cell selects the whole **row** — the "click a header" pattern in both
  competitors. Built as `selectColumn(cell)`/`selectRow(cell)` on the existing
  [TableSelectionManager](packages/core/src/plugins/table/table-selection.js), reusing
  the exact same matrix + `cellsInRange` machinery as drag-selection (so the result is
  a normal rectangular range every downstream op — merge/delete/properties — already
  accepts), plus a `_headerZone` edge check in the existing mousedown handler that only
  treats the top edge of a *first-row* cell / left edge of a *first-column* cell as a
  header strip (an interior click never hijacks normal selection). No new selection
  model, no floating strip elements (avoiding the resize-overlay's scroll-sync cost).
  Discoverability note: the strips are click-active but have no persistent visual cue
  yet — a hover-highlight affordance is deliberately deferred to avoid a half-working
  partial-region CSS hint. ([6 unit tests](packages/core/tests/table-selection.test.js) +
  [3 e2e specs × 3 browsers](apps/playground/tests/table-header-select.test.js)).
- [x] 16.7.7 — **Source view: HTML syntax highlighting** *(chosen approach:
  highlight-overlay)*: the source `<textarea>` now has transparent text (caret still
  visible) sitting on top of a scroll-synced colored `<pre>` layer that re-highlights on
  every keystroke — real live coloring, fully zero-dependency (no Ace/CDN). The
  highlighter ([source-highlight.js](packages/core/src/plugins/source/source-highlight.js))
  is a pure tokenizer that wraps tag punctuation / tag names / attribute names / quoted
  values / comments in classed spans and **HTML-escapes every character** — the overlay
  is presentation-only (`pointer-events:none`, invisible text) and the raw textarea value
  stays the source of truth that re-enters exclusively via the sanitizer on exit
  (verified: a `<script>` typed in source view is stripped on the way back). Both layers
  share one `.oe-source__shared` class for pixel-exact font/padding/box alignment; token
  colors are semantic theme tokens. Config-gated (`sourceModeHighlight`, default true,
  added to `DEFAULTS`/`FROZEN_CONFIG_KEYS` in lockstep) — set false for the plain
  textarea. A `prefer-const` and a backtick-in-CSS-comment lint issue were caught and
  fixed during the build. ([8 highlighter unit tests](packages/core/tests/source-highlight.test.js) +
  [3 e2e specs × 3 browsers](apps/playground/tests/source-highlight.test.js), visually
  confirmed pixel-aligned).
- [x] 16.7.8 — **Responsive image output (`<picture>`/multi-breakpoint)**: `createFigure`
  now wraps the `<img>` in a `<picture>` when the upload response carries a `sources` array
  (`[{ srcset, media?, type?, sizes? }]`) — a server-contract addition, not client-side
  resampling (out of scope for a zero-dep editor). The `<img>` stays as the required
  fallback (last child of `<picture>`); when no sources survive scheme-checking it stays a
  bare `<img>` (no empty `<picture>`). Security: `<picture>`/`<source>` were added to the
  sanitizer allow-list, and every `<source srcset>` is scheme-checked by the *same*
  `sanitizeSrcset` policy as `<img srcset>` — an unsafe candidate drops that source's whole
  srcset (round-trip test confirms a `javascript:` source is neutralized to a bare, inert
  `<source>` while the safe fallback `<img>` renders). Split `insertFigure` +
  block-insertion helpers out to `image-dom-insert.js` to keep `image-dom.js` under the
  300-line limit. Verified live in all 3 browsers (round-trip preserves both `<source>`s +
  `media`/`srcset`; browser resolves the `<img>` through `<picture>`; unsafe srcset stripped).
- [x] 16.7.9 — **Word/char count depth**: `status-bar.js` now shows a selection-scoped count
  ("N words, N chars selected") whenever the selection is non-collapsed, reverting to the
  whole-document count on collapse. Reuses the existing `countWords` path + the selection
  manager's `getSelectedText()` — no new counting logic. **Real bug found & fixed live:** the
  status bar only listened to `input`/`selectionChange`/`afterCommand`, so a programmatic
  `setHTML` left the counts stale (e.g. stuck at "0 words") — the 16.7.9 e2e caught it in
  Chromium/WebKit (Firefox happened to mask it via timing). Fixed by having the status bar
  also subscribe to the `setHTML` event (with matching `off()` in `destroy()`). Verified live
  in all 3 browsers (full-select → scoped count; partial-select → only selected words;
  collapse → reverts).

**Explicitly deferred, not forgotten:**
- **Region-level restricted editing** (lock part of a document while leaving the rest
  editable) — real gap versus both competitors' composable readonly-lock models, but
  substantial enough to stay under **Phase 19: 19.8b** as already planned, not folded in
  here.
- **Image crop/rotate** — Jodit has a full modal image editor; CKEditor doesn't either
  (paid CKBox only). Confirmed NOT a universal gap — now scheduled as **Phase 20.5**.
- **Excel/Sheets-specific paste-table cleanup** — confirmed absent in both this codebase
  and (per research) undocumented in Jodit's own docs. An opportunity, not a competitive
  deficiency; now scheduled as **Phase 20.4**.
- **WCAG 2.1 AA certification claim + axe-core sweep** — CKEditor is WCAG 2.2-certified
  with a published VPAT and a documented `Alt+F10`/`Alt+F9`/`Alt+0` focus model; this is
  arguably the single largest remaining gap, but it's already scoped as **Phase 17.10**
  and belongs there (it's a publishing-readiness gate, not a feature gap).

**Clean output:** Nested lists auto-vary their marker per depth. Typing a bare URL then
space/Enter turns it into a link without needing to paste it. `[ ] ` creates a real
checkbox list item. Find & Replace has a whole-word toggle. Table formatting is split
into table-wide and per-cell scopes with real border-width/style choices. Clicking a
column/row header selects the whole column/row. Source view shows syntax-highlighted
HTML. Selecting text shows a selection-specific word/char count alongside the
document-wide one.

---

### PHASE 17 — npm Publishing
**Goal:** Ships as **`@open-editor-hq/core`** — a proper npm library, usable via script
tag or bundler. **One name forever**: the rc publishes under the `next` dist-tag on the
final name; 1.0.0 promotes the same name to `latest`. (The earlier two-name plan — a
`omi-open-editor` rehearsal → scoped rename at stable — was retired on 2026-07-14 once
the `open-editor-hq` orgs were actually claimed: dist-tags already provide the rehearsal
safety, and a single identity is simpler for users. Worst-case rc mistake burns a version
*number*, never the name.)

**Distribution posture (decided 2026-07-14): minified-only.** The tarball ships
production builds exclusively — per-module-minified ESM tree (tree-shaking preserved),
minified CJS/UMD/single-file-ESM, **no sourcemaps**, no public repository for now. MIT
license kept. Rationale: the owner isn't ready to publish readable source; closed→open
is always possible later, open→closed never is. **Standing recommendation, unchanged:**
the industry standard (Jodit, CKEditor, TinyMCE) is open core + closed premium, and
opening the free core remains this project's strongest adoption wedge — revisit at the
1.0.0 promotion with real rc traction data. CI enforces the posture (`*.map` files in
dist fail the build).

**Package identity (verified against the live registry):**
- Bare `open-editor` is **permanently unavailable** — owned by sindresorhus, actively
  maintained at v6.0.0; npm disputes never transfer active packages. Not obtainable, ever.
- Future stable identity: **`@open-editor-hq/core`**, with `@open-editor-hq/react|vue|angular`
  (Phase 18), `@open-editor-hq/locale-*` (17.11), and `@open-editor-hq-premium/*` (Phase 19)
  as siblings — the scoped family pattern used by CKEditor/Tiptap/Lexical/Angular themselves.
  **Identity history (2026-07-14):** the originally-planned `open-editor` org name turned
  out to be TAKEN in npm's shared user/org namespace — the create-org API redirected to an
  existing entity (surfacing as a broken page / `"<h1>Redirect…"` JSON-parse console error;
  a throwaway org name created fine in the same session, isolating the cause). Fallback
  ladder was pre-agreed; rank 1 won: **`open-editor-hq`** ("headquarters" — the standard
  qualifier convention: vuejs/expressjs/nestjs don't own their bare words either; `-js` was
  ranked below it due to Editor.js adjacency). CLAIMED (owner-account, 2026-07-14): npm orgs
  `open-editor-hq` + `open-editor-hq-premium`, GitHub org `open-editor-hq` — one string
  across both registries. The identity hard-locks only at 17.13 (first stable publish);
  until then a rename costs nothing (the rc never references the scope).
- The rc and the stable share the single name **`@open-editor-hq/core`**, separated only
  by dist-tags (`next` vs `latest`) — no rename, no deprecation dance, users only ever
  learn one install command.
- Product name stays **"Open Editor"** everywhere (GitHub/docs/marketing); the class
  stays `OpenEditor` and the CSS prefix stays `oe-` — package name ≠ frozen API, and
  renaming the frozen surface would break the 1.0.0-rc contract for zero benefit.
- **Ownership/migration rule:** initial setup under the personal account is fine —
  org ownership transfers later via invite → promote-to-Owner → remove (zero user
  impact, no republish). The one hard rule: **publish under the ORG scope, never a
  personal scope** — personal scopes are permanently welded to their account.

Milestones (execution order; full gate — lint + unit + e2e — after every step):
- [x] 17.0 — *(fully done: b+c 2026-07-13, a 2026-07-14)* **Pre-flight**: rename
  sweep landed — core is `omi-open-editor`, dist files renamed, workspace deps/imports/
  vite alias/root scripts updated, grep gate clean; CHANGELOG gained its 16.7 entries +
  the 16.7.9 status-bar fix; CONFIG.md documents `imageUploadUrl` + the `sources`
  responsive-upload contract. **Real bug found while paying the debt:** `imageUploadUrl`
  was read by the image plugin but never registered in DEFAULTS/FROZEN_CONFIG_KEYS, so
  setting it (the documented way to enable uploads) fired a FALSE "unknown config option
  — ignored" warning — fixed in lockstep (DEFAULTS + contract test + docs). Gate: lint 0,
  unit 1964, e2e 638+13sk (one Firefox media-embed flake failed under 4-worker load,
  passed 36/36 under isolation + 3× stress, clean full re-run). **(a) Registry identity —
  DONE by the account owner (2026-07-14):** npm account + 2FA + verified email; the
  planned `open-editor` org name proved TAKEN (see identity history above) → claimed
  **`open-editor-hq`** + **`open-editor-hq-premium`** on npm and **`open-editor-hq`** on
  GitHub. Only `npm login` on the dev machine remains, needed first at 17.12 (rc publish).
  **(b) Rename sweep:** all 5 `package.json` names (`omi-open-editor` core, scoped
  pattern for the rest), dist filenames, README quickstart, CHANGELOG title — grep gate:
  zero stale bare-`open-editor` package references. **(c) Doc debt (2026-07 audit):**
  CHANGELOG gains its missing Phase 16.7 entries; docs/CONFIG.md documents the 16.7.8
  `sources` upload-response contract (`{ url, sources: [{srcset, media?, type?, sizes?}] }`)
  next to `imageUploadUrl`.
- [x] 17.1 — *(done 2026-07-13)* **Rollup builds**: six artifacts ship — ESM/CJS/UMD ×
  plain/`.min` (via `@rollup/plugin-terser`, devDep only — runtime stays zero-dep), all
  with sourcemaps. All three verified LIVE on the **minified** variants: UMD script-tag
  in real Chromium (global `OpenEditor` namespace → `new OpenEditor.OpenEditor(...)`;
  toolbar + contenteditable mount, round-trip, zero page errors), CJS `require()` +
  jsdom mount (setHTML/getHTML round-trip, command execute, clean destroy), native-Node
  ESM import (named exports intact). Early size read: min+gz full ≈ **112KB** — the
  <80KB target (17.7) will need the planned tree-shaking + escape hatches, quantified
  now rather than discovered later. *(Sourcemaps folded in here; the old standalone
  "17.5" milestone number is retired so it can't be confused with PHASE 17.5.)*
- [x] 17.2 — *(done 2026-07-13)* **CSS bundle** `dist/omi-open-editor.css` (~80KB, 23
  style blocks), generated by `scripts/extract-css.mjs`: boots a REAL editor with every
  plugin in jsdom (styles land via the `<style>`-tag fallback in exact runtime cascade
  order) + a belt-and-braces pass calling every `*-styles.js` inject function. **Real
  gap caught by the completeness diff:** the modal/tooltip/context-menu styles inject
  lazily on first OPEN — a plain boot missed all three, so the script now exercises
  each primitive once. Verified in real Chromium: computed styles of key surfaces
  recorded → ALL injected styles wiped (5/5 visibly collapsed, proving the wipe) →
  static file linked → 5/5 restored exactly. Wired into `build`/`prepack`/
  `prepublishOnly` so the tarball always carries a fresh bundle.
- [x] 17.3 — *(done 2026-07-13)* **TypeScript declarations** `index.d.ts` (hand-authored,
  ~430 lines): `OpenEditor` class (all 37 frozen methods), typed `OpenEditorEventMap`
  (33 frozen events with payload shapes; non-frozen names stay open via an overload),
  `OpenEditorConfig` (all 44 keys, precise types), `SelectionInfo`/`CommandDescriptor`/
  `EditorPlugin`/`EditorJSON`, all 18 plugin factories, and the utility exports. Guarded
  two ways in `tests/types-contract.test.js` (runs inside the normal unit gate, no CI
  change needed): **(1) lockstep** — the frozen name arrays are parsed out of
  `api-contract.test.js` text (single source of truth) and every name must appear in the
  d.ts; **(2) compile** — `tests/types/consumer.ts`, a realistic strict-mode consumer,
  must pass `tsc --strict` (TS 7; `baseUrl` removal handled). Verified against the REAL
  packed tarball: `npm pack` → install into a scratch project → same consumer compiles
  via the exports-map `types` condition. `types` field + condition wired
  (types-first ordering), `index.d.ts` added to `files`.
- [x] 17.4 — *(done 2026-07-13)* **`package.json` exports map**: `main`/`module`/`types`/
  `exports` + `"./styles"` subpath (→ the static CSS) + `"./package.json"`;
  `sideEffects: false` declared after a top-level-execution audit (no module-scope
  calls/IIFEs; all style injection is call-time) and then PROVEN empirically by 17.6.
  All five resolutions verified from the real packed tarball: node ESM import, CJS
  `require()`, `types` condition (tsc), `require.resolve('omi-open-editor/styles')`.
  **Per-plugin subpaths dropped as unnecessary** — with the 17.6 module-tree fix,
  tree-shaking from the MAIN entry already strips unused plugins, which is better DX
  than subpath imports (decision recorded here deliberately).
- [x] 17.6 — *(done 2026-07-13)* **Tree-shaking verified — after finding it BROKEN.**
  First measurement: a core-only consumer (esbuild, minified) bundling the flat
  single-file ESM build kept ~438KB raw — the ENTIRE library; flat bundles defeat
  consumer tree-shaking in practice. Fix: the ESM build now ships as a
  **preserved-module tree** (`dist/esm/`, 193 modules, `preserveModules: true`), so
  bundlers shake at module granularity; a single-file `esm.min.js` is kept for
  bundler-less `<script type="module">`/CDN use. Result: core-only bundle =
  **236KB raw / 62.5KB gz** with ZERO plugin code — the only two marker hits are
  legitimate core (the sanitizer's figcaption allowlist entry and the central
  forced-colors a11y sheet's `.oe-find__case--on` selector, both verified by reading
  the bundle context). Full gate re-run green (lint 0, unit 1969).
- [x] 17.7 — *(done 2026-07-13 — targets REVISED with the measured truth)* **Bundle size,
  measured and CI-gated.** Actual min+gz numbers after terser (17.1) + real tree-shaking
  (17.6): **core-only 60.9KB, full 111.5KB**. The original "<30KB core / <80KB full"
  aspirations predate implementation; the metafile breakdown shows the weight is evenly
  distributed across genuinely shipped features (largest single module: 6.8KB — toolbar
  system 93KB raw, 40+ commands 41KB raw, paste engine, sanitizer…), so reaching 30/80
  would require feature deletion, which this plan forbids. Competitive context (min+gz):
  Jodit 4 ≈ 90–100KB, CKEditor 5 classic ≈ 200KB+ — **this editor is the smallest
  full-featured option measured**. Enforcement: `scripts/check-size.mjs` (rollup+terser
  in-memory core-only build + gz of the shipped full artifact; zero new deps) wired into
  CI — budgets **core ≤66KB / full ≤118KB gz** (baseline +5% headroom); raising a budget
  is a conscious reviewed act, lowering is welcome. Future path to a true <30KB build
  recorded: a `/headless` entry point (no toolbar/UI chrome) — market-validated demand,
  a Phase-18+ candidate, not a launch blocker. Also fixed here: CI's dist-verification
  step still referenced the OLD `open-editor.*` filenames (my rename grep-gate only
  covered js/json/md, not yml — gap closed with an all-filetype sweep, now CLEAN).
- [x] 17.8 — *(done 2026-07-13)* **Dry run + tarball verification.** Tarball audit:
  zero src/tests/scripts leaks; LICENSE + `index.d.ts` + static CSS ship; 400 files /
  3.6MB packed (sourcemaps included by design). **Gap caught & fixed:** `packages/core`
  had no README — the npm package page would have been empty (the root README lives
  outside the package); a focused npm-facing README now ships (no fabricated repo links
  — the public home link lands with the first publish). All three consumers verified
  from the INSTALLED tarball: **Node CJS** (require + jsdom mount + round-trip +
  destroy), **static UMD** (real Chromium, toolbar + contenteditable, zero page
  errors), **Vite ESM** (full pipeline: `vite build` → preview server → real typed
  interaction — type, select-all, bold applies `<strong>`, undo reverts it, table +
  to-do toolbar buttons present; core+2-plugins bundle = **71.7KB gz**, proving
  proportional tree-shaking in a real consumer pipeline).
- [x] 17.9 — *(done 2026-07-14)* **Plugin authoring guide** — [docs/PLUGINS.md](docs/PLUGINS.md):
  the plugin contract, lifecycle rules, toolbar buttons, commands/events/sanitizer
  guidance, testing on `createTestEditor`, publishing conventions
  (`open-editor-plugin-*`, peerDependencies), and a complete worked example (word-goal
  chip) exercising factory options, events, a command, a shortcut, styles, and teardown.
  **Verified the hard way** — the example is extracted VERBATIM from the doc and run
  against the LIVE npm package in real Chromium + the doc's test snippet in jsdom.
  That verification caught THREE real doc/type bugs before any third party could:
  **(1)** `index.d.ts` mistyped `shortcuts.register` (it binds a command NAME and emits
  a `'shortcut'` event — it does not take a handler) and `createTestEditor` (returns
  the editor directly); rc.1's published types carry the error, fixed for the next
  release + locked by the type-consumer fixture. **(2)** `commands.execute()` returns a
  success BOOLEAN, never the command's return value — guide now teaches
  commands-as-actions + plugin-method reads; d.ts return type corrected to `boolean`.
  **(3)** the example's own tooltip `setTimeout` outlived `destroy()` and crashed on
  the nulled accessors 1.2s later — exactly the bug class the guide's checklist warns
  about; fixed with a tracked, cleared timer (and the war story is now IN the guide).
  Plus: `getContainer()` is nulled post-destroy — teardown order documented.
- [x] 17.10 — *(done 2026-07-14)* **Accessibility conformance claim** —
  [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md): an honest WCAG 2.1 AA self-assessment
  (scope, feature table, known limitations incl. the un-automated 400%-zoom check and
  informal-only screen-reader walkthroughs) backed by a NEW CI-enforced axe sweep
  ([accessibility-sweep.test.js](apps/playground/tests/accessibility-sweep.test.js)) that
  opens all 16 surface states — every dropdown/dialog/picker/panel/palette, source view,
  rich content, context menu, dark theme, fullscreen, live selection count — and asserts
  zero critical/serious WCAG A/AA violations, so the statement cannot silently rot.
  **The sweep immediately earned its keep: 7 REAL violations found and fixed** —
  *(critical)* the caret popup's empty state broke `role="listbox"` child rules (now
  role-swaps to `status`); *(critical)* size/line-height dropdowns put a text input
  inside `role="menu"` (now correctly dialogs, options as plain buttons);
  *(serious ×5)* suggestion popup had no accessible name (now labelled per purpose) and
  wasn't keyboard-reachable (options are now real focusable buttons), plus four AA
  contrast failures (image-dialog char counter, color-picker field/section labels, OK
  button on focus-ring background) — all re-mapped to compliant tokens. Also: the sweep
  exposed that dropdown triggers/pickers carry no `data-name` (aria-label is their
  contract — as a screen reader sees them). Gate after fixes: lint 0, unit 1969,
  **e2e 686** passed + 13 known skips across all 3 browsers. *Note: these a11y fixes
  postdate the published rc.1 and ship with 17.13's 1.0.0.*
- [x] 17.11 — *(done 2026-07-14)* **Four complete UI locale packs ship in the box**:
  Spanish, French, German, and **Arabic (the RTL proof case)** — all 73 keys each,
  importable as named index exports (`localeEs`…, tree-shaken away for non-users —
  core-only stays 61KB gz) or per-language subpaths
  (`@open-editor-hq/core/locales/ar`), CI-locked by `locales-lockstep.test.js` (exact
  EN-key-set cover, so a new UI string can never silently ship untranslated + an
  anti-copy-paste sanity check). **Real i18n bug found & fixed on the way:**
  `toolbar-button.js` resolved labels as `item.tooltip || t(locale, …)` — literal
  tooltip BEFORE locale — so 13 plugin buttons (image, link, table, to-do, find &
  replace…) leaked English through every translation; precedence flipped to
  locale-key-first (plugin literals stay as third-party fallback) + 4 missing EN keys
  added with their exact legacy strings (zero visible EN change). Also learned:
  rollup strips unused `default` exports from built modules — packs are NAMED exports
  only, verified from the real tarball both ways. Live RTL proof
  ([locale-rtl.test.js](apps/playground/tests/locale-rtl.test.js), 3 browsers):
  Arabic toolbar aria-labels, `dir="rtl"` applied, Arabic typing round-trips, Arabic
  status-bar counts, bold applied via the Arabic-labelled button. Translations are
  community-grade — native-speaker review invited in docs. Gate: lint 0, **unit 1982**
  (153 files), **e2e 698** + 13 known skips, size 115.3/118KB budget.

- [x] 17.12 — *(done 2026-07-14 — LIVE)* **Published `@open-editor-hq/core@1.0.0-rc.1`**
  (`--access public --tag next`; the 2FA security-key approval was performed by the
  account owner — web-auth flow, `PUT 200`, `exit 0`, shasum
  `0bb3ca8…31cbd`). **Post-publish reality #1:** the package spent ~15 minutes in
  npm's automated first-publish security review (visible in `npm access list` but 404
  on the public endpoint — normal for new accounts, cleared on its own; a registry
  watcher caught the flip). **Post-publish reality #2, plan correction:** npm assigns
  `latest` to a package's FIRST publish regardless of `--tag`, so `latest` ALSO points
  at the rc — plain `npm install @open-editor-hq/core` installs `1.0.0-rc.1` today
  (npm requires a `latest` tag to exist, so this cannot be removed, only re-pointed at
  1.0.0 in 17.13; docs updated to match reality). Live verification, all green: fresh
  registry install (CJS + ESM, shasum matches), and the **unpkg CDN script-tag in real
  Chromium** — `https://unpkg.com/@open-editor-hq/core@next` resolves the UMD build,
  editor mounts, zero page errors. 17.9/17.10/17.11 now run AGAINST this published rc.
- [x] 17.13 — *(done 2026-07-14 — LIVE)* **`1.0.0` published as `latest`** by the account
  owner (security-key web-auth). Registry verified: `dist-tags { latest: 1.0.0, next:
  1.0.0-rc.1 }`, plain `npm install @open-editor-hq/core` delivers 1.0.0 (CJS + ESM +
  the Arabic locale subpath all exercised from the live registry), unpkg CDN serves the
  1.0.0 UMD (mounted in real Chromium, zero page errors). 1.0.0 additionally ships
  everything rc.1 predates: the corrected d.ts signatures, the 7 axe fixes, 4 locale
  packs, the i18n precedence fix, and 17.5.1 change case (fully gated before the
  publish, per the milestone-boundary rule). Release committed + git-tagged `v1.0.0`
  (push to the remote is the owner's call). **Open-source checkpoint stands open:** the
  GitHub repo is currently PUBLIC (source visible), which supersedes the minified-only
  posture in practice — owner decision pending: keep public (recommended: open core)
  or make private. **PHASE 17: 14/14 COMPLETE.**

**Execution order:** 17.0 → 17.1 → 17.2 → 17.3 → 17.4 → 17.6 → 17.7 → 17.8 →
**17.12 (rc live on `next`)** → 17.9 → 17.10 → 17.11 → **17.13 (1.0.0 → `latest`)**.
Effort ranking: 17.3 (types) > 17.7 (size) > 17.10 (a11y sweep) > everything else;
17.0–17.2, 17.4 are mostly mechanical, 17.8/17.12 are checklists.

**Clean output:** `npm install @open-editor-hq/core@next` works today — VERIFIED LIVE
(plain installs also resolve to the rc, since npm gives a first publish the `latest`
tag; 17.13 re-points it at 1.0.0). Script tag UMD works from a CDN — VERIFIED LIVE. Bundle sizes measured and CI-gated; no sourcemaps or readable
source in the tarball (posture enforced by CI). A third party can write a plugin
following the guide against the published package. A published accessibility statement
backed by an axe-core report. At least a few non-English UI locales ship complete. The
`open-editor-hq` and `open-editor-hq-premium` orgs are owned (npm + GitHub), and
ownership is transferable to the production account with a role change.

---

### PHASE 17.5 — Free-Tier Competitive Sweep
**Goal:** Close every remaining *free-tier* gap versus CKEditor 5 (GPL package, v48.3) and
Jodit 4.x (MIT core) — plus ship free a handful of features BOTH competitors charge for —
so the launch-day comparison table has no losing rows.

**Source (2026-07 competitive analysis, post-16.7):** three independent research passes —
CKEditor 5 verified against the actual `ckeditor5` vs `ckeditor5-premium-features` npm
package split at v48.3.0 (the marketing site mislabels several free features as premium),
Jodit verified against its `src/plugins` source + PRO page at 4.12/PRO 4.13, and a
market-demand pass over HN/GitHub-issues/2025-26 editor surveys. Every milestone below
was then checked against *this codebase* before being listed (e.g. table column
drag-resize looked like a gap but is already built — 11.8 `table-resize.js` — so it is
NOT here). Discipline is identical to 16.7: one milestone at a time, live-verify in all
3 browsers, full gate after each, honest bug accounting in the checkbox note.

Ordered smallest-first for momentum. Config-freeze contract applies: any new config key
updates BOTH `editor-config.js` DEFAULTS and `api-contract.test.js` FROZEN_CONFIG_KEYS
in lockstep; any new `*-styles.js` registers in `no-color-literals.test.js`.

Milestones:
- [x] 17.5.1 — *(done 2026-07-14)* **Change case**: `changeCase('upper'|'lower'|'title')`
  command + a "Case" toolbar dropdown (3 options), in all 5 locale bundles. *CKEditor
  sells this as premium; Jodit sells it as PRO — free here.* Implementation transforms
  text-node DATA in place, so all inline markup survives exactly and the selection
  bookmark restores; Title Case tracks word state ACROSS node boundaries
  (`he<strong>llo</strong>` stays one word) and treats digits as word-continuation
  (**real bug caught by tests: `3rd` → `3Rd`** — fixed with a `\p{L}\p{N}` word-class).
  Skips `contenteditable=false` island internals. Also surfaced: three unit-test files
  selected dropdowns BY POSITION and broke when the new dropdown shifted indices —
  all hardened to aria-label selection (the same lesson 17.10 taught for e2e).
  Verified: 11 unit tests + 9 e2e across 3 browsers (markup-preserving UPPERCASE,
  split-word Title Case, one-step undo); toolbar snapshots regenerated. Gate: lint 0,
  unit 1993 (154 files).
- [x] 17.5.2 — *(done 2026-07-14)* **Text transformations (autocorrect)**: `(c)`→©,
  `(tm)`→™, `(r)`→® (instant), `1/2`/`1/4`/`3/4`→½¼¾ and `--`/`---`→–/— (on the following
  boundary, so `1/25` and `----` stay typable), context-aware smart quotes/apostrophes —
  new `textTransformations` config (true/false/per-group, in DEFAULTS+FROZEN+d.ts+docs),
  independent of `autoformat`, skipped inside `<code>`/`<pre>`, one undo restores the
  literal text. Pure matcher in `text-transformations.js`; applied on the existing
  autoformat input path. **Two real cross-browser bugs caught by the live-typing e2e
  (invisible to Chromium AND jsdom):** (1) Firefox/WebKit fragment live typing across
  multiple text nodes — matcher now gathers contiguous preceding text siblings (markup
  still bounds it); (2) the deeper one — after `setHTML('<p></p>')`, **Firefox spawned a
  NEW `<p>` per keystroke burst** because a childless block is an invalid caret target
  (same class as 16.7.3's empty-`<li>`); fixed at the root in the sanitizer's
  `normalizeStructure`: every empty block (`p`/headings/`li`/`td`/…) now gets its
  placeholder `<br>`, hardening ALL `setHTML` consumers editor-wide. Verified: 11 unit
  (matcher + editor path) + 3 normalize tests + 6 typing e2e × 3 browsers. Gate: lint 0,
  unit 2007, **e2e 725** + 13 known skips (full suite re-run — sanitizer change).
- [x] 17.5.3 — *(done 2026-07-14)* **Page break**: `insertPageBreak` command + toolbar
  button (icon + all 5 locale bundles) inserting `<hr class="oe-page-break">` — a VOID
  element deliberately (always a valid caret neighborhood, survives the sanitizer as-is,
  immune to the 17.5.2 empty-block normalize). Screen: dashed primary-colored rule;
  print: `break-after: page` — including inside `editor.print()`'s popup document,
  which previously shipped ZERO css (the rule now travels with it, verified by a
  captured-write unit test). Shares one insertion body with `insertHorizontalRule`
  (M-01 detached-fragment fix inherited, caret lands in a following `<p>`). *CKEditor
  free; Jodit charges (PRO).* Verified: 4 unit + 3 e2e × 3 browsers (toolbar insert +
  typing continues below, computed dashed style, `setHTML(getHTML())` round-trip);
  toolbar snapshots regenerated. Gate: lint 0, unit 2011, size 117.0/61.8KB gz.
- [x] 17.5.4 — *(done 2026-07-14)* **Show blocks**: `showBlocks` toggle command +
  toolbar button (active-state synced, all 5 locale bundles) flipping
  `.oe-editor--show-blocks` — dashed outlines + tag labels (P/H1–H6/QUOTE/PRE/UL/OL/
  TABLE/FIGURE, CSS `::before`; tag names are universal so no i18n needed in CSS).
  View-only by construction: `getHTML()` is byte-identical with the toggle on, and the
  command is READONLY-EXEMPT (chrome, not content — reviewers can inspect structure in
  a readonly editor). *CKEditor free; Jodit charges (PRO).* Verified: 4 unit + live e2e
  ×3 browsers (computed dashed outline + `::before` label + content-untouched +
  clean toggle-off); toolbar snapshots regenerated. Gate: lint 0, unit 2015.
- [x] 17.5.5 — *(done 2026-07-14)* **Accessibility help dialog**: `Alt+0` opens a
  shortcut reference built from the LIVE shortcuts registry (third-party registrations
  appear automatically; ctrl/meta twins deduped per platform, ⌘⇧⌥ glyphs on Mac),
  labels localized via the bundle (command-name keys → 'Negrita' under es), DOM-built
  body (no HTML-string sink), readonly-exempt, in the axe sweep. *CKEditor free.*
  **Three real bugs found by verification:** (1) the dialog had NO focusable element —
  keyboard-openable but not keyboard-closable (focus trap had nothing to grab, Escape
  never reached it) → localized Close button added (`close` key ×5); (2) deeper — the
  command pipeline's post-execute selection restore RE-FOCUSED THE EDITOR and stole
  focus from any modal a command opens → the dialog now opens on the next tick, after
  the pipeline completes; (3) the deferral let the sweep scan the truly-open dialog and
  axe caught `.oe-modal__body` being scrollable but keyboard-unreachable → the modal
  body now carries `tabindex="0"` EDITOR-WIDE (every long dialog is keyboard-scrollable
  now; the focus-trap tests were updated for the intentionally-new first-focusable).
  Verified: 4 unit + Alt+0 e2e ×3 browsers + sweep surface. Gate: lint 0, unit 2019,
  a11y e2e 75/75.
- [x] 17.5.6 — *(done 2026-07-14)* **`:` emoji autocomplete**: typing `:fire` suggests
  from the same dataset as the grid (custom `emojis` config respected), on the shared
  caret popup — token-guarded (`5:30`/URLs never trigger; ≥2 shortcode chars), arrows/
  Enter/Escape, 8-result cap, Escape keeps the literal text. *CKEditor free (v44.3);
  Jodit PRO.* **The verification chased a Firefox failure down to a LIVE 1.0.0 BUG in
  basic typing:** Firefox anchors select-all at the editor ROOT, so overtyping a
  selection deleted every block and typed into the bare root — **one new `<p>` per
  keystroke, shredding the document** (`getParentBlock` = null meant the existing
  multi-block merge silently bailed). Fixed on the keydown path for printable keys:
  multi-block selections collapse through the existing merge; root-anchored selections
  get an explicit `deleteContents()` + floor restore; the character then inserts
  natively into a valid block. Also extracted `utils/text-run.js` (gather/merge of the
  fragmented text run before the caret) — now shared by autocorrect and emoji
  autocomplete, the standard for any future caret-token feature. Verified: 4 unit +
  2 e2e ×3 browsers; probe-confirmed single-`<p>` DOM in Firefox. Gate: lint 0, unit
  2023, **e2e 749** + 13 known skips (full re-proof — core key path changed).
- [x] 17.5.7 — *(done 2026-07-14)* **Bookmarks / named anchors** — new `bookmark`
  plugin (19th in the box): toolbar button → name dialog → inserts
  `<a id class="oe-bookmark" contenteditable="false"></a>`, rendered as a flag marker
  (CSS `::before`, hidden in print — chrome, not content); click a marker to
  rename/remove; names validated (`[A-Za-z][\w-]*`, duplicates refused). **Link-dialog
  integration**: existing anchors offered as datalist suggestions and — the fix that
  made it possible — the URL field switched `type="url"` → `type="text"`, because
  native url-input validation silently REJECTS `#fragment` values (confirmed: full
  link-plugin regression suite green after the change). Sanitizer: `id` +
  `contenteditable` allowlisted on `<a>` (no new clobbering surface — `id` was already
  allowed on p/div/headings). *CKEditor free since v44.* Verified: 4 unit (round-trip
  with id, listBookmarks, `#href` passes sanitization) + 3 e2e ×3 browsers (dialog
  insert + computed flag glyph, datalist + fragment link end-to-end, click-manage
  remove); snapshots regenerated. Gate: lint 0, unit 2028 (160 files), e2e 87 in the
  affected suites.
- [x] 17.5.8 — *(done 2026-07-14)* **Styles dropdown**: new `styles` config
  (`[{ label, element?, classes }]`, in DEFAULTS+FROZEN+d.ts+docs) → a toolbar Styles
  dropdown that only RENDERS when presets are configured (zero toolbar noise
  otherwise — the playground's default toolbar proves the conditional in e2e). Block
  presets (p/h1–h6/blockquote/pre) convert the block via the existing per-tag commands
  and apply the classes with one-named-style-at-a-time semantics (sibling-preset
  classes replaced); reapplying toggles off. Inline presets wrap the selection in a
  classed `<span>` (toggle-off unwraps from within; v1 limitation documented: inline
  application is single-block). Sanitizer round-trip verified (class allowlisted).
  *CKEditor free ("Styles"); Jodit free (`class-span`).* Verified: 4 unit + 3 e2e ×3
  browsers (conditional rendering, live block + inline application through real
  dropdown clicks). Gate: lint 0, unit 2032 (161 files), size within budget.
- [x] 17.5.9 — *(done 2026-07-14)* **Type-around (add-new-line)**: always-on core
  behavior (`editing/type-around.js`, installed at init, torn down in `destroy()` —
  100-cycle leak test still green): hovering the top edge of a first-block island, the
  bottom edge of a last-block island, or the seam between two adjacent islands
  (table/figure/`data-oe-island`) reveals a primary-colored insert line with a `+`
  cap; clicking inserts `<p><br></p>` there with the caret in it (one undo step).
  The classic table-at-document-start trap is now escapable — e2e proves typing lands
  ABOVE the table. *Jodit free (`add-new-line`); CKEditor free (widget type-around).*
  **Real bug caught by the e2e's hanging click:** the affordance hid itself while the
  pointer traveled to it (root `mouseleave` + zone-miss fired mid-approach) — fixed by
  listening on the WRAPPER with the line stopping its own event propagation. Verified:
  3 unit + 2 e2e ×3 browsers + leak/island regressions. Gate: lint 0, unit 2035
  (162 files).
- [x] 17.5.10 — *(done 2026-07-14)* **Text-part language** (WCAG 3.1.2, Language of
  Parts): `textPartLanguage(code)` command wraps the selection in
  `<span lang="ar" dir="rtl">` — `dir` automatic for RTL scripts
  (ar/he/fa/ur/ps/sd/ug/yi/dv), toggle-off unwraps from inside, malformed codes
  rejected (BCP-47-shaped validation — `"><img>` can't smuggle). New
  `textPartLanguages` config (`[{code, label}]`, DEFAULTS+FROZEN+d.ts+docs) drives a
  conditionally-rendered Language dropdown (same zero-noise pattern as 17.5.8);
  sanitizer allowlists `lang` on `<span>` and the markup round-trips. *CKEditor free.*
  Verified: 3 unit + live e2e ×3 browsers (real selection → Arabic pick →
  `lang`+`dir` markup). Gate: lint 0, unit 2038 (163 files).
- [x] 17.5.11 — *(done 2026-07-14)* **Sanitizer allowlist extension, adversarially
  locked.** Investigation first: the mechanism ALREADY existed (`allowTags`/
  `allowAttributes`/`denyTags` config → forwarded into `sanitize()` — unlike
  `imageUploadUrl`, this plumbing was real) and was structurally hardened by
  construction: the deny-list is checked BEFORE the allowlist (so `allowTags:
  ['script']` is inert), `on*` handlers are stripped BEFORE the attr-allowlist runs
  (so they can't be re-enabled), and URL-sink attributes are scheme-checked BY NAME on
  any tag (an allowlisted `href` on a custom element still rejects `javascript:`).
  What 17.5.11 added: **(1) guardrail warnings** — configs asking for denied tags,
  `on*`, or `srcdoc` now warn loudly instead of failing silently (integrators learn
  the boundary); **(2) a 9-test ADVERSARIAL sweep**
  ([sanitizer-extension-sweep.test.js](packages/core/tests/sanitizer-extension-sweep.test.js))
  that tries to weaponize every extension path — script/iframe/object/form
  resurrection, handler allowlisting, srcdoc, javascript: through allowlisted sinks,
  CSS injection through extended style — all must FAIL forever, plus the legitimate
  CMS path (custom element + data-attrs, editor-config end-to-end) must WORK;
  **(3) explicit security-guarantee docs** in CONFIG.md. *CKEditor free (GHS).*
  Gate: lint 0, unit 2047 (164 files).
- [x] 17.5.12 — *(done 2026-07-14)* **Markdown export**: `editor.getMarkdown()` (new
  frozen instance method, contract + d.ts + type-consumer updated) — zero-dep GFM
  serializer over the sanitized canonical DOM: headings, emphasis/strike/inline-code,
  links, images + captioned figures, nested lists, **to-do lists (`- [x]`)**, ordered
  numbering, blockquotes, fenced code with language, hr, pipe tables, markdown-char
  escaping, bookmark anchors preserved as inline HTML anchors. Export-only by design —
  lossless MD⇄HTML stays premium (19.6). **CRITICAL 1.0.0 BUG FOUND by this
  milestone's tests: the sanitizer stripped ALL to-do attributes** (`data-todo-list`/
  `data-todo`/`data-checked`/checkbox roles were never allowlisted) — **saved
  checklists silently degraded to plain bullets on reload**; fixed + e2e-locked with
  an explicit save-reload cycle test, CHANGELOG entry added. Verified: 8 unit + 2 e2e
  ×3 browsers + todo/XSS regression suites (78 tests). Gate: lint 0, unit 2055
  (165 files).
- [ ] 17.5.13 — *(stretch — DEFERRED to post-1.1.0, 2026-07-14)* **Paste history**:
  dialog listing previous paste fragments for re-insertion. *Jodit free.* Deferred
  deliberately: the 12 core milestones + the five shipped-1.0.0 bug fixes they
  uncovered make 1.1.0 release-worthy NOW; the two stretch items follow as 1.2.0
  material rather than delaying the fixes.
- [ ] 17.5.14 — *(stretch — DEFERRED to post-1.1.0, 2026-07-14)* **Speech dictation**:
  Web Speech API voice-to-text (feature-detected). *Jodit free.* Same deferral
  rationale as 17.5.13.

**Clean output:** Every feature CKEditor's GPL package ships is either present or
consciously N/A — and change case, format painter, line height, slash commands, source
highlighting, to-do lists, emoji, mentions, and autosave-recovery (each premium/PRO at
one or both competitors) are all free here, keyless, zero-dep. The comparison table at
launch has no losing free-tier rows.

---

### PHASE 18 — Framework Wrappers
**Goal:** Native components for React, Vue, Angular that feel idiomatic.

Milestones:
- [ ] 18.1 — React wrapper: `<OpenEditor value={html} onChange={fn} />`, forwardRef for editor instance
- [ ] 18.2 — React: controlled + uncontrolled modes
- [ ] 18.3 — Vue wrapper: `<open-editor v-model="html" />`, exposes instance via template ref
- [ ] 18.4 — Vue: compatible with Vue 3 Composition API
- [ ] 18.5 — Angular wrapper: `ControlValueAccessor` for form integration
- [ ] 18.6 — All wrappers: zero additional dependencies beyond their own framework
- [ ] 18.7 — Each wrapper ships its own npm package: `@open-editor-hq/react`, `@open-editor-hq/vue`, `@open-editor-hq/angular`

**Clean output:** React/Vue/Angular demo apps all work with v-model / controlled value pattern.

---

### PHASE 19 — Premium Layer
**Goal:** License-gated features that generate revenue, completely separated from free core.

Milestones:
- [ ] 19.1 — License key format: signed JWT, validated client-side with embedded public key (no network call)
- [ ] 19.2 — `FeatureManager`: checks license payload for specific feature flags before activating premium plugins
- [ ] 19.3 — Invalid / expired license: shows non-blocking upgrade prompt, degrades gracefully
- [ ] 19.4 — Premium plugin: **SEO Analyzer** — keyword density, heading structure, readability score, meta description editor
- [ ] 19.5 — Premium plugin: **Export** — HTML to PDF (print API), HTML to DOCX (raw XML generation, no deps)
- [ ] 19.6 — Premium plugin: **Markdown Export** — converts editor content to clean Markdown string
- [ ] 19.6b — Premium plugin: **Word Import** — full-fidelity DOCX → editor HTML (styles, lists, tables, layout preserved), distinct from the free Phase-12 "paste from Word" cleanup, which only sanitizes/promotes pasted markup rather than parsing a `.docx` file directly. Tier-1 competitive gap: CKEditor gates this behind Professional+.
- [ ] 19.7 — Premium plugin: **AI Writing** — configurable API endpoint, streaming tokens at cursor. Tier-1 competitive scope (both CKEditor and Jodit Pro sell this): **(a)** Chat — multi-turn content generation in a side panel, **(b)** Quick Actions — rewrite/summarize/change-tone on a selection, **(c)** Review — grammar/clarity suggestions rendered as accept/reject (shares UI with 19.9 Comments' suggestion-thread rendering), **(d)** Translate. Ship (a)+(b) first; (c)+(d) can follow.
  **Tier split (amended 2026-07):** the raw *plumbing* — a BYO-endpoint/BYO-key command surface + streaming-insert-at-cursor hook — ships **FREE** in core (Jodit ships a free AI hook since 4.1; 2025-26 demand research: "the demanded shape is bring-your-own-API-key AI hooks — almost nobody offers this openly"). Premium 19.7 sells the *product* on top: the polished Chat panel, Review-as-suggestions, Translate, and any hosted convenience. Free plumbing is the funnel; the panel is the revenue.
- [ ] 19.8 — Premium plugin: **Collaboration** — WebSocket-based multi-user editing. Tier-1 scope: live multi-cursor + named presence indicators (who's editing where), no content locking, and comments/track-changes (19.9/19.9b) sync in real time when both are active — not just text merge in isolation.
  **Positioning (amended 2026-07):** must be **self-hostable with flat licensing** — the single loudest market complaint is metered "editor-loads" collab pricing (CKEditor/TinyMCE/Tiptap all meter it; Tiptap killed its free cloud tier in 2025). A self-hosted server binary + flat license is the sharpest attack on every incumbent. **Evaluate CRDT (Yjs-compatible wire format) over OT** before building — the CRDT ecosystem effect (existing providers/persistence adapters) may outweigh a bespoke OT implementation, and offline-first (20.3) falls out of the same data structure.
- [ ] 19.8b — **Restricted Editing / Permission Zones** — mark a sub-range of the document non-editable independent of whole-document `readonly` (e.g. a locked header/footer in an otherwise-editable contract template); role-based read-only mode.
  **Tier decision required (2026-07):** CKEditor ships this **free** (GPL package) — keeping it premium here charges for what the market leader gives away. Default recommendation: ship the basic mark-region-uneditable mechanism **free** (it composes from `contenteditable=false` islands the core already has) and keep *role-based permissions* (per-user zone rights, integrates with 19.8 presence) premium. Decide before building.
  <!-- Mentions moved OUT of premium to 16.6.3 (free) — cheap to build on existing
       autocomplete infrastructure, a stronger free-tier differentiator than a paid one. -->
- [ ] 19.9 — Premium plugin: **Comments** — inline comment threads anchored to text ranges, sidebar panel; suggestion-thread rendering shared with 19.7's Review mode
- [ ] 19.9b — Premium plugin: **Track Changes / Suggestion Mode** *(added 2026-07 — was
  MISSING from this plan entirely)* — edits recorded as accept/reject suggestions instead
  of direct changes (insertions/deletions/format-changes marked per author), suggestion
  balloons in the sidebar, accept/reject one or all, works standalone (async) and syncs
  live under 19.8. **This is CKEditor's single biggest moat** — demand research found
  "effectively no good free/open implementation; the feature people begrudgingly pay
  CKEditor for." Shares the suggestion-rendering UI with 19.7c (AI Review) and 19.9
  (Comments) — build the shared suggestion layer FIRST, then all three are consumers.
  Priority within Phase 19: directly after Export/Import (19.5/19.6b) and Version
  History (19.10) — the review bundle (comments + track changes + versions) is what
  teams actually buy.
- [ ] 19.10 — Premium plugin: **Version History** — named snapshot restore UI beyond undo/redo (Tier-1: CKEditor's third moat feature alongside collaboration/comments)
- [ ] 19.11 — Premium packages never bundled with free core, separate npm scope `@open-editor-hq-premium/`

**Document-app pack (added 2026-07 competitive analysis — all verified paid-only at
CKEditor, none previously in this plan):**
- [ ] 19.12 — Premium plugin: **Footnotes** — auto-numbered footnote references with a
  managed notes section (decimal/roman numbering, multi-block bodies). CKEditor shipped
  this premium in v47.2 (late 2025) and is actively pushing it.
- [ ] 19.13 — Premium plugin: **Multi-level legal lists** — 1 / 1.1 / 1.1.1 numbered
  lists with Word round-trip fidelity (pairs with 19.5/19.6b converters). CKEditor premium.
- [ ] 19.14 — Premium plugin: **Document outline + Table of contents** — sidebar heading
  tree (click-to-navigate) + insertable auto-updating ToC block. CKEditor premium. The
  heading data already exists in the canonical DOM — this is UI + anchor plumbing
  (reuses 17.5.7 bookmarks).
- [ ] 19.15 — Premium plugin: **Merge fields + Content templates** — `{{placeholder}}`
  tokens with preview/data modes (document automation / mail-merge), plus predefined
  insertable content structures. CKEditor premium; Jodit gates Templates behind OEM.
- [ ] 19.16 — Premium plugin: **Pagination** — live page boundaries matching PDF/Word
  print output (depends on 19.5 export engine for fidelity). CKEditor gates this behind
  its highest tier.
- [ ] 19.17 — *(evaluate only)* **Math** — MathML formula editing. Even CKEditor
  outsources this (third-party MathType). Evaluate demand post-launch before committing;
  do not build speculatively.

**Explicitly skipped (2026-07 analysis — low demand / gimmick, do not build):** Google-search
button, virtual keyboard, button generator, content minimap, Mermaid diagrams.

**Clean output:** License key unlocks features. No premium code ships in the free build. Collaboration works with two browser tabs open simultaneously.

---

### PHASE 20 — Engineering Moats (ongoing, post-launch)
**Goal:** Win on the axes *nobody* solves well at any price — per the 2026-07 demand
research, these are reputation moats, not feature-list rows: large-document performance,
mobile IME correctness, and offline resilience. Runs in parallel with 18/19 after Phase
17 ships; no milestone here blocks a release.

Milestones:
- [ ] 20.1 — **Large-document performance benchmark suite**: a public, reproducible
  benchmark (Playwright-driven) — load/typing-latency/paste time at 10k/50k/100k-node
  documents, numbers published in the README. Context: Lexical degrades/crashes around
  ~8,200 nodes in public stress tests; ~80% of surveyed developers rank performance
  first. Extends the existing 16.5.2 perf-budget harness from budget-gates to published
  comparative numbers. Fix what the benchmark exposes; the number IS the feature.
- [ ] 20.2 — **Android IME / composition hardening**: real-device test matrix (Gboard,
  Samsung Keyboard, SwiftKey; CJK + autocomplete composition) for the known
  contenteditable composition traps — "contenteditable on Android is the absolute worst"
  remains an open industry wound. The `_isComposing` guards exist (Phase 14); this
  milestone is systematic real-device verification + fixes, and a documented
  known-behaviors page for what platform bugs can't be fixed.
- [ ] 20.3 — **Offline-first autosave**: IndexedDB draft provider (larger quota than
  localStorage, structured snapshots), save-on-visibility-change, and a
  sync-when-online hook — the local-first storage layer that 19.8's collaboration can
  later share. No mainstream embeddable editor ships offline-first persistence as a
  first-class feature.
- [ ] 20.4 — **Excel/Sheets paste-table cleanup**: dedicated cleanup pass for
  spreadsheet clipboard HTML (colgroup widths, number-format spans, merged-cell
  artifacts) — absorbed from 16.7's deferred list; confirmed absent in Jodit's docs too,
  so this is an *ahead* move, not parity.
- [ ] 20.5 — **Image crop / rotate editor**: in-editor crop + rotate on the existing
  properties/action-bar surface (canvas-based, zero-dep) — absorbed from the long-standing
  "deliberately separate" future line. Jodit ships crop/resize free; CKEditor only via
  paid CKBox. Decide free vs premium at build time (lean free: it's a parity feature).
- [ ] 20.6 — **File manager**: server-connector-based media/file browser (folders,
  thumbnails, rename/delete, pick-to-insert). Jodit ships one free (connector required);
  CKEditor sells CKBox. Candidate for premium "Finder-style" treatment or a minimal free
  reference implementation + documented connector protocol — decide when 19 revenue
  shape is known.

**Clean output:** Published benchmark numbers a competitor has to answer. A real-device
Android typing matrix in CI or a documented manual protocol. Drafts survive a crashed
tab offline and sync when back online. Spreadsheet paste produces clean tables. Images
crop in place. Files browse from the server.

---

## Browser Support

Every phase is built and tested against all five targets. No feature ships until it works in all of them.

| Browser | Engine | Min Version | Notes |
|---|---|---|---|
| Chrome | Blink/V8 | 90+ | Primary dev target |
| Edge | Blink/V8 | 90+ | Identical to Chrome engine, test separately for OS-level quirks |
| Firefox | Gecko | 88+ | Different selection behavior, different `execCommand` results |
| Safari | WebKit | 14+ | Hardest target — most selection bugs, strictest clipboard rules |
| Safari iOS | WebKit | 14+ | Virtual keyboard, touch selection, viewport resize |
| Android Chrome | Blink/V8 | 90+ | Touch selection handles differ from iOS, different virtual keyboard behavior |

---

## Cross-Browser Problem Map

Every known browser-specific problem, which phase it hits, and exactly how it is solved.

### Selection & Cursor

| Problem | Browser | Phase | Solution |
|---|---|---|---|
| `getSelection()` returns wrong range after programmatic DOM change | Safari | 3 | Always `removeAllRanges()` + `addRange()` when restoring — never mutate an existing range |
| Selection lost after toolbar button click | All | 7 | Save range on `mousedown` (fires before `blur`), restore before executing command |
| `anchorNode` / `focusNode` swapped when selecting right-to-left | Firefox | 3 | Normalize by comparing positions, always produce `start < end` |
| `getRangeAt(0)` throws when selection is empty | Safari | 3 | Guard with `selection.rangeCount > 0` before every call |
| Collapsed selection at wrong position after `innerHTML` set | All | 2 | After `setHTML`, explicitly place cursor at end via `Range.selectNodeContents` |
| Selection spans across table cells unexpectedly | Chrome | 11 | Clamp selection to single cell when cursor is inside table |
| Double-click selects trailing whitespace differently | Safari vs Chrome | 3 | Normalize selected text with `.trim()` before use |

### Input & Keyboard

| Problem | Browser | Phase | Solution |
|---|---|---|---|
| `beforeinput` event not fired for all input types | Firefox < 87 | 1 | Fall back to `keydown` + `input` pair for those input types |
| IME composition: `keydown` fires with `key: 'Process'` during composition | Chrome/Edge | 1 | Check `event.isComposing` flag and skip command handling during composition |
| IME composition: `compositionend` fires before or after `input` inconsistently | Safari vs Chrome | 1 | Always handle final content in `compositionend`, ignore `input` during composition |
| `Enter` key in contenteditable creates `<div>` instead of `<p>` | Chrome | 1 | `execCommand('defaultParagraphSeparator', false, 'p')` on init |
| `Enter` key creates `<p><br></p>` with extra `<br>` | Firefox | 1 | Strip trailing `<br>` inside empty `<p>` after Enter |
| `Backspace` at start of block merges into previous incorrectly | Safari | 4.5 | Custom `keydown` handler for Backspace at offset 0, merge blocks manually (owned by Block Editing Semantics) |
| `Tab` key moves focus away from editor | All | 1 | `preventDefault()` on Tab inside contenteditable, handle indent manually |
| Ctrl vs Cmd keyboard shortcuts | Mac Safari/Chrome | 4 | Detect `event.metaKey` (Mac) alongside `event.ctrlKey` for all shortcuts |
| `event.key` returns different values for same key | IE-era Edge | 4 | Normalize key values: check both `event.key` and `event.keyCode` as fallback |

### Clipboard

| Problem | Browser | Phase | Solution |
|---|---|---|---|
| `navigator.clipboard.readText()` requires explicit permission prompt | Chrome/Edge | 3 | Fall back to `ClipboardEvent.clipboardData` when permission denied |
| `navigator.clipboard` entirely unavailable on HTTP (non-HTTPS) | All | 3 | Detect `isSecureContext`, fall back to `execCommand('paste')` on HTTP |
| `clipboardData.getData('text/html')` returns empty on iOS Safari | Safari iOS | 12 | Fall back to `text/plain`, insert as plain text |
| Pasting image from clipboard not supported | Firefox | 9 | Detect via `clipboardData.items` type check, show "not supported" gracefully |
| `execCommand('copy')` silently fails in some contexts | Safari | 3 | Wrap in user-gesture handler, always called inside `click` or `keydown` handler |

### contenteditable Behavior

| Problem | Browser | Phase | Solution |
|---|---|---|---|
| `spellcheck` attribute causes layout reflows on every keystroke | Chrome | 1 | Set `spellcheck="false"` by default, expose as config option |
| `contenteditable` ignores `white-space: pre-wrap` on paste | Safari | 12 | Strip `\r` carriage returns from pasted plain text |
| `<br>` at end of every block element added automatically | Firefox | 1 | Normalize: strip `<br>` that is the sole child of a non-empty block |
| Nested `contenteditable="false"` islands (e.g. image captions) lose focus incorrectly | Chrome | 9 | Use `mousedown` + `preventDefault` on islands, manage focus manually |
| `document.execCommand('bold')` wraps in `<b>` not `<strong>` | All | 4 | Post-process: replace all `<b>` → `<strong>`, `<i>` → `<em>` after execCommand |
| `document.execCommand('formatBlock', false, 'h1')` fails inside list items | Firefox | 4 | Detect list context, exit list first, then apply block format |
| `queryCommandState('bold')` returns false inside nested bold | Safari | 4 | Walk DOM manually up to editor root to detect bold state |

### CSS & Layout

| Problem | Browser | Phase | Solution |
|---|---|---|---|
| `position: sticky` toolbar flickers on scroll in Safari | Safari | 7 | Use `-webkit-sticky`, add `will-change: transform` on sticky element |
| CSS custom properties not updated in Shadow DOM | All | 15 | Editor does not use Shadow DOM; all CSS scoped via class prefix instead |
| `caret-color` not respected in older Edge | Edge legacy | 15 | Set both `caret-color` and `color` for caret visibility fallback |
| `resize: vertical` on editor container broken on iOS | Safari iOS | 13 | Disable CSS resize on touch devices, use JS drag handle only |
| Scrollbar width differs across OS causing layout shifts | Win/Mac/Linux | 7 | Account for scrollbar width in toolbar overflow calculations |
| `outline: none` on contenteditable hides focus indicator | All | 14 | Always replace `outline: none` with a custom visible focus style |

### Mobile & Touch

| Problem | Browser | Phase | Solution |
|---|---|---|---|
| Virtual keyboard shrinks `window.innerHeight` but not `100vh` | Safari iOS | 14 | Use `window.visualViewport.height` instead of `innerHeight` |
| Selection handles on iOS render outside editor container | Safari iOS | 3 | `overflow: hidden` on editor breaks handles — use `overflow: visible` with clip via parent |
| `touchend` fires `click` with 300ms delay | Older Android | 14 | Add `touch-action: manipulation` to all interactive elements |
| Long-press triggers browser's native context menu before ours | iOS | 14 | `preventDefault()` on `contextmenu` event, `-webkit-user-select: none` on toolbar |
| Pinch-zoom inside editor breaks layout on re-zoom-out | iOS/Android | 14 | `touch-action: pan-x pan-y` on editor, disable pinch-zoom only within content area |

---

## Obstacles & How We Handle Them

| Problem | Phase | Solution |
|---|---|---|
| Safari selection API differences | 3 | Normalize in SelectionManager, Playwright tests on Safari |
| IME / composition (CJK input) | 1 | `isComposing` guard + `compositionend` handler, freeze model during composition |
| execCommand creates `<b>` / `<i>` instead of `<strong>` / `<em>` | 4 | Post-process output, replace legacy tags after every execCommand |
| execCommand deprecation edge cases | 4 | Use for basic formatting, manual DOM manipulation for complex ops |
| XSS via `javascript:` / `data:` URIs | 2 | Block at sanitizer layer, block again at each plugin insert point |
| CSS injection via style attributes | 2 | Whitelist-only style values, strip `url()` / `expression()` patterns |
| Word HTML paste garbage | 12 | Full sanitizer + MSO-specific cleanup rules |
| Toolbar click steals focus | 7 | Save range on `mousedown` (before `blur`), restore before command executes |
| Cursor restore after undo | 5 | TreeWalker-based position stored in every snapshot |
| Mobile virtual keyboard viewport shift | 14 | `visualViewport` API, scroll editor into view on resize |
| Table keyboard navigation | 11 | Dedicated keydown handler active only when cursor is inside table |
| Large document performance | 2+ | Debounced serialization, no unnecessary full re-renders |
| Cross-browser br vs p behavior | 1 | `defaultParagraphSeparator` on init, normalize on every input |
| Focus trap in modals | 6 | Capture Tab keydown, cycle through focusable elements within modal |
| Pinch-zoom inside editor on iOS | 14 | `touch-action: pan-x pan-y` on editor content area |
| Shift+Enter vs Enter ambiguity | 1 | Explicit keydown handler: Shift+Enter → `<br>`, Enter → new `<p>` |
| Ctrl shortcuts on Mac vs Windows | 4 | Check both `event.ctrlKey` and `event.metaKey` on every shortcut handler |
| iframe sandbox value for embeds | 13 | YouTube/Vimeo: `sandbox="allow-scripts allow-popups"` — never `allow-same-origin` (opens XSS) |
| `target="_blank"` without `rel="noopener"` | 10 | Auto-apply `rel="noopener noreferrer"` whenever `target="_blank"` is set |
| Collaboration undo conflict | 19 | Local undo and OT are incompatible without design — remote changes must be excluded from local undo stack |
| `navigator.clipboard` permission timing | 3 | Call `permissions.query({name:'clipboard-read'})` before `clipboard.read()` to prompt at a predictable moment |
| Async callbacks after destroy | all | Every async path (upload, autosave, AI stream) must guard with `editor.isDestroyed()` before calling any editor method |

---

## Testing Strategy

- **Unit tests (Vitest):** every utility function, every command, all state mutations
- **Integration tests (Vitest + jsdom):** editor mount/destroy, state changes, command sequences
- **Browser tests (Playwright):** selection, keyboard shortcuts, paste, all cross-browser
- **Accessibility tests (Playwright + axe-core rules):** ARIA, keyboard nav, screen reader compatibility
- **Visual tests:** toolbar state, theme rendering, dark mode
- **Security tests:** XSS payload battery, `javascript:`/`data:` URI probes, `<base>` injection, inline SVG injection, mXSS round-trip test, prototype pollution via config fuzz
- **Sanitizer fuzz tests:** random/semi-random HTML input, assert no `<script>` in output, assert output is valid HTML, assert no throws
- **Snapshot tests:** sequence of operations → assert exact `getHTML()` output matches stored snapshot (primary regression mechanism for output format)
- **Performance benchmarks (CI gates):** `selectionchange` handler ≤ 16ms; `getHTML()` on 10,000-word doc ≤ 50ms; editor mount ≤ 100ms
- **Plugin isolation tests:** use the plugin test harness (Phase 8) to unit-test each plugin independently
- **Rule:** no phase is complete until browser tests pass on Chrome, Edge, Firefox, Safari (desktop), Safari iOS, and Android Chrome

---

## Coding Standards

- Pure JavaScript — ES2020, no TypeScript in source (`.d.ts` files hand-written separately)
- No classes forced where functions suffice
- No global state — everything scoped to editor instance
- Every module exports a single clear interface
- No comments explaining what code does — only why when non-obvious
- File size limit: 300 lines, then split
- Z-index layering contract (lowest → highest): editor content (1) → sticky toolbar (10) → inline bubble toolbar (100) → tooltips (200) → context menus (300) → modals (400) → all values defined as CSS custom properties (`--oe-z-toolbar`, `--oe-z-tooltip`, etc.) so host pages can override without conflicts

---

## Versioning

```
0.x.x  — development phases (0–15, incl. 4.5 + 7.5), API unstable
1.0.0  — phases 0–16 + 16.5 + 16.6 complete (Public API frozen, hardened, modern UX), npm published
1.x.x  — phases 17–18 (npm + wrappers), bug fixes, no breaking changes
2.0.0  — breaking API changes only (rare, announced in advance)
```

`editor.reset()` — emergency recovery: wipes internal state, re-renders from last clean snapshot, fires `error` event with context. Available from Phase 1 onward.

---

## License

Core: MIT
Premium packages: Commercial license required

---

*Built from scratch. Zero dependencies. Runs forever.*
# open-editor
