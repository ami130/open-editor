/**
 * media-paste.js — Phase: paste-a-bare-URL auto-embed, matching CKEditor's
 * MediaEmbed/AutoMediaEmbed UX: only when the ENTIRE trimmed clipboard text is
 * a single supported YouTube/Vimeo URL (never a URL mixed with other text,
 * and never raw pasted <iframe> HTML — that stays sanitizer-stripped, same as
 * a hand-crafted embed would be). Mirrors installPasteAutolink's shape
 * (link-behaviors.js) so both paste-claiming plugins behave consistently.
 */
import { getClipboardText } from '../../utils/clipboard.js';
import { getClosestTag } from '../../selection/range-utils.js';
import { parseMediaUrl } from './media-providers.js';
import { insertEmbed } from './media-dom.js';

export function installPasteAutoEmbed(editor) {
  editor.on('paste', (e) => {
    if (e.defaultPrevented) return;

    const text = getClipboardText(e, false); // text/plain only
    if (text == null) return;
    const trimmed = text.trim();
    if (!trimmed || /\s/.test(trimmed)) return; // must be a single token

    const spec = parseMediaUrl(trimmed);
    if (!spec) return;

    // Don't auto-embed inside a code context — the URL is literal there.
    const info = editor.selection && editor.selection.get();
    const root = editor.getEditorElement();
    const node = info && info.startNode;
    if (node && root && getClosestTag(node, 'pre', root)) return;

    // Claim the paste so core's HTML/text/autolink paths exit.
    e.preventDefault();
    editor.history && editor.history.takeSnapshot();
    insertEmbed(editor, spec);
  });
}
