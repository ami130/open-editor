/**
 * ai-replace.js — the shared, FAILURE-SAFE "replace selection with an AI
 * result" primitive used by Quick Actions and Translate.
 *
 * The rule that matters: NEVER delete the user's selected text before we have a
 * result in hand. The original plugins deleted the selection up front and then
 * streamed the reply, so any failure (no endpoint, bad key, HTTP/stream error,
 * or an empty reply) left the selection gone with nothing to replace it — the
 * content silently vanished, which read as "the feature is broken / eats my
 * text". Here we fetch the FULL result with insert:false, and only when we
 * actually got non-empty text do we delete the captured range and insert a
 * plain text node in its place. A failed/empty call leaves the original intact.
 *
 * @param {object} editor  the editor (needs aiComplete, selection, getEditorElement)
 * @param {object} info    the selection snapshot from selection.get() ({ range })
 * @param {object} args    { prompt, system } for aiComplete
 * @returns {Promise<string>} the inserted text ('' when nothing was replaced)
 */
export async function replaceSelectionWithAi(editor, info, { prompt, system }) {
  // aiComplete already emits a SPECIFIC aiError (no-endpoint / network / http /
  // stream) and returns '' on failure. Track that so we don't overwrite a
  // helpful message with a generic "empty" one — only emit 'empty' when the
  // call genuinely succeeded but produced no text.
  let sawError = false;
  const onErr = () => { sawError = true; };
  if (editor.on) editor.on('aiError', onErr);
  let result;
  try {
    result = await editor.aiComplete({ prompt, system, insert: false });
  } finally {
    if (editor.off) editor.off('aiError', onErr);
  }
  const out = (result || '').trim();
  if (!out) {
    if (!sawError) editor.emit('aiError', { reason: 'empty' });
    return '';
  }
  if (info && info.range) {
    const range = info.range;
    range.deleteContents();
    const doc = (editor.getEditorElement && editor.getEditorElement().ownerDocument) || document;
    range.insertNode(doc.createTextNode(out));
    range.collapse(false);
    const sel = editor.selection;
    if (sel && sel.set) { try { sel.set(info); } catch { /* ignore */ } }
  }
  return out;
}
