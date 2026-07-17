/**
 * media-resize.test.js — resize overlay lifecycle + _applySize's aspect-ratio
 * handling for a selected video embed. jsdom has no real layout engine, so
 * (mirroring block-drag-plugin.test.js's established pattern) the drag state
 * machine is driven directly rather than through simulated pointer geometry;
 * the actual drag gesture is verified by Playwright in bugfix-regressions.test.js.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { MediaResizeManager } from '../src/plugins/media/media-resize.js';
import { buildEmbed } from '../src/plugins/media/media-dom.js';

let editor, root, mgr;
beforeEach(() => {
  editor = createTestEditor();
  root = editor.getEditorElement();
  mgr = new MediaResizeManager();
  mgr.install(editor);
});
afterEach(() => {
  mgr.destroy();
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

function insertFig() {
  const f = buildEmbed(editor, { provider: 'youtube', src: 'https://www.youtube-nocookie.com/embed/x' });
  root.innerHTML = '';
  root.appendChild(f);
  return f;
}

describe('MediaResizeManager — overlay lifecycle', () => {
  it('mounts the overlay on mediaSelected and unmounts on mediaDeselected', () => {
    const f = insertFig();
    editor.emit('mediaSelected', { figure: f });
    expect(editor._wrapper.querySelector('.oe-resize-overlay')).not.toBeNull();
    editor.emit('mediaDeselected', { figure: f });
    expect(editor._wrapper.querySelector('.oe-resize-overlay')).toBeNull();
  });

  it('destroy removes the overlay and stops listening', () => {
    const f = insertFig();
    editor.emit('mediaSelected', { figure: f });
    mgr.destroy();
    expect(editor._wrapper.querySelector('.oe-resize-overlay')).toBeNull();
    expect(() => editor.emit('mediaSelected', { figure: f })).not.toThrow();
  });
});

describe('MediaResizeManager — _applySize (aspect-ratio handling)', () => {
  it('a corner/side drag (non n/s) sets width and clears any explicit height/aspect-ratio override', () => {
    const f = insertFig();
    f.style.height = '999px';
    f.style.aspectRatio = 'auto';
    mgr._figure = f;
    mgr._applySize(500, 281, 'se');
    expect(f.style.width).toBe('500px');
    expect(f.style.height).toBe('');
    expect(f.style.aspectRatio).toBe('');
  });

  it('a vertical-only edge drag (n/s) pins an explicit height; width auto (null) lets aspect follow', () => {
    const f = insertFig();
    mgr._figure = f;
    // vertical drag → width is null (auto), height pinned
    mgr._applySize(null, 200, 's');
    expect(f.style.height).toBe('200px');
    expect(f.style.width).toBe('');           // width not pinned → aspect-ratio drives it
    expect(f.style.aspectRatio).toBe('');
  });

  it('a horizontal-only edge drag (e/w) behaves like a corner drag (width-driven aspect ratio)', () => {
    const f = insertFig();
    f.style.height = '999px';
    mgr._figure = f;
    mgr._applySize(400, 225, 'e');
    expect(f.style.width).toBe('400px');
    expect(f.style.height).toBe('');
  });
});

describe('MediaResizeManager — drag lifecycle (state machine, jsdom-safe)', () => {
  it('snapshots BEFORE the drag starts, so undo returns to pre-resize dimensions', () => {
    // Mirrors image-resize.js's discipline: one snapshot on mousedown captures
    // the "before" state; the editor's own afterCommand->takeSnapshot wiring
    // (history-manager.js) then captures "after" on drag end — two snapshots,
    // one undo step, matching the live-browser undo-restores-pre-resize-size
    // behavior already verified in bugfix-regressions.test.js.
    const f = insertFig();
    editor.emit('mediaSelected', { figure: f });
    let snapshots = 0;
    const orig = editor.history.takeSnapshot.bind(editor.history);
    editor.history.takeSnapshot = () => { snapshots++; return orig(); };

    mgr._onHandleMouseDown({ preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0 }, 'se');
    expect(snapshots).toBe(1); // pre-drag snapshot

    mgr._handleDragEnd({ clientX: 50, clientY: 30, shiftKey: false });
    expect(snapshots).toBe(2); // post-drag afterCommand auto-snapshot
  });

  it('re-entrant mousedown while a drag is live is ignored (no duplicate snapshot)', () => {
    const f = insertFig();
    editor.emit('mediaSelected', { figure: f });
    let snapshots = 0;
    editor.history.takeSnapshot = () => { snapshots++; };

    const e = { preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0 };
    mgr._onHandleMouseDown(e, 'se');
    mgr._onHandleMouseDown(e, 'se'); // second grab mid-drag
    expect(snapshots).toBe(1);
  });

  it('emits afterCommand:resizeMedia on drag end', () => {
    const f = insertFig();
    editor.emit('mediaSelected', { figure: f });
    let cmd = null;
    editor.on('afterCommand', (payload) => { cmd = payload.command; });
    mgr._onHandleMouseDown({ preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0 }, 'se');
    mgr._handleDragEnd({ clientX: 40, clientY: 20, shiftKey: false });
    expect(cmd).toBe('resizeMedia');
  });
});
