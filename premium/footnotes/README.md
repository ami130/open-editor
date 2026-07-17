# @openeditor-premium/footnotes (19.12)

Auto-numbered **footnotes**. Insert a reference marker at the cursor; a managed
notes section at the document end stays in sync. Gated on the `footnotes`
feature id.

## Usage

```js
import { createPremiumHost } from '@openeditor-premium/runtime';
import { createFootnotesPlugin } from '@openeditor-premium/footnotes';

const host = await createPremiumHost({ license, keys });
editor.plugins.install(createFootnotesPlugin(host));
```

Granted → an **"Insert footnote"** toolbar button + `editor.insertFootnote()` /
`editor.getFootnoteCount()`. Denied → graceful degrade (no button, no handles,
one dismissible notice). Because inserting mutates the document, the button is
**not** read-only-exempt (disabled when the editor is locked).

## Authoring a note (2026-07-17)

Inserting a footnote places the **caret inside the new note** so you can type it
immediately — no hunting for an empty bullet. Deleting a reference marker
renumbers the rest and drops its orphaned note automatically (renumber runs on
edits when the marker/note counts drift, not only on insert).

## Behavior

- Inserts `<sup class="oe-footnote-ref" contenteditable="false"
  data-oe-footnote-ref="N" id="fnref-N">N</sup>` at the caret (an atomic island
  — it won't absorb a selection), and appends/updates
  `<ol class="oe-footnotes" data-oe-footnotes>` at the document end.
- **Renumbers 1..N in document order** on every insert, and note text follows
  its footnote across insertions/deletions (keyed by the marker's previous
  number). Clicking a marker scrolls to its note and vice-versa.
- **One undo step:** the marker insert + notes-section sync run synchronously
  inside a single `insertFootnote` command (returning
  `CommandManager.SKIP_RESTORE`), so history snapshots once — undo removes both.
- **Round-trips:** the markup survives `getHTML()`/`setHTML()`. This required a
  small, additive extension to the core sanitizer allowlist (19.12): `id` +
  `contenteditable` + `data-oe-footnote-ref` on `<sup>`, `data-oe-footnotes` on
  `<ol>`, `data-oe-footnote` on `<li>` — all inert markers, no new attack
  surface (same reasoning as the bookmark/to-do allowlist entries). The plugin
  re-syncs numbering on the `setHTML` event so loaded content stays correct.

## Architecture

- **`footnote-core.js`** — pure DOM logic (`createRefMarker`, `renumber`,
  `refMarkers`, `notesSection`). No editor/window; fully unit-tested including
  text-preservation across mid-document insertion and idempotent renumbering.
- **`footnotes-plugin.js`** — the gated spec: command registration
  (SKIP_RESTORE, one undo step), toolbar button, click-to-scroll, setHTML
  re-sync. Driven in tests against a **real** `OpenEditor` instance.

8 core + 9 plugin unit tests + 5 e2e (×3 engines), including undo-is-one-step
and round-trip-survival in a real browser.
