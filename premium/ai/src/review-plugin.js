/**
 * review-plugin.js — raw spec (gated by index.js). Reviews the current
 * selection (or the whole document if nothing is selected) via the FREE
 * aiComplete() hook with insert:false, parses structured suggestions, and shows
 * an accept/reject panel. Accepted replacements are applied to the reviewed
 * text and written back — scoped to the selection when there is one.
 */
import { reviewPrompt, parseReview, applyReplacement } from './review-core.js';
import { buildReviewPanel } from './review-panel.js';

const REVIEW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
</svg>`;

export function rawReviewSpec() {
  let editor = null;
  let running = false;

  function docFor() {
    return editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
  }

  /**
   * Apply accepted suggestions to the REVIEWED SELECTION only, and write it
   * back into that same selection. We snapshot the selection when review starts
   * (`saved`) and restore it here, because the modal collapsed the live
   * selection. We NEVER setHTML the whole document (the old code did, which
   * flattened the entire doc — catastrophic data loss). Replacement is
   * text-level within the selection; inline formatting inside the reviewed span
   * is not preserved (suggestions target prose) — but nothing outside the
   * selection is ever touched.
   */
  function applyAccepted(chosen, scope) {
    let text = scope.text;
    for (const s of chosen) {
      text = applyReplacement(text, s.original, s.suggestion).text; // stale → unchanged
    }
    const sel = editor.selection;
    if (scope.saved && sel && sel.restore) {
      if (editor.getEditorElement) editor.getEditorElement().focus();
      sel.restore(scope.saved); // re-select the reviewed range (modal collapsed it)
    }
    const info = sel && sel.get ? sel.get() : null;
    if (info && info.range && !info.collapsed) {
      info.range.deleteContents();
      sel.insertAtCursor(text);
      if (editor._onChangeFn) editor._onChangeFn();
      editor.emit('aiReviewApplied', { count: chosen.length });
    } else {
      // The reviewed selection is gone (edited/lost) — refuse rather than guess.
      editor.emit('aiError', { reason: 'selection-lost' });
    }
  }

  async function review() {
    if (!editor || editor._destroyed || running) return;
    if (!editor.ui || !editor.ui.modal) return;
    const sel = editor.selection;
    const selText = sel && sel.getText ? sel.getText().trim() : '';
    // Require a selection: whole-document review can't be applied without
    // destroying formatting, so we scope Review to a selection (like the other
    // AI actions). No selection → guide the user instead of flattening the doc.
    if (!selText) { editor.emit('aiError', { reason: 'no-selection' }); return; }
    // Snapshot the selection BEFORE the async request + modal collapse it.
    const saved = sel.save ? sel.save() : null;

    running = true;
    editor.emit('aiReviewStart', {});
    const { system, prompt } = reviewPrompt(selText);
    let raw;
    try {
      raw = await editor.aiComplete({ prompt, system, insert: false });
    } finally {
      running = false;
    }
    const suggestions = parseReview(raw); // parseReview([] on non-string/undefined)
    editor.emit('aiReviewReady', { count: suggestions.length });
    const doc = docFor();
    if (!doc) return;
    const panel = buildReviewPanel(doc, {
      suggestions,
      onApply: (chosen) => { applyAccepted(chosen, { text: selText, saved }); editor.ui.modal.close(); },
    });
    editor.ui.modal.open({ title: 'AI Review', body: panel.node });
  }

  return {
    name: 'ai-review',
    install(ed) {
      editor = ed;
      ed.aiReview = review;
    },
    destroy() {
      if (editor && editor.aiReview === review) delete editor.aiReview;
      editor = null;
    },
    getToolbarButtons() {
      return [{
        name: 'aiReview',
        type: 'button',
        icon: REVIEW_ICON,
        tooltip: 'AI Review',
        onClick: () => review(),
      }];
    },
  };
}
