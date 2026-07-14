/**
 * resize-editor.test.js — Phase 13.8: editor resize grip + clamp math.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { clampHeight, createResizeEditorPlugin, resizeEditorPlugin } from '../src/plugins/resize-editor/resize-editor-plugin.js';

describe('clampHeight (pure)', () => {
  it('adds the delta to the current height', () => {
    expect(clampHeight(200, 50, {})).toBe(250);
    expect(clampHeight(200, -50, {})).toBe(150);
  });
  it('clamps to the configured min', () => {
    expect(clampHeight(200, -1000, { min: 120 })).toBe(120);
  });
  it('clamps to the configured max', () => {
    expect(clampHeight(200, 1000, { max: 400 })).toBe(400);
  });
  it('never collapses below the safety floor (80) even with no min', () => {
    expect(clampHeight(200, -1000, {})).toBe(80);
  });
  it('never exceeds the safety ceiling (5000)', () => {
    expect(clampHeight(200, 999999, {})).toBe(5000);
  });
  it('rounds to an integer', () => {
    expect(Number.isInteger(clampHeight(200.4, 10.6, {}))).toBe(true);
  });
});

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('resize editor plugin', () => {
  it('exposes the contract + singleton', () => {
    const p = createResizeEditorPlugin();
    expect(p.name).toBe('resizeEditor');
    expect(resizeEditorPlugin.name).toBe('resizeEditor');
  });

  it('appends a grip to the wrapper on install and removes it on destroy', () => {
    const p = createResizeEditorPlugin();
    p.install(editor);
    const grip = editor._wrapper.querySelector('.oe-resize-grip');
    expect(grip).not.toBeNull();
    p.destroy();
    expect(editor._wrapper.querySelector('.oe-resize-grip')).toBeNull();
  });

  it('dragging the grip changes the wrapper height (clamped)', () => {
    editor._config.minHeight = 100;
    editor._config.maxHeight = 600;
    const p = createResizeEditorPlugin();
    p.install(editor);
    const grip = editor._wrapper.querySelector('.oe-resize-grip');
    // mock the wrapper rect height
    editor._wrapper.getBoundingClientRect = () => ({ height: 300, top: 0, bottom: 300, left: 0, right: 100, width: 100 });

    grip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 300 }));
    editor._wrapper.ownerDocument.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 380 }));
    expect(editor._wrapper.style.height).toBe('380px'); // 300 + 80

    // drag beyond max → clamped
    editor._wrapper.ownerDocument.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 2000 }));
    expect(editor._wrapper.style.height).toBe('600px');

    editor._wrapper.ownerDocument.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('does not resize in readonly mode', () => {
    const p = createResizeEditorPlugin();
    p.install(editor);
    if (editor.setReadOnly) editor.setReadOnly(true);
    else if (editor._state) editor._state.isReadOnly = true;
    const grip = editor._wrapper.querySelector('.oe-resize-grip');
    editor._wrapper.getBoundingClientRect = () => ({ height: 300, top: 0, bottom: 300, left: 0, right: 100, width: 100 });
    grip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 300 }));
    editor._wrapper.ownerDocument.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 500 }));
    expect(editor._wrapper.style.height).toBe(''); // unchanged
    editor._wrapper.ownerDocument.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('emits resizeEditor on drag end', () => {
    const p = createResizeEditorPlugin();
    p.install(editor);
    let fired = false;
    editor.on('resizeEditor', () => { fired = true; });
    const grip = editor._wrapper.querySelector('.oe-resize-grip');
    editor._wrapper.getBoundingClientRect = () => ({ height: 300, top: 0, bottom: 300, left: 0, right: 100, width: 100 });
    grip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 300 }));
    editor._wrapper.ownerDocument.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 350 }));
    editor._wrapper.ownerDocument.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(fired).toBe(true);
  });

  it('installs/uninstalls cleanly via PluginManager', () => {
    editor.plugins.install(createResizeEditorPlugin());
    expect(editor.plugins._installed.has('resizeEditor')).toBe(true);
    expect(() => editor.plugins.uninstall('resizeEditor')).not.toThrow();
    expect(editor._wrapper.querySelector('.oe-resize-grip')).toBeNull();
  });
});
