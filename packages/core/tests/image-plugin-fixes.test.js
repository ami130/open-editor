/**
 * image-plugin-fixes.test.js — Unit tests for Steps 1–4 bug fixes.
 * Covers: data URI sanitizer, XSS link block, delete floor, 10MB size guard.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createImagePlugin } from '../src/plugins/image/image-plugin.js';
import { createFigure, wrapInLink, buildAndInsertFigure } from '../src/plugins/image/image-dom.js';
import { OpenEditor } from '../src/editor.js';

// ── Helper: fresh plugin instance per test ────────────────────────────────────
function makePlugin() {
  return createImagePlugin();
}

let editor;

beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

// ── Step 1: sanitizer respects imageAllowDataUri ──────────────────────────────

describe('9.12 — data URI round-trip with imageAllowDataUri', () => {
  it('data URI src stripped from getHTML() by default', () => {
    const DATA_SRC = 'data:image/png;base64,abc123==';
    const fig = createFigure(DATA_SRC, {}, { imageAllowDataUri: true }, document);
    expect(fig).not.toBeNull();
    // Insert into an editor WITHOUT imageAllowDataUri — getHTML should strip src
    const ed2 = createTestEditor(); // default config, no imageAllowDataUri
    ed2.getEditorElement().appendChild(fig);
    const html = ed2.getHTML();
    // src should be stripped because imageAllowDataUri defaults to false
    expect(html).not.toContain('data:image/png');
    ed2.destroy();
  });

  it('data URI src preserved in getHTML() when imageAllowDataUri:true', () => {
    const DATA_SRC = 'data:image/png;base64,abc123==';
    const target = document.createElement('div');
    document.body.appendChild(target);
    const ed2 = new OpenEditor(target, { imageAllowDataUri: true });
    const fig = createFigure(DATA_SRC, {}, { imageAllowDataUri: true }, document);
    expect(fig).not.toBeNull();
    ed2.getEditorElement().appendChild(fig);
    const html = ed2.getHTML();
    expect(html).toContain('data:image/png');
    ed2.destroy();
    target.remove();
  });
});

// ── Step 2: XSS — wrapInLink blocks unsafe URLs ───────────────────────────────

describe('9.16 — wrapInLink URL safety', () => {
  it('blocks javascript: href', () => {
    const fig = createFigure('https://example.com/a.jpg', {}, {}, document);
    wrapInLink(fig, 'javascript:alert(1)');
    expect(fig.querySelector('a')).toBeNull();
  });

  it('blocks data: href', () => {
    const fig = createFigure('https://example.com/a.jpg', {}, {}, document);
    wrapInLink(fig, 'data:text/html,<script>alert(1)</script>');
    expect(fig.querySelector('a')).toBeNull();
  });

  it('blocks vbscript: href', () => {
    const fig = createFigure('https://example.com/a.jpg', {}, {}, document);
    wrapInLink(fig, 'vbscript:msgbox(1)');
    expect(fig.querySelector('a')).toBeNull();
  });

  it('allows https: href', () => {
    const fig = createFigure('https://example.com/a.jpg', {}, {}, document);
    wrapInLink(fig, 'https://safe.example.com');
    expect(fig.querySelector('a')).not.toBeNull();
    expect(fig.querySelector('a').href).toContain('safe.example.com');
  });
});

// ── Step 3: delete restores canonical floor ───────────────────────────────────

describe('9.11 — image delete restores canonical floor', () => {
  it('deleting last image leaves <p><br></p> floor', () => {
    const p = makePlugin();
    p.install(editor);
    const fig = createFigure('https://x.com/a.jpg', {}, {}, document);
    editor.getEditorElement().innerHTML = '';
    editor.getEditorElement().appendChild(fig);
    // Directly call _deleteSelected equivalent by selecting and deleting
    p._selection._selectFigure(fig);
    p._selection.onKeyDown({ key: 'Backspace', preventDefault: () => {} });
    const inner = editor.getEditorElement().innerHTML.replace(/\s/g, '');
    expect(inner).toBe('<p><br></p>');
    p.destroy();
  });
});

// ── image-H1: blocked src emits an error instead of silently no-op'ing ────────

describe('image-H1 — blocked image source is reported, not swallowed', () => {
  it('emits error with a data-URI hint when a data: src is blocked on default config', () => {
    const errors = [];
    editor.on('error', (e) => errors.push(e));
    const inserted = buildAndInsertFigure(
      editor,
      { src: 'data:image/png;base64,iVBORw0KGgo=', width: 10, height: 10 },
      {}, {}, document, 'plugin:image:drop'
    );
    expect(inserted).toBe(false);
    expect(errors.length).toBe(1);
    expect(errors[0].context).toBe('plugin:image:drop');
    expect(errors[0].error.message).toMatch(/blocked/i);
    expect(errors[0].error.message).toMatch(/imageUploadUrl|imageAllowDataUri/);
  });

  it('inserts silently (no error) when the data URI is allowed by config', () => {
    const errors = [];
    editor.on('error', (e) => errors.push(e));
    const inserted = buildAndInsertFigure(
      editor,
      { src: 'data:image/png;base64,iVBORw0KGgo=', width: 10, height: 10 },
      {}, { imageAllowDataUri: true }, document, 'plugin:image:drop'
    );
    expect(inserted).toBe(true);
    expect(errors.length).toBe(0);
    expect(editor.getEditorElement().querySelector('figure img')).not.toBeNull();
  });

  it('emits a generic (no data-URI hint) error for a javascript: src', () => {
    const errors = [];
    editor.on('error', (e) => errors.push(e));
    const inserted = buildAndInsertFigure(
      editor, { src: 'javascript:alert(1)', width: 0, height: 0 },
      {}, {}, document, 'plugin:image:paste'
    );
    expect(inserted).toBe(false);
    expect(errors.length).toBe(1);
    expect(errors[0].error.message).not.toMatch(/imageAllowDataUri/);
  });
});

// ── Step 4: paste/drop 10MB guard ─────────────────────────────────────────────

describe('9.5 / 9.6 — 10MB size guard on paste and drop', () => {
  it('paste of oversized file emits error and does not call processImageFile', async () => {
    const { installPaste } = await import('../src/plugins/image/image-paste.js');
    installPaste(editor);

    const errors = [];
    editor.on('error', (e) => errors.push(e));

    const bigFile = { size: 11 * 1024 * 1024, type: 'image/png', name: 'big.png' };
    const fakeItem = { kind: 'file', type: 'image/png', getAsFile: () => bigFile };
    const fakeEvent = {
      clipboardData: { items: [fakeItem], types: ['Files'] },
      preventDefault: () => {},
      defaultPrevented: false,
    };
    editor.emit('paste', fakeEvent);
    await new Promise((r) => setTimeout(r, 50));
    expect(errors.length).toBe(1);
    expect(errors[0].context).toBe('plugin:image:paste:size');
  });

  it('drop of oversized file emits error', async () => {
    const { installDragDrop } = await import('../src/plugins/image/image-drag-drop.js');
    installDragDrop(editor);

    const errors = [];
    editor.on('error', (e) => errors.push(e));

    const bigFile = { size: 15 * 1024 * 1024, type: 'image/png', name: 'huge.png' };
    const fakeEvent = {
      dataTransfer: {
        files: [bigFile],
        items: [{ kind: 'file', type: 'image/png' }],
        types: ['Files'],
      },
      preventDefault: () => {},
    };
    editor.emit('drop', fakeEvent);
    await new Promise((r) => setTimeout(r, 50));
    expect(errors.length).toBe(1);
    expect(errors[0].context).toBe('plugin:image:drop:size');
  });
});
