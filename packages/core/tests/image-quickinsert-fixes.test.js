/**
 * image-quickinsert-fixes.test.js — drop/paste robustness fixes:
 *   IMG5  failures surface via editor.ui.toast (not just emit('error'))
 *   IMG6  screenshot paste with no upload/dataUri configured → dead-end warning
 *   IMG7  drop is blocked in readonly mode
 *   IMG9  paste honors config.imageMaxFileSize (not hardcoded 10 MB)
 *   IMG10 multi-image paste inserts ALL images
 *   IMG12 protocol-relative //host image src is blocked
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { installPaste } from '../src/plugins/image/image-paste.js';
import { installDragDrop } from '../src/plugins/image/image-drag-drop.js';
import { sanitizeSrc } from '../src/plugins/image/image-url.js';
import { isValidImageUrl } from '../src/plugins/image/image-dialog-parts.js';

// Mock the upload so a mock File resolves to a fake src (jsdom can't FileReader
// a non-Blob). The size guard runs BEFORE processImageFile, so IMG9 still tests it.
vi.mock('../src/plugins/image/image-upload.js', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    processImageFile: vi.fn(async () => ({ src: 'https://cdn.example.com/x.png', width: 100, height: 80 })),
  };
});

let editor;
function toastSpy() {
  const err = vi.fn();
  editor.ui = editor.ui || {};
  editor.ui.toast = { error: err, success: vi.fn(), progress: () => ({ update(){}, success(){}, error(){}, close(){} }), destroy(){} };
  return err;
}
afterEach(() => { if (editor && !editor.isDestroyed()) editor.destroy(); });

describe('IMG12 — protocol-relative //host image src blocked', () => {
  it('sanitizeSrc rejects //evil.com/x.png but keeps /root.png and https://', () => {
    expect(sanitizeSrc('//evil.com/x.png')).toBeNull();
    expect(sanitizeSrc('/root/pic.png')).toBe('/root/pic.png');
    expect(sanitizeSrc('https://ok.com/a.png')).toBe('https://ok.com/a.png');
  });
  it('isValidImageUrl rejects //host', () => {
    expect(isValidImageUrl('//evil.com/x.png')).toBe(false);
    expect(isValidImageUrl('/root.png')).toBe(true);
    expect(isValidImageUrl('https://ok.com/a.png')).toBe(true);
  });
});

describe('IMG6 — screenshot paste dead-end warning', () => {
  it('no upload + no dataUri → toast warning, no insert', async () => {
    editor = createTestEditor({}); // neither imageUploadUrl nor imageAllowDataUri
    const err = toastSpy();
    installPaste(editor);
    editor.emit('paste', {
      preventDefault: vi.fn(),
      clipboardData: { items: [{ type: 'image/png', getAsFile: () => ({ type: 'image/png', size: 10 }) }] },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(err).toHaveBeenCalled();
    expect(editor.getEditorElement().querySelectorAll('figure').length).toBe(0);
  });
});

describe('IMG9 — paste honors imageMaxFileSize', () => {
  it('a file over the CONFIGURED (not 10MB) limit is rejected via toast', async () => {
    editor = createTestEditor({ imageAllowDataUri: true, imageMaxFileSize: 1024 }); // 1 KB
    const err = toastSpy();
    installPaste(editor);
    editor.emit('paste', {
      preventDefault: vi.fn(),
      clipboardData: { items: [{ type: 'image/png', getAsFile: () => ({ type: 'image/png', size: 5000 }) }] },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(err).toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/too large/i);
  });
});

describe('IMG10 — multi-image paste inserts ALL images', () => {
  it('two clipboard images both insert', async () => {
    editor = createTestEditor({ imageAllowDataUri: true });
    installPaste(editor);
    const mk = () => ({ type: 'image/png', size: 20, getAsFile: () => ({ type: 'image/png', size: 20 }) });
    editor.emit('paste', {
      preventDefault: vi.fn(),
      clipboardData: { items: [mk(), mk()] },
    });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(editor.getEditorElement().querySelectorAll('figure').length).toBe(2);
  });
});

describe('IMG7 — drop blocked in readonly', () => {
  it('a dropped image in readonly mode is NOT inserted', async () => {
    editor = createTestEditor({ imageAllowDataUri: true });
    editor.setReadOnly(true);
    installDragDrop(editor);
    const prevent = vi.fn();
    editor.emit('drop', {
      preventDefault: prevent,
      dataTransfer: { types: ['Files'], files: [{ type: 'image/png', size: 20 }] },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(prevent).toHaveBeenCalled();  // still preventDefault (no browser navigation)
    expect(editor.getEditorElement().querySelectorAll('figure').length).toBe(0);
  });
});

describe('IMG5/IMG2a — non-image drop shows feedback', () => {
  it('dropping only non-image files warns via toast', async () => {
    editor = createTestEditor({ imageAllowDataUri: true });
    const err = toastSpy();
    installDragDrop(editor);
    editor.emit('drop', {
      preventDefault: vi.fn(),
      dataTransfer: { types: ['Files'], files: [{ type: 'application/pdf', size: 20 }] },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(err).toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toMatch(/only image/i);
  });
});
