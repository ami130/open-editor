# Phase 7.5 — Playwright Verification Gate

Hard blocker before Phase 8 plugins. Every item must be green on Chromium,
Firefox, and WebKit before Phase 8 work begins.

## 7.5.1 — Cross-browser Playwright infrastructure

- [x] `playwright.config.js` — added Firefox + WebKit projects
- [x] `playwright.config.js` — CI retries (2), github reporter, screenshot/video on failure
- [x] `apps/playground/package.json` — added `@axe-core/playwright ^4.10.2`
- [x] `.github/workflows/ci.yml` — added `e2e` job (needs: test, installs browsers, uploads report)
- [x] Firefox + WebKit browsers installed locally (`playwright install chromium firefox webkit`)

## 7.5.2 — Selection & caret tests

- [x] `tests/selection.test.js` written (10 tests)
  - typing produces text
  - caret positioned mid-word via mouse
  - selectNodeContents selects all text
  - Ctrl+A (selectAll command) selects all content
  - arrow keys move caret without crash
  - editor does not lose caret after toolbar click
  - double-click selects exactly one word
  - bookmark save/restore survives DOM mutation
  - RTL text entry does not corrupt editor structure
  - selection is restored after toolbar button click

## 7.5.3 — Block-editing semantics tests

- [x] Phase 4.5 (block editing) implemented — `packages/core/src/editing/block-editing.js`
- [x] `tests/block-editing.test.js` written (9 tests)
  - Enter mid-paragraph splits into two `<p>` elements
  - Enter at end of heading creates new `<p>`
  - Backspace at paragraph start merges into previous paragraph
  - Delete at paragraph end merges next paragraph in
  - Backspace at start of `<h2>` converts it to `<p>`
  - Deleting all content leaves canonical `<p><br></p>` DOM
  - blockIndent wraps paragraph in `<blockquote>`
  - blockOutdent removes blockquote wrapping
- [x] All 3 browsers passing (Chromium, Firefox, WebKit)

## 7.5.4 — Toolbar pixel-behavior tests

- [x] `tests/toolbar.test.js` written (13 tests)
  - toolbar renders above editor
  - bold button accessible label
  - clicking bold wraps in `<strong>`
  - bold button active class when cursor in bold text
  - italic wraps in `<em>`
  - underline wraps in `<u>`
  - inline code wraps in `<code>`
  - undo button reverts formatting
  - redo re-applies formatting
  - keyboard focus ring visible
  - inline bubble toolbar appears when text is selected
  - mobile viewport: toolbar buttons meet minimum touch target size
  - toolbar remains visible after page scroll

## 7.5.5 — Clipboard tests

- [x] `tests/clipboard.test.js` written (6 tests)
  - pasting plain text inserts at caret
  - pasting HTML preserves structure
  - pasting plain text only strips HTML tags
  - cutting selection removes it from editor
  - copyAsPlainText command (no crash assertion)
  - copyAsPlainText falls back gracefully when clipboard API unavailable

## 7.5.6 — Undo/redo tests

- [x] `tests/history.test.js` written (8 tests)
  - Ctrl+Z undoes typed text
  - Ctrl+Z undoes bold formatting
  - Ctrl+Y / Ctrl+Shift+Z redoes
  - multiple undo steps walk back
  - Y-Z-Y sequence works
  - undo toolbar button
  - redo toolbar button
  - undo restores selection to pre-bold cursor position
  - no errors after reload

## 7.5.7 — Accessibility tests

- [x] `@axe-core/playwright` installed
- [x] `tests/accessibility.test.js` written (7 tests)
  - initial load: zero critical/serious violations (wcag2a + wcag2aa)
  - with content: zero violations
  - after bold: zero violations
  - toolbar scope: zero violations
  - editor ARIA role/attributes correct
  - keyboard-only user can Tab to bold button and apply bold
  - all toolbar buttons have accessible names

## 7.5.8 — Snapshot regression + canonical HTML tests

- [x] `tests/snapshots.test.js` written (5 tests) — pixel baselines committed
  - editor empty state
  - editor with plain text
  - editor with bold formatting
  - toolbar initial state
  - bold button active state
- [x] `tests/html-snapshots.test.js` written (5 tests)
  - bold produces canonical `<strong>` tag
  - italic produces canonical `<em>` tag
  - strikethrough produces canonical `<s>` tag
  - undo bold leaves plain HTML with no residual tags
  - empty editor returns canonical floor: `<p><br></p>` DOM

## 7.5.9 — CI integration + documentation

- [x] `.github/workflows/ci.yml` — e2e job added
- [x] `PHASE-7.5-CHECKLIST.md` — this file (updated with all completed milestones)

## Phase gate sign-off

**All Phase 7.5 milestones complete.** Final e2e run:
- 214 tests passing, 5 skipped (platform-specific), 0 failing
- Chromium ✓ · Firefox ✓ · WebKit ✓
- 849 unit tests passing

Phase 8 may begin.

## To run locally

```bash
# Install browsers (one-time)
pnpm --filter playground exec playwright install chromium firefox webkit

# Run all e2e tests
pnpm --filter playground test:e2e

# Generate snapshot baselines
pnpm --filter playground test:e2e -- --update-snapshots

# Run only accessibility tests
pnpm --filter playground test:e2e -- tests/accessibility.test.js
```
