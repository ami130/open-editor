/**
 * bookmark-audit-fixes.test.js — deep-audit fixes for the bookmark plugin:
 *  B1 renaming/re-presenting an existing bookmark is now undoable (PROVEN
 *     live during the audit: undo used to skip past the rename entirely,
 *     back to before the bookmark existed at all).
 *  B2 uniqueness check widened to ANY id-bearing element, not just bookmarks.
 *  B3 a blank/whitespace name shows a visible validation error.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { OpenEditor } from '../src/editor.js';
import { createBookmarkPlugin, listBookmarks } from '../src/plugins/bookmark/bookmark-plugin.js';

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

function clickSave() {
  const btn = Array.from(document.querySelectorAll('.oe-modal button'))
    .find((b) => /save/i.test(b.textContent));
  btn.click();
}

describe('B1 — rename is undoable', () => {
  it('undo after a rename restores the ORIGINAL name (not a state before insert)', async () => {
    make();
    const plugin = editor.plugins.get('bookmark');
    editor.setHTML('<p>x<a id="original" class="oe-bookmark" contenteditable="false"></a>y</p>');
    const mark = editor.getEditorElement().querySelector('a.oe-bookmark');

    const done = plugin._openDialog(mark);
    document.querySelector('.oe-bm-dialog__input').value = 'renamed';
    clickSave();
    await done;
    expect(listBookmarks(editor)[0].id).toBe('renamed');

    editor.undo();
    expect(listBookmarks(editor)[0].id).toBe('original');
  });

  it('emits afterCommand:renameBookmark so HistoryManager captures the post-state too', async () => {
    make();
    const plugin = editor.plugins.get('bookmark');
    editor.setHTML('<p><a id="a" class="oe-bookmark" contenteditable="false"></a></p>');
    const mark = editor.getEditorElement().querySelector('a.oe-bookmark');
    let cmd = null;
    editor.on('afterCommand', (p) => { cmd = p.command; });
    const done = plugin._openDialog(mark);
    document.querySelector('.oe-bm-dialog__input').value = 'b';
    clickSave();
    await done;
    expect(cmd).toBe('renameBookmark');
  });
});

describe('B2 — uniqueness check widened beyond other bookmarks', () => {
  it('rejects a name that collides with a non-bookmark id-bearing element', async () => {
    make();
    editor.setHTML('<p id="taken">hi</p>');
    const plugin = editor.plugins.get('bookmark');
    const done = plugin._openDialog(null);
    const input = document.querySelector('.oe-bm-dialog__input');
    input.value = 'taken';
    input.dispatchEvent(new Event('input'));
    const err = document.querySelector('.oe-bm-dialog__error');
    expect(err.textContent).not.toBe('');
    // Cancel out of the dialog (don't leave it hanging for other tests).
    const cancelBtn = Array.from(document.querySelectorAll('.oe-modal button'))
      .find((b) => /cancel/i.test(b.textContent));
    cancelBtn.click();
    await done;
  });

  it('still allows a genuinely free name', async () => {
    make();
    editor.setHTML('<p id="taken">hi</p>');
    const plugin = editor.plugins.get('bookmark');
    const done = plugin._openDialog(null);
    const input = document.querySelector('.oe-bm-dialog__input');
    input.value = 'free-name';
    input.dispatchEvent(new Event('input'));
    const err = document.querySelector('.oe-bm-dialog__error');
    expect(err.textContent).toBe('');
    clickSave();
    await done;
    expect(listBookmarks(editor).map((b) => b.id)).toContain('free-name');
  });
});

describe('B3 — blank name shows a visible error', () => {
  it('a whitespace-only name shows an error instead of silently failing', async () => {
    make();
    const plugin = editor.plugins.get('bookmark');
    const done = plugin._openDialog(null);
    const input = document.querySelector('.oe-bm-dialog__input');
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    const err = document.querySelector('.oe-bm-dialog__error');
    expect(err.textContent).not.toBe('');
    const cancelBtn = Array.from(document.querySelectorAll('.oe-modal button'))
      .find((b) => /cancel/i.test(b.textContent));
    cancelBtn.click();
    await done;
  });
});

// B4 — re-audit finding: the dialog's Remove button bypassed undo entirely
// (called removeBookmark() directly instead of routing through
// commands.execute('removeBookmark'), unlike the context-menu's Remove path).
// PROVEN live before the fix: undo() after a dialog-Remove was a total no-op.
describe('B4 — dialog Remove is undoable', () => {
  it('undo after Remove (via the dialog) restores the bookmark', async () => {
    make();
    const plugin = editor.plugins.get('bookmark');
    editor.setHTML('<p>x<a id="gone" class="oe-bookmark" contenteditable="false"></a>y</p>');
    const mark = editor.getEditorElement().querySelector('a.oe-bookmark');

    const done = plugin._openDialog(mark);
    const removeBtn = Array.from(document.querySelectorAll('.oe-modal button'))
      .find((b) => /remove/i.test(b.textContent));
    removeBtn.click();
    await done;
    expect(listBookmarks(editor)).toHaveLength(0);

    editor.undo();
    expect(listBookmarks(editor)).toHaveLength(1);
    expect(listBookmarks(editor)[0].id).toBe('gone');
  });

  it('dialog Remove routes through the registered command (matches context-menu Remove)', async () => {
    make();
    const plugin = editor.plugins.get('bookmark');
    editor.setHTML('<p><a id="a" class="oe-bookmark" contenteditable="false"></a></p>');
    const mark = editor.getEditorElement().querySelector('a.oe-bookmark');
    let executed = null;
    const orig = editor.commands.execute.bind(editor.commands);
    editor.commands.execute = (name, args) => { executed = name; return orig(name, args); };

    const done = plugin._openDialog(mark);
    const removeBtn = Array.from(document.querySelectorAll('.oe-modal button'))
      .find((b) => /remove/i.test(b.textContent));
    removeBtn.click();
    await done;
    expect(executed).toBe('removeBookmark');
  });
});
