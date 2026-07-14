/**
 * lang-commands.js — 17.5.10: mark a text fragment's language.
 *
 * `textPartLanguage('ar')` wraps the selection in `<span lang="ar" dir="rtl">`
 * (dir automatic for RTL scripts) so screen readers switch pronunciation
 * (WCAG 3.1.2, Language of Parts). Re-applying the same code from inside the
 * span unwraps it. v1 applies within a single block (consistent with 17.5.8).
 */
import { getParentBlock, walkUp } from '../selection/range-utils.js';

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv']);

export function registerLangCommands(editor) {
  editor.commands.register('textPartLanguage', {
    execute(ed, code) {
      if (!code || !/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(String(code))) return false;
      const info = ed.selection && ed.selection.get();
      if (!info) return false;
      const root = ed.getEditorElement();

      // Toggle OFF: inside a span already marked with this code.
      const host = walkUp(info.startNode, root, (n) =>
        n.nodeType === 1 && n.tagName.toLowerCase() === 'span' && n.getAttribute('lang') === code);
      if (host) {
        const parent = host.parentNode;
        while (host.firstChild) parent.insertBefore(host.firstChild, host);
        parent.removeChild(host);
        return true;
      }

      if (info.collapsed) return false;
      const sb = getParentBlock(info.startNode, root);
      const eb = getParentBlock(info.endNode, root);
      if (!sb || sb !== eb) return false;

      const doc = root.ownerDocument;
      const span = doc.createElement('span');
      span.setAttribute('lang', code);
      const base = String(code).split('-')[0].toLowerCase();
      if (RTL_LANGS.has(base)) span.setAttribute('dir', 'rtl');
      span.appendChild(info.range.extractContents());
      info.range.insertNode(span);
      ed.selection.set(span, 0, span, span.childNodes.length);
      return true;
    },
  });
}
