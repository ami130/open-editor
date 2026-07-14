/**
 * block-drag-plugin.test.js — Phase 16.6.4 jsdom-level coverage.
 *
 * jsdom has no real layout engine (getBoundingClientRect returns all-zero
 * rects, elementFromPoint is undefined), so the mouse-driven hover/drag GESTURE
 * itself is verified in Playwright (16.6.5, real browsers). Here we verify:
 * install/destroy lifecycle (handle/indicator mount and unmount cleanly), and
 * the reorder + single-history-snapshot outcome by driving the plugin's own
 * drag-state methods directly (the same code path a real drag would run).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createBlockDragPlugin } from '../src/plugins/block-drag/block-drag-plugin.js';

let editor;
afterEach(() => {
  if (editor && !editor.isDestroyed()) editor.destroy();
  if (editor && editor._target && editor._target.parentNode) editor._target.remove();
});

describe('block-drag plugin — lifecycle', () => {
  it('install() mounts a hidden handle and drop-indicator in the wrapper', () => {
    editor = createTestEditor();
    editor.plugins.install(createBlockDragPlugin());
    expect(editor._wrapper.querySelector('.oe-block-handle')).not.toBeNull();
    expect(editor._wrapper.querySelector('.oe-block-drop-indicator')).not.toBeNull();
    expect(editor._wrapper.querySelector('.oe-block-handle').hidden).toBe(true);
  });

  it('destroy() removes both the handle and the indicator from the DOM', () => {
    editor = createTestEditor();
    editor.plugins.install(createBlockDragPlugin());
    editor.plugins.uninstall('blockDrag');
    expect(editor._wrapper.querySelector('.oe-block-handle')).toBeNull();
    expect(editor._wrapper.querySelector('.oe-block-drop-indicator')).toBeNull();
  });
});

describe('block-drag plugin — reorder + single snapshot', () => {
  it('dragging block A to before block C reorders the DOM and takes exactly ONE history snapshot', () => {
    editor = createTestEditor();
    const plugin = createBlockDragPlugin();
    editor.plugins.install(plugin);
    editor.setHTML('<p id="a">A</p><p id="b">B</p><p id="c">C</p>');
    const el = editor.getEditorElement();
    const [a, , c] = Array.from(el.children);

    const snapshotSpy = vi.spyOn(editor.history, 'takeSnapshot');
    // Drive the plugin's own drag lifecycle directly (bypasses real mouse
    // geometry, which jsdom can't provide) — same state machine a real drag runs.
    plugin._hoveredBlock = a;
    plugin._startDrag({ preventDefault() {} });
    plugin._dropTarget = c; // simulate the drag having settled just before C
    plugin._finishDrag();

    expect(Array.from(el.children).map((n) => n.id)).toEqual(['b', 'a', 'c']);
    expect(snapshotSpy).toHaveBeenCalledTimes(1);
  });

  it('dropping in the same position (no-op move) does NOT take a snapshot', () => {
    editor = createTestEditor();
    const plugin = createBlockDragPlugin();
    editor.plugins.install(plugin);
    editor.setHTML('<p id="a">A</p><p id="b">B</p>');
    const el = editor.getEditorElement();
    const [a, b] = Array.from(el.children);

    const snapshotSpy = vi.spyOn(editor.history, 'takeSnapshot');
    plugin._hoveredBlock = a;
    plugin._startDrag({ preventDefault() {} });
    plugin._dropTarget = b; // a is already immediately before b — no-op
    plugin._finishDrag();

    expect(Array.from(el.children).map((n) => n.id)).toEqual(['a', 'b']);
    expect(snapshotSpy).not.toHaveBeenCalled();
  });

  it('drop target undefined (drag ended without a tracked position) does not move or snapshot', () => {
    editor = createTestEditor();
    const plugin = createBlockDragPlugin();
    editor.plugins.install(plugin);
    editor.setHTML('<p id="a">A</p><p id="b">B</p>');
    const el = editor.getEditorElement();
    const a = el.firstElementChild;

    const snapshotSpy = vi.spyOn(editor.history, 'takeSnapshot');
    plugin._hoveredBlock = a;
    plugin._startDrag({ preventDefault() {} });
    // no _onDrag call at all -> _dropTarget stays undefined
    plugin._finishDrag();

    expect(Array.from(el.children).map((n) => n.id)).toEqual(['a', 'b']);
    expect(snapshotSpy).not.toHaveBeenCalled();
  });

  it('removes the drag-source styling class after drop', () => {
    editor = createTestEditor();
    const plugin = createBlockDragPlugin();
    editor.plugins.install(plugin);
    editor.setHTML('<p id="a">A</p><p id="b">B</p>');
    const el = editor.getEditorElement();
    const a = el.firstElementChild;

    plugin._hoveredBlock = a;
    plugin._startDrag({ preventDefault() {} });
    expect(a.classList.contains('oe-block-drag-source')).toBe(true);
    plugin._dropTarget = null; // drop at end
    plugin._finishDrag();
    expect(a.classList.contains('oe-block-drag-source')).toBe(false);
    expect(Array.from(el.children).map((n) => n.id)).toEqual(['b', 'a']);
  });
});
