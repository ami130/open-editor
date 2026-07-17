# Accessibility Conformance Statement — Open Editor

**Product:** Open Editor (`openeditor-text`)
**Assessed version:** 1.0.0-rc.1 line (2026-07-14)
**Claimed conformance: WCAG 2.1 Level AA self-assessment** (editor chrome and
authoring UI). This is an honest engineering self-assessment backed by
automated verification in CI — not a third-party certification or legal VPAT.

## How this statement is kept true

Two Playwright + axe-core suites run on every commit, in CI, across Chromium /
Firefox / WebKit, asserting **zero critical or serious WCAG 2.1 A/AA
violations**:

- `accessibility.test.js` — page load, typed content, applied formatting,
  toolbar region, toolbar button names, keyboard-only bold application.
- `accessibility-sweep.test.js` (17.10) — every interactive surface **while
  open**: format/font/size/line-height dropdowns, alignment panel, both color
  pickers, table grid picker, link/image/media dialogs, find & replace panel,
  special-characters and emoji grids, slash palette, mentions popup, source
  view, rich content (tables/to-do lists/figures), table context menu, dark
  theme, fullscreen, and the status bar with a live selection count.

If a surface regresses, CI fails — this statement cannot silently rot.

The 17.10 sweep found and fixed 7 violations before this statement was first
published (2 critical, 5 serious): listbox/menu ARIA child-role violations in
the caret popup and the size/line-height dropdowns, a missing accessible name
on the suggestion popup, a keyboard-unreachable scrollable region, and four
AA contrast failures in the image dialog, color picker chrome, and popup
empty state. Finding them is what the sweep is for.

## What conformance covers (and what it can't)

**In scope — the editor's own UI:** toolbar, dropdowns, dialogs, panels,
pickers, popups, status bar, themes, and the editing surface's behavior.

**Out of scope — author-supplied content.** The editor cannot make *your
document* accessible for you: it provides the affordances (alt-text field on
every image, `scope` on table header cells, semantic heading/list/quote
markup, `lang`/`dir` support) but whether an author writes meaningful alt
text is outside any editor's control. Integrators embedding the editor are
responsible for the page around it (labels on the field, form semantics).

## Feature-level summary

| Area | Status |
|---|---|
| Keyboard operation | Full: every toolbar control, dropdown, dialog, picker (incl. the canvas color picker), palette, and menu is keyboard-operable; focus-visible styling throughout |
| Screen reader semantics | `role="textbox"` editing surface; `role="toolbar"` with labelled buttons; menus/dialogs/listboxes with correct required children (verified by axe); status bar is a polite live region (caret line/col excluded from announcements by design — it changes on every keystroke) |
| Contrast | AA-verified by axe on every surface, light and dark themes |
| Touch targets | 44×44px minimum (Phase 14), toolbar scrollable on small viewports |
| Forced colors / high contrast mode | Dedicated forced-colors stylesheet; active states use `Highlight`/`HighlightText` system colors |
| Reduced motion | `prefers-reduced-motion` respected — transitions and animations are disabled |
| RTL / bidi | Full RTL UI + content editing (`setDirection('rtl')`), `bdi`/`bdo` preserved by the sanitizer |
| Images | Alt-text field in insert + properties dialogs; empty-alt hint ("empty = decorative") |
| Zoom / reflow | Relative units in chrome; responsive toolbar verified at mobile viewports with 44×44 targets (Phase 14 e2e). A scripted 400%-zoom reflow check (WCAG 1.4.10) is not yet automated — listed under known limitations |

## Known limitations (honest list)

- **`beforeChange` cannot intercept IME composition input** (documented since
  Phase 16); composition itself works, including CJK, but programmatic
  cancellation mid-composition is not possible — a platform constraint.
- **Table header-click column/row selection has no persistent visual
  affordance** (pointer-discoverable only); keyboard cell navigation and the
  context menu provide equivalent operations.
- **Caret line/column readout** is intentionally excluded from the live
  region (see above); the information is visually available only.
- **Reflow at 400% zoom (WCAG 1.4.10)** is designed for (relative units,
  scrollable toolbar) but not yet covered by a scripted check — planned
  alongside the item below.
- Automated checks catch what automation can catch. Manual screen-reader
  walkthroughs (NVDA/JAWS/VoiceOver) have been informal, not scripted — a
  scripted SR test protocol is planned under Phase 20 (engineering moats).

## Reporting accessibility issues

Accessibility defects are treated as bugs, not enhancement requests. Report
them through the project's issue tracker (link ships with the public
repository) — include the assistive technology, browser, and OS.
