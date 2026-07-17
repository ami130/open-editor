/**
 * bookmark-core.js — pure, DOM-only helpers for the bookmark plugin. No editor
 * lifecycle, no UI: list / build / remove / repair / presentation. Extracted so
 * both the plugin and its dialog import from one place and each file stays
 * under the 300-line limit.
 */

export const NAME_RE = /^[A-Za-z][\w-]*$/;

/** Allowed icon keys + color keys the sanitizer/config trust (defense-in-depth). */
export const SAFE_KEY_RE = /^[a-z][a-z0-9-]*$/;

/** A strict #rgb / #rrggbb hex color — the only custom-color form accepted. */
export const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** All bookmark anchors currently in the document (in document order). */
export function listBookmarks(editor) {
  return Array.from(editor.getEditorElement().querySelectorAll('a.oe-bookmark[id]'));
}

/** Build a canonical, empty bookmark marker with optional icon/color presentation. */
export function createMarker(doc, name, icon, color) {
  const a = doc.createElement('a');
  a.id = name;
  a.className = 'oe-bookmark';
  a.setAttribute('contenteditable', 'false');
  applyPresentation(a, icon, color);
  return a;
}

/**
 * Set/clear the presentation of a marker.
 *
 * icon  — a key (SAFE_KEY_RE) → data-oe-icon.
 * color — EITHER a preset key (SAFE_KEY_RE) → data-oe-color, OR a custom hex
 *         (#rgb/#rrggbb) → inline `--oe-bm-color` CSS variable. A hex is not a
 *         key, so it's stored as an inline style; the value is regex-validated
 *         (no url()/expression() can pass HEX_COLOR_RE), so it's sanitizer-safe
 *         and survives the getHTML()→setHTML() round-trip. Anything else clears.
 *
 * The two color channels are mutually exclusive — setting one clears the other,
 * so a marker never carries both a preset keyword and a custom hex.
 */
export function applyPresentation(mark, icon, color) {
  if (icon && SAFE_KEY_RE.test(icon)) mark.setAttribute('data-oe-icon', icon);
  else mark.removeAttribute('data-oe-icon');

  if (color && HEX_COLOR_RE.test(color)) {
    // custom hex → inline CSS variable, clear the preset keyword
    mark.removeAttribute('data-oe-color');
    mark.style.setProperty('--oe-bm-color', color);
  } else if (color && SAFE_KEY_RE.test(color)) {
    // preset keyword → data attribute, clear any inline custom color
    mark.setAttribute('data-oe-color', color);
    mark.style.removeProperty('--oe-bm-color');
  } else {
    mark.removeAttribute('data-oe-color');
    mark.style.removeProperty('--oe-bm-color');
  }
}

/** Read the marker's current color as a value the picker can seed from. */
export function readMarkerColor(mark) {
  const inline = mark.style && mark.style.getPropertyValue('--oe-bm-color').trim();
  if (inline) return inline;                       // custom hex
  return mark.getAttribute('data-oe-color') || ''; // preset key or none
}

/**
 * Remove a bookmark WITHOUT deleting document content. If a marker was
 * corrupted by the pre-2026-07-16 insert bug (text trapped inside it), the
 * children are unwrapped back into the document first, then the empty marker
 * is removed. Fires the change callback so history/onChange stay consistent.
 */
export function removeBookmark(editor, mark) {
  if (!mark || !mark.parentNode) return;
  const parent = mark.parentNode;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark); // unwrap
  parent.removeChild(mark);
  if (editor._onChangeFn) editor._onChangeFn();
}

/**
 * F3 repair pass: any bookmark marker holding children (only possible from the
 * old swallow bug) is unwrapped so the trapped text returns to the document.
 * Marker stays in place, now correctly empty. Returns the count repaired. Safe
 * to run on every content load — a no-op for clean documents.
 */
export function repairBookmarks(root) {
  if (!root || !root.querySelectorAll) return 0;
  let repaired = 0;
  for (const mark of Array.from(root.querySelectorAll('a.oe-bookmark'))) {
    if (mark.firstChild) {
      while (mark.firstChild) mark.parentNode.insertBefore(mark.firstChild, mark);
      repaired++;
    }
  }
  return repaired;
}

/**
 * Collapse the editor's current selection to its start using the public
 * window/Selection API. A bookmark is a zero-footprint marker, so a non-empty
 * selection must collapse (marker beside the text, never wrapping it). No-op
 * when there is no live, non-collapsed range.
 */
export function collapseSelectionToStart(editor) {
  const el = editor.getEditorElement && editor.getEditorElement();
  const win = el && el.ownerDocument && el.ownerDocument.defaultView;
  const sel = win && win.getSelection && win.getSelection();
  if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
    const r = sel.getRangeAt(0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }
}

/**
 * Place the caret for an insert: restore the saved bookmark if present, else
 * focus the editor and drop the caret at the end of content (so a toolbar-
 * first click still lands the marker inside a block).
 */
export function restoreInsertCaret(editor, saved) {
  if (saved && editor.selection) {
    editor.selection.restore(saved);
  } else {
    editor.focus();
    if (editor.selection && !editor.selection.isInsideEditor()) {
      const root = editor.getEditorElement();
      const lastBlock = root.lastElementChild || root;
      editor.selection.collapse(lastBlock, lastBlock.childNodes.length);
    }
  }
}
