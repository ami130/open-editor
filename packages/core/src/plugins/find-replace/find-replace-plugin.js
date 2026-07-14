/**
 * find-replace-plugin.js — Phase 13.2: Find & Replace.
 *
 * Ctrl/Cmd+F opens the panel in find mode; Ctrl/Cmd+H opens it in replace mode.
 * Enter / Shift+Enter (and the ‹ › buttons) navigate matches; Replace / All act
 * on the current query. Highlighting uses the CSS Custom Highlight API when
 * available (zero-dep, no DOM mutation) and degrades to navigation-only when
 * not. Escape closes.
 *
 * The pure search lives in search-core.js (fully tested); this file wires the
 * panel, current-match state, and highlight painting.
 *
 * Implements { name, install, destroy, getToolbarButtons, onKeyDown }.
 */
import { findMatches, buildMatchRange, replaceMatch, replaceAll } from './search-core.js';
import { paintHighlights, clearHighlights, injectHighlightStyles } from './search-highlight.js';
import { buildSearchPanel } from './search-panel.js';
import { injectSearchStyles } from './search-styles.js';

const FIND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
</svg>`;

export function createFindReplacePlugin() {
  return {
    name: 'findReplace',
    _editor: null,
    _panel: null,
    _matches: [],
    _index: -1,
    _query: '',
    _caseSensitive: false,
    _wholeWord: false,

    install(editor) {
      this._editor = editor;
      const topDoc = (typeof document !== 'undefined') ? document : null;
      // Panel chrome lives in the outer wrapper → its CSS goes on the top doc.
      if (topDoc) injectSearchStyles(topDoc);
      // The ::highlight() CSS must live in the SAME document whose window
      // registers the highlights (CSS.highlights is per-window). In iframe mode
      // that is the iframe's document, not the top document (audit#6 — otherwise
      // matches register but render with no style). Inject into both to be safe.
      const contentDoc = editor._iframeDoc || topDoc;
      if (contentDoc) injectHighlightStyles(contentDoc);
      if (topDoc && topDoc !== contentDoc) injectHighlightStyles(topDoc);
    },

    destroy() {
      this._close();
      this._editor = null;
    },

    getToolbarButtons() {
      return [{
        name: 'findReplace', type: 'button', icon: FIND_ICON,
        tooltip: 'Find and replace',
        onClick: () => this._open(false),
      }];
    },

    onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        this._open(false); return true;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'h' || e.key === 'H')) {
        this._open(true); return true;
      }
      return false;
    },

    _open(replaceMode) {
      const editor = this._editor;
      if (!editor) return;
      const doc = editor._iframeDoc || document;
      if (!this._panel) {
        this._panel = buildSearchPanel(doc, {
          onFind: (q) => this._runFind(q),
          onNext: () => this._step(1),
          onPrev: () => this._step(-1),
          onReplace: (rep) => this._replaceCurrent(rep),
          onReplaceAll: (rep) => this._replaceAll(rep),
          onClose: () => this._close(),
          onCaseToggle: (on) => { this._caseSensitive = on; this._runFind(this._query); },
          onWholeWordToggle: (on) => { this._wholeWord = on; this._runFind(this._query); },
        });
        const host = editor._wrapper || editor.getEditorElement();
        if (host) host.appendChild(this._panel.node);
      }
      this._panel.setReplaceVisible(!!replaceMode);
      this._panel.focusFind();
    },

    _runFind(query) {
      this._query = query || '';
      const root = this._editor.getEditorElement();
      this._matches = findMatches(root, this._query, { caseSensitive: this._caseSensitive, wholeWord: this._wholeWord, document: this._editor._iframeDoc || document });
      this._index = this._matches.length ? 0 : -1;
      this._render();
    },

    _step(dir) {
      if (!this._matches.length) return;
      this._index = (this._index + dir + this._matches.length) % this._matches.length;
      this._render();
    },

    _render() {
      const win = this._editor.selection && this._editor.selection.getWindow && this._editor.selection.getWindow();
      const doc = this._editor._iframeDoc || document;
      const ranges = this._matches.map((m) => buildMatchRange(m, doc)).filter(Boolean);
      const active = this._index >= 0 ? ranges[this._index] : null;
      paintHighlights(win, ranges, active);
      if (active && active.startContainer && active.startContainer.parentElement && active.startContainer.parentElement.scrollIntoView) {
        try { active.startContainer.parentElement.scrollIntoView({ block: 'nearest' }); } catch { /* ignore */ }
      }
      if (this._panel) this._panel.setCount(this._matches.length ? this._index + 1 : 0, this._matches.length);
    },

    _replaceCurrent(replacement) {
      if (this._index < 0 || !this._matches[this._index]) return;
      const replacedIndex = this._index;
      this._editor.history && this._editor.history.takeSnapshot();
      replaceMatch(this._matches[this._index], replacement);
      this._afterMutate();
      this._runFind(this._query); // re-search (indices shifted)
      // Advance PAST the replacement so repeated Replace always makes progress.
      // `_runFind` resets to index 0; if the replacement text itself contains
      // the query (e.g. "a"→"aa"), the new occurrences sit AT the replaced spot,
      // so we must skip over them (count them) before landing on the next real
      // match — otherwise Replace loops on the same spot forever (audit MEDIUM).
      const rep = String(replacement);
      const q = this._caseSensitive ? this._query : this._query.toLowerCase();
      const hay = this._caseSensitive ? rep : rep.toLowerCase();
      let selfMatches = 0;
      if (q) { let i = 0; while ((i = hay.indexOf(q, i)) !== -1) { selfMatches++; i += q.length; } }
      if (this._matches.length) {
        this._index = Math.min(replacedIndex + selfMatches, this._matches.length - 1);
        this._render();
      }
    },

    _replaceAll(replacement) {
      if (!this._query) return;
      this._editor.history && this._editor.history.takeSnapshot();
      const n = replaceAll(this._editor.getEditorElement(), this._query, replacement, { caseSensitive: this._caseSensitive, wholeWord: this._wholeWord, document: this._editor._iframeDoc || document });
      this._afterMutate();
      this._runFind(this._query);
      this._editor.emit('afterCommand', { command: 'replaceAll', args: [n] });
    },

    _afterMutate() {
      if (this._editor._onChangeFn) this._editor._onChangeFn();
    },

    _close() {
      const win = this._editor && this._editor.selection && this._editor.selection.getWindow && this._editor.selection.getWindow();
      clearHighlights(win);
      if (this._panel && this._panel.node && this._panel.node.parentNode) {
        this._panel.node.parentNode.removeChild(this._panel.node);
      }
      this._panel = null;
      this._matches = [];
      this._index = -1;
    },
  };
}

export const findReplacePlugin = createFindReplacePlugin();
