/**
 * footnotes-plugin.js — the raw plugin spec (module-private; wrapped by the
 * gated factory in index.js). Adds a toolbar button + an `insertFootnote`
 * command that drops a reference marker at the caret and keeps a managed
 * notes section in sync.
 *
 * Integration facts (verified against core):
 *  - Insert via editor.selection.insertAtCursor(node) with the marker as a
 *    contenteditable="false" atomic island.
 *  - Register as a COMMAND returning CommandManager.SKIP_RESTORE, and do the
 *    marker-insert + renumber synchronously in one execute → ONE undo step
 *    (history snapshots once per afterCommand).
 *  - Re-run renumber on the `setHTML` event so loaded content re-syncs.
 *  - Mutating command → NOT readOnlyExempt (blocked in read-only automatically).
 */
import { CommandManager } from '../../../packages/core/src/commands/command-manager.js';
import { createRefMarker, renumber, refMarkers } from './footnote-core.js';

const FN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M4 6h10M4 12h7"/><text x="15.5" y="10" font-size="9" fill="currentColor" stroke="none">1</text><path d="M4 18h16"/>
</svg>`;

export function rawFootnotesSpec() {
  let editor = null;

  function root() { return editor && editor.getEditorElement && editor.getEditorElement(); }

  /**
   * Insert a marker at the caret + renumber. Runs inside the command, AFTER the
   * toolbar (or an imperative caller) has restored the caret — so we insert at
   * the live selection. insertAtCursor treats the contenteditable="false" sup
   * as an atomic island (won't absorb a selection). One synchronous mutation
   * block → one history snapshot → one undo step.
   */
  function docFor() {
    return editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
  }

  /** Place the caret inside a node so the user can type immediately. */
  function focusInto(node, doc) {
    if (!node) return;
    try {
      const win = doc.defaultView || window;
      const sel = win.getSelection && win.getSelection();
      if (!sel) return;
      const range = doc.createRange();
      range.selectNodeContents(node);
      range.collapse(true); // caret at the start of the (empty) note
      sel.removeAllRanges();
      sel.addRange(range);
      if (editor.getEditorElement) editor.getEditorElement().focus();
    } catch { /* focusing is best-effort */ }
  }

  function doInsert() {
    const el = root();
    if (!el || !editor.selection) return;
    const doc = docFor();
    if (!doc) return;
    const marker = createRefMarker(doc);
    editor.selection.insertAtCursor(marker);
    renumber(el, doc); // number the new marker + sync the notes section
    // FN-1: move the caret INTO the new note's <li> so the user can type it
    // right away (the whole point of a footnote). Without this the note is an
    // empty bullet at the document end with no affordance to author it.
    const n = marker.getAttribute('data-oe-footnote-ref');
    const li = n && el.querySelector(`li#fn-${n}`);
    focusInto(li, doc);
    if (editor._onChangeFn) editor._onChangeFn();
  }

  /** Re-sync numbering after external content loads (setHTML) or edits. */
  function resync() {
    const el = root();
    if (!el) return;
    const doc = docFor();
    if (doc) renumber(el, doc);
  }

  // FN-2: renumber on edits too, not just insert. Deleting a marker (the atomic
  // <sup> deletes as a unit) must drop its note and renumber the rest. Debounced
  // + guarded so it only runs when the marker/note counts actually drift, so we
  // don't fight the user's caret while they type note text.
  let syncTimer = null;
  function onInput() {
    const el = root();
    if (!el) return;
    if (syncTimer) return; // coalesce bursts
    syncTimer = setTimeout(() => {
      syncTimer = null;
      const el2 = root();
      if (!el2) return;
      const markers = refMarkers(el2).length;
      const notes = el2.querySelectorAll('ol.oe-footnotes > li[data-oe-footnote]').length;
      // Only rebuild when counts drift (a marker was deleted) — NOT on every
      // keystroke inside a note, which would clobber the caret.
      if (markers !== notes) resync();
    }, 200);
  }

  /** Click a ref marker → scroll its note into view (and vice-versa). */
  function onClick(e) {
    const el = root();
    if (!el) return;
    const ref = e.target && e.target.closest && e.target.closest('sup.oe-footnote-ref');
    if (ref) {
      const n = ref.getAttribute('data-oe-footnote-ref');
      const note = el.querySelector(`li#fn-${n}`);
      if (note) note.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const li = e.target && e.target.closest && e.target.closest('ol.oe-footnotes > li[data-oe-footnote]');
    if (li) {
      const n = li.getAttribute('data-oe-footnote');
      const back = el.querySelector(`sup#fnref-${n}`);
      if (back) back.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  return {
    name: 'footnotes',
    install(ed) {
      editor = ed;
      // The command: one execute = one undo step; SKIP_RESTORE keeps our caret.
      editor.commands.register('insertFootnote', {
        execute: () => { doInsert(); return CommandManager.SKIP_RESTORE; },
      });
      editor.on('setHTML', resync);
      editor.on('input', onInput); // FN-2: renumber when a marker is deleted
      const el = root();
      if (el) el.addEventListener('click', onClick);
      // Imperative API + a headless count (handy for tests / integrators).
      editor.insertFootnote = () => editor.commands.execute('insertFootnote');
      editor.getFootnoteCount = () => (root() ? refMarkers(root()).length : 0);
      resync(); // sync any footnotes already present in the initial content
    },
    destroy() {
      if (editor) {
        editor.off && editor.off('setHTML', resync);
        editor.off && editor.off('input', onInput);
        if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
        const el = root();
        if (el) el.removeEventListener('click', onClick);
        if (editor.commands && editor.commands.unregister) editor.commands.unregister('insertFootnote');
        delete editor.insertFootnote;
        delete editor.getFootnoteCount;
      }
      editor = null;
    },
    getToolbarButtons() {
      return [{
        name: 'insertFootnote',
        type: 'button',
        icon: FN_ICON,
        tooltip: 'Insert footnote',
        // The toolbar itself saves the caret on mousedown and restores it before
        // onClick (toolbar-button.js) — so the command inserts at the user's
        // caret with no extra bookkeeping here.
        onClick: () => editor.commands.execute('insertFootnote'),
        // NOT readOnlyExempt — inserting mutates, so it's disabled in read-only.
      }];
    },
  };
}
