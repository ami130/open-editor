# Changelog

All notable changes to Open Editor are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
[Semantic Versioning](https://semver.org/) once 1.0.0 is published.

## [1.0.0] — 2026-07-14

First stable release (supersedes `1.0.0-rc.1`, published 2026-07-14 under the
`next` tag). The public API is **frozen** (see [README → Phase 16](./README.md))
and enforced by a contract test; no breaking changes will land without a
major-version bump.

### Changed
- **UI redesign ("Modern SaaS")** — new indigo accent, cool hue-biased neutrals,
  soft layered shadows, larger radii; a unified 24×24/2px-stroke/round-cap icon
  set replacing the old mixed line+text-glyph icons; restyled toolbar (pill
  active state, calmer focus ring), a redesigned table-insert picker, and
  refreshed dropdown/modal panels. CSS + SVG only — no API or behavior change.

### Added
- **Four complete UI locale packs** — Spanish, French, German, and Arabic (RTL),
  as tree-shakeable named exports (`localeEs`, `localeFr`, `localeDe`,
  `localeAr`) and per-language subpaths (`@open-editor-hq/core/locales/ar`);
  CI-locked to cover every UI string. Also fixed: plugin toolbar buttons
  previously kept hardcoded English tooltips even under a translation — locale
  keys now take precedence.
- **Accessibility conformance statement** ([docs/ACCESSIBILITY.md](./docs/ACCESSIBILITY.md))
  backed by a CI axe-core sweep across every UI surface; the sweep's first run
  found and fixed 7 WCAG A/AA violations (ARIA structure in the suggestion
  popup and size/line-height dropdowns, missing accessible names, keyboard
  reachability, and four AA contrast failures).
- **Plugin authoring guide** ([docs/PLUGINS.md](./docs/PLUGINS.md)) with a
  worked example verified verbatim against the published package.
- **Theme system** — `light` / `dark` / `minimal` / `auto` themes via a 3-tier
  CSS-custom-property token model; `setTheme()`, `setCSSVar()`, CSP-safe
  injection (Constructable Stylesheets). See [docs/THEMING.md](./docs/THEMING.md).
- **Frozen public API** — content, state, selection, command, history, event,
  and config surfaces are frozen at 1.0 and guarded by `api-contract.test.js`.
  `plugins.*` / `ui.*` are "stable from 1.x".
- **Cancelable hooks** — `beforeChange`, `beforeSetHTML`, `beforeCommand` all
  abort via `preventDefault()`.
- **`config.onChange`** accepts a callback (function or `{ handler, debounce }`).
- **Config validation** — unknown/misspelled config keys warn (never throw).
- **Production hardening** — throttled large-document count recompute,
  performance CI budgets (mount / getHTML / selection), `config.warnOnUnload`
  dirty-tab guard, timestamped autosave drafts, `editor.reset()` crash recovery,
  and a 100-cycle memory-leak test. See [docs/ERROR-REPORTING.md](./docs/ERROR-REPORTING.md).
- **Modern Editing UX** (Phase 16.6) — slash-command palette (`/`), markdown
  autoformat (`**bold**`, `# heading`, `- list`, etc. as you type), `@mentions`
  autocomplete with an async data source, and Notion-style block drag-reorder
  handles. New shared caret-anchored popup (`ui/caret-popup.js`) backs both the
  slash palette and mentions.
- **Competitive Parity Pass** (Phase 16.7):
  - **To-do lists** — `[ ] ` / `[x] ` autoformat, toolbar button, CSS-drawn
    checkboxes (no `<input>` in content), click/`Ctrl+Enter` toggle, checked
    state survives round-trip; Enter on a checked item starts an unchecked one.
  - **Typed-URL autolink** — typing a bare URL or email then space/Enter links
    it in place (paste-autolink already existed); undo cleanly reverts it.
  - **Source view syntax highlighting** — the HTML source view now renders
    colored tokens via a scroll-synced transparent-textarea overlay; zero-dep
    (no ACE/CodeMirror), config-gated by `sourceModeHighlight`.
  - **Responsive image output** — when the upload server returns a `sources`
    array, the image is emitted as `<picture>` with scheme-checked `<source>`
    entries and the `<img>` kept as fallback; `<picture>`/`<source>` added to
    the sanitizer allowlist with the same `srcset` URL policy as `<img>`.
  - **Find & Replace whole-word toggle**, **table properties split** into
    table-wide vs per-cell dialogs (border width/style/color composition),
    **table column/row header-click selection**, **list style auto-progression**
    per nesting depth (disc→circle→square / decimal→alpha→roman), and a
    **selection-scoped word/char count** in the status bar.
- **Video embed resize + alignment** — a selected YouTube/Vimeo embed now gets
  the same 8-handle drag-resize overlay (aspect ratio preserved, `Shift` locks
  it) and left/center/right alignment as an image, via a floating action bar.
  Pasting a bare YouTube/Vimeo URL auto-embeds it (matches CKEditor's
  AutoMediaEmbed); raw pasted `<iframe>` HTML is still not adopted, for the
  same security reasons a hand-crafted iframe isn't.
- **Accessibility & mobile** (Phase 14), **11 content plugins** (Phase 13),
  **paste engine** (Phase 12), **tables** (Phase 11) — see the README roadmap.

### Fixed
- **Type declarations: `shortcuts.register` and `createTestEditor` signatures**
  — `index.d.ts` in `1.0.0-rc.1` mistyped `shortcuts.register` as taking a
  handler function (it binds a command NAME and emits a `'shortcut'` event)
  and `createTestEditor` as returning `{ editor, cleanup }` (it returns the
  editor directly). Caught while live-verifying the plugin authoring guide's
  worked example; runtime behavior was always correct. Fixed for the next
  release; the type-consumer fixture now locks both signatures.
- **Stale status-bar counts after `setHTML()`** — the status bar listened to
  `input`/`selectionChange`/`afterCommand` but not `setHTML`, so programmatic
  content replacement left the word/char counts stale (e.g. stuck at "0 words").
- **History data loss** — pressing undo while a debounced typing snapshot was
  still pending discarded the in-flight edit and consumed an extra history step;
  the pending snapshot is now flushed before undo/redo.
- **Image URL hardening** — `sanitizeSrc` now blocks `blob:` / `filesystem:` (via
  the central `isUnsafeUrl`) and `srcset` candidates are scheme-checked.
- **Dropdown listener leak** — destroying the editor while a toolbar dropdown was
  open leaked `scroll`/`resize` listeners; `destroy()` now closes it cleanly.
- **Fullscreen silently broken** — `.oe-wrapper--fullscreen`'s `position: fixed`
  lost a same-specificity CSS cascade tie to a plugin stylesheet injected
  later (`resize-editor-styles.js`'s `.oe-wrapper { position: relative }`),
  so fullscreen stopped covering the viewport. Fixed with `!important`.
- **Video embed inserted into an empty editor was invisible / broke the
  document structure** — `insertAtCursor()`'s node-insertion path mishandled a
  caret positioned on the placeholder `<br>` of an empty `<p><br></p>`,
  attaching the embed as an invalid child of `<br>` (dropped by `getHTML()`,
  never rendered). Also fixed: a block-level insert (figure/pre/table/etc.)
  now correctly lands as a sibling of an empty `<p>` rather than nested
  inside it, and typing right after an embed lands in a new paragraph instead
  of inside the embed's own `<figure>`.
- **Left/right-aligned video embed collapsed to 0×0** — the embed's iframe and
  click-shield are `position: absolute` (needed for the aspect-ratio box), so
  a floated embed with no explicit width had no in-flow content to compute a
  shrink-to-fit width from, and vanished. Fixed with an explicit default width
  on `.oe-embed--left`/`--right` (a later resize overrides it as normal).
- **Stale figure-selection reference after undo/redo** — `undo()`/`redo()`/
  `setHTML()` replace the editor's `innerHTML` wholesale, destroying the
  selected figure's DOM node; a lingering reference to it silently blocked
  re-selecting the new node that replaced it. Fixed for both the image and
  video-embed selection managers.

### Security
- Input **and** output HTML are sanitized. Blocks `<script>`/`<object>`/`<embed>`,
  event-handler attributes, `javascript:`/`vbscript:`/`data:`/`blob:` URLs, CSS
  `expression()`/`url(javascript:)`, and mXSS double-parse vectors. Media embeds
  are limited to an allowlist of provider domains with a tightly-scoped iframe
  sandbox. See [SECURITY.md](./SECURITY.md).

---

_Earlier development (Phases 0–13) predates this changelog; see the phase
checklist in the [README](./README.md) for the full feature history._
