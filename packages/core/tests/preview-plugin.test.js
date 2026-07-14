/**
 * preview-plugin.test.js — Phase 13.11: sandboxed preview modal.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createPreviewPlugin, previewPlugin } from '../src/plugins/preview/preview-plugin.js';

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('createPreviewPlugin', () => {
  it('exposes the contract + singleton', () => {
    const p = createPreviewPlugin();
    expect(p.name).toBe('preview');
    expect(typeof p.getToolbarButtons).toBe('function');
    expect(previewPlugin.name).toBe('preview');
  });

  it('contributes a button', () => {
    const b = createPreviewPlugin().getToolbarButtons()[0];
    expect(b.name).toBe('preview');
    expect(typeof b.onClick).toBe('function');
  });

  it('installs/uninstalls cleanly', () => {
    editor.plugins.install(createPreviewPlugin());
    expect(editor.plugins._installed.has('preview')).toBe(true);
    expect(() => editor.plugins.uninstall('preview')).not.toThrow();
  });

  it('opens a modal containing a SANDBOXED iframe with the content', () => {
    const p = createPreviewPlugin();
    p.install(editor);
    editor.getEditorElement().innerHTML = '<p>hello <strong>world</strong></p>';
    p._open();
    const frame = document.querySelector('.oe-preview__frame');
    expect(frame).not.toBeNull();
    expect(frame.tagName).toBe('IFRAME');
    // sandbox="" (empty) → no scripts, no same-origin — the critical safety bit
    expect(frame.getAttribute('sandbox')).toBe('');
    const srcdoc = frame.getAttribute('srcdoc');
    expect(srcdoc).toMatch(/hello/);
    expect(srcdoc).toMatch(/<strong>world<\/strong>/);
    editor.ui.modal.close(null);
  });

  it('renders sanitized content — a dangerous handler never reaches the preview', () => {
    const p = createPreviewPlugin();
    p.install(editor);
    // content that bypassed setHTML; getHTML() sanitizes it on the way out
    editor.getEditorElement().innerHTML = '<p>ok<img src=x onerror="alert(1)"></p>';
    p._open();
    const srcdoc = document.querySelector('.oe-preview__frame').getAttribute('srcdoc');
    expect(srcdoc).not.toMatch(/onerror/i);
    expect(srcdoc).toMatch(/ok/);
    editor.ui.modal.close(null);
  });

  it('shows an (empty) placeholder for an empty editor', () => {
    const p = createPreviewPlugin();
    p.install(editor);
    editor.getEditorElement().innerHTML = '<p><br></p>'; // canonical empty
    p._open();
    const srcdoc = document.querySelector('.oe-preview__frame').getAttribute('srcdoc');
    expect(srcdoc).toMatch(/empty/);
    editor.ui.modal.close(null);
  });
});
