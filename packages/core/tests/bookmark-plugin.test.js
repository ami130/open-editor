/**
 * 17.5.7 — bookmarks: insert, round-trip, list, link-dialog integration.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { createBookmarkPlugin, listBookmarks } from '../src/plugins/bookmark/bookmark-plugin.js';
import { sanitize } from '../src/sanitizer/sanitizer.js';

let editor, target;
function make() {
  target = document.createElement('div');
  document.body.appendChild(target);
  editor = new OpenEditor(target, {});
  editor.plugins.install(createBookmarkPlugin());
  return editor;
}
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (target && target.parentNode) target.remove();
  editor = target = null;
  document.querySelectorAll('.oe-modal-backdrop, .oe-modal').forEach((n) => n.remove());
});

describe('17.5.7 — bookmarks', () => {
  it('a bookmark anchor survives the sanitizer round-trip with its id', () => {
    make();
    editor.setHTML('<p>before <a id="sec-1" class="oe-bookmark" contenteditable="false"></a> after</p>');
    const out = editor.getHTML();
    expect(out).toContain('id="sec-1"');
    expect(out).toContain('class="oe-bookmark"');
    editor.setHTML(out);
    expect(listBookmarks(editor)).toHaveLength(1);
  });

  it('listBookmarks finds all anchors', () => {
    make();
    editor.setHTML('<p><a id="a1" class="oe-bookmark"></a>x<a id="a2" class="oe-bookmark"></a></p>');
    expect(listBookmarks(editor).map((b) => b.id)).toEqual(['a1', 'a2']);
  });

  it('a "#anchor" href passes the link pipeline (fragment links are safe)', () => {
    make();
    const clean = sanitize('<p><a href="#sec-1">jump</a></p>', { document });
    expect(clean).toContain('href="#sec-1"');
  });

  it('toolbar button exists', () => {
    make();
    expect(target.querySelector('.oe-tb__btn[data-name="bookmark"]')).toBeTruthy();
  });
});
