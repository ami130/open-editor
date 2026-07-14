/**
 * SelectionManager — wraps window.getSelection() with cross-browser safety.
 *
 * Safari rules enforced throughout:
 *   - Always guard rangeCount > 0 before getRangeAt(0)
 *   - Always removeAllRanges() + addRange() when restoring (never mutate existing range)
 *   - Always cloneRange() on output so callers hold stable snapshots
 */
import { nodeLength, saveBookmark, restoreBookmark } from './selection-path.js';
import { insertAtCursor as insertAtCursorImpl, selectAll as selectAllImpl } from './selection-insert.js';

export class SelectionManager {
  constructor(editorEl, iframeDoc = null) {
    this._editorEl = editorEl;
    this._iframeDoc = iframeDoc;
  }

  // Allow editor.js to update refs after iframe DOM rebuild or on destroy
  update(editorEl, iframeDoc) {
    this._editorEl = editorEl;
    this._iframeDoc = iframeDoc;
  }

  _getWindow() {
    if (this._iframeDoc && this._iframeDoc.defaultView) {
      return this._iframeDoc.defaultView;
    }
    return (typeof window !== 'undefined' ? window : null);
  }

  getWindow() { return this._getWindow(); }

  // ─── get() ──────────────────────────────────────────────────────────────────

  /**
   * Returns { range, startNode, startOffset, endNode, endOffset, collapsed,
   * commonAncestor } or null. Range is always a clone — never live.
   * Returns null if rangeCount === 0 or selection is outside the editor.
   */
  get() {
    if (!this._editorEl) return null;
    const win = this._getWindow();
    if (!win) return null;
    const sel = win.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0).cloneRange();
    const el = this._editorEl;
    const startIn = el.contains(range.startContainer);
    const endIn   = el.contains(range.endContainer);
    // Fully outside the editor → no selection of ours.
    if (!startIn && !endIn && !el.contains(range.commonAncestorContainer)) return null;
    // Partially outside (drag-select past the editor edge) → clamp the range to
    // the editor so the in-editor portion is preserved instead of discarded.
    if (!startIn) { range.setStart(el, 0); }
    if (!endIn)   { range.setEnd(el, el.childNodes.length); }
    return {
      range,
      startNode: range.startContainer,
      startOffset: range.startOffset,
      endNode: range.endContainer,
      endOffset: range.endOffset,
      collapsed: range.collapsed,
      commonAncestor: range.commonAncestorContainer,
    };
  }

  // ─── set() / collapse() ───────────────────────────────────────────────────────

  /**
   * Programmatically set the selection. Two forms:
   *   set(node, offset)                             → collapsed caret
   *   set(startNode, startOffset, endNode, endOffset) → a range
   * Offsets are clamped to each node's valid length. Nodes outside the editor
   * are rejected (no-op) so the selection can never escape the editable region.
   */
  set(startNode, startOffset = 0, endNode = null, endOffset = null) {
    if (!this._editorEl || !startNode) return;
    if (!this._editorEl.contains(startNode)) return;
    const win = this._getWindow();
    const doc = this._iframeDoc || (typeof document !== 'undefined' ? document : null);
    if (!win || !doc) return;
    const range = doc.createRange();
    try {
      range.setStart(startNode, Math.min(startOffset, nodeLength(startNode)));
      if (endNode && this._editorEl.contains(endNode)) {
        const eo = endOffset == null ? nodeLength(endNode) : endOffset;
        range.setEnd(endNode, Math.min(eo, nodeLength(endNode)));
      } else {
        range.collapse(true);
      }
    } catch { return; }
    const sel = win.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** Collapses the cursor to a specific position inside the editor. */
  collapse(node, offset = 0) {
    this.set(node, offset);
  }

  // ─── isInsideEditor() ─────────────────────────────────────────────────────────

  /**
   * Returns true when the current native selection is (at least partially)
   * inside the editor element, false otherwise (including no selection).
   */
  isInsideEditor() {
    if (!this._editorEl) return false;
    const win = this._getWindow();
    if (!win) return false;
    const sel = win.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    const el = this._editorEl;
    return el.contains(range.startContainer) ||
           el.contains(range.endContainer) ||
           el.contains(range.commonAncestorContainer);
  }

  // ─── expandToWord() ───────────────────────────────────────────────────────────

  /**
   * Expands a collapsed selection to the word boundaries under the caret.
   * Uses the browser's native Selection.modify() where available (all major
   * browsers); falls back to manual whitespace-boundary scanning in a text node.
   * No-op when the selection is already non-collapsed or absent.
   */
  expandToWord() {
    if (!this._editorEl) return;
    const win = this._getWindow();
    if (!win) return;
    const sel = win.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
    if (!this.isInsideEditor()) return;

    if (typeof sel.modify === 'function') {
      // Native word expansion — matches Word/Jodit double-click behaviour.
      sel.modify('move', 'backward', 'word');
      sel.modify('extend', 'forward', 'word');
      return;
    }
    // Fallback: scan the caret's text node for whitespace boundaries.
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    if (container.nodeType !== 3) return; // only meaningful inside a text node
    const text = container.nodeValue || '';
    let start = range.startOffset;
    let end = range.startOffset;
    while (start > 0 && !/\s/.test(text[start - 1])) start--;
    while (end < text.length && !/\s/.test(text[end])) end++;
    if (start === end) return;
    this.set(container, start, container, end);
  }

  // ─── save() / restore() ─────────────────────────────────────────────────────

  /**
   * Returns an index-path bookmark for the current selection (or null). The path
   * survives DOM mutations that don't delete the container node — see
   * selection-path.js for the path encoding.
   */
  save() {
    return saveBookmark(this._editorEl, this.get());
  }

  /**
   * Restores selection from a bookmark produced by save().
   * Falls back to an end-of-editor cursor if the path is stale.
   */
  restore(bookmark) {
    if (!bookmark || !this._editorEl) return;
    const doc = this._iframeDoc || (typeof document !== 'undefined' ? document : null);
    restoreBookmark(this._getWindow(), doc, this._editorEl, bookmark);
  }

  // ─── getSelectedHTML() ──────────────────────────────────────────────────────

  getSelectedHTML() {
    const info = this.get();
    if (!info || info.collapsed) return '';
    const doc = this._iframeDoc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return '';
    const frag = info.range.cloneContents();
    const tmp = doc.createElement('div');
    tmp.appendChild(frag);
    return tmp.innerHTML;
  }

  // ─── getSelectedText() ──────────────────────────────────────────────────────

  getSelectedText() {
    const info = this.get();
    if (!info || info.collapsed) return '';
    // Prefer the live Selection's toString(), which inserts line breaks at
    // block boundaries; Range.toString() runs blocks together with no
    // separator. Fall back to the range when no live selection is available.
    const win = this._getWindow();
    const sel = win && win.getSelection ? win.getSelection() : null;
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const s = sel.toString();
      if (s) return s;
    }
    return info.range.toString();
  }

  // ─── getHTML() / getText() — documented public aliases (16.A2) ──────────────
  // The README documents editor.selection.getHTML()/getText(); the historical
  // internal names are getSelectedHTML()/getSelectedText(). These aliases make
  // the documented names real without renaming the internal call sites.

  getHTML() { return this.getSelectedHTML(); }
  getText() { return this.getSelectedText(); }

  // ─── insertAtCursor() / selectAll() — see selection-insert.js ───────────────

  insertAtCursor(htmlOrNode) { insertAtCursorImpl(this, htmlOrNode); }
  selectAll() { selectAllImpl(this); }
}
