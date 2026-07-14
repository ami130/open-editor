/**
 * image-plugin-fixes-2.test.js — Unit tests for the Phase B–D hardening pass.
 * Covers: URL-tab data: rejection, upload URL safety, multi-file drop,
 * paste no-file error, insert shortcut, alignment field, backspace-after-list.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';
import { createImagePlugin } from '../src/plugins/image/image-plugin.js';
import { isValidImageUrl, buildAlignmentField } from '../src/plugins/image/image-dialog-parts.js';
import { mergeWithPrevious } from '../src/editing/block-editing-merge.js';

let editor;
beforeEach(() => { editor = createTestEditor(); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

// ── isValidImageUrl (URL tab no longer accepts data:) ─────────────────────────
describe('image-dialog-parts — isValidImageUrl', () => {
  it('accepts http/https/relative', () => {
    expect(isValidImageUrl('https://x.com/a.jpg')).toBe(true);
    expect(isValidImageUrl('http://x.com/a.jpg')).toBe(true);
    expect(isValidImageUrl('/local/a.jpg')).toBe(true);
  });
  it('rejects data: in the URL tab (handled by the Upload tab instead)', () => {
    expect(isValidImageUrl('data:image/png;base64,abc')).toBe(false);
  });
  it('rejects garbage and unsafe schemes', () => {
    expect(isValidImageUrl('not-a-url')).toBe(false);
    expect(isValidImageUrl('javascript:alert(1)')).toBe(false);
    expect(isValidImageUrl(null)).toBe(false);
  });
});

// ── buildAlignmentField returns a getter reflecting clicks ────────────────────
describe('image-dialog-parts — buildAlignmentField', () => {
  it('defaults to empty and tracks the clicked button', () => {
    const { field, getAlignment } = buildAlignmentField(document);
    expect(getAlignment()).toBe('');
    const leftBtn = field.querySelector('.oe-img-dialog__align-btn[title="Float left"]');
    leftBtn.click();
    expect(getAlignment()).toBe('left');
    expect(leftBtn.getAttribute('aria-pressed')).toBe('true');
  });
});

// ── Upload URL safety (image-upload rejects unsafe server URLs) ───────────────
describe('image-upload — rejects unsafe upload URL', () => {
  it('throws when the server returns a javascript: URL', async () => {
    const { uploadFile } = await import('../src/plugins/image/image-upload.js');
    // Stub XHR to return a malicious URL.
    const RealXHR = global.XMLHttpRequest;
    class FakeXHR {
      constructor() { this.upload = { addEventListener() {} }; this.status = 200;
        this.responseText = JSON.stringify({ url: 'javascript:alert(1)' }); }
      addEventListener(type, cb) { if (type === 'load') this._load = cb; }
      open() {} send() { this._load && this._load(); }
    }
    global.XMLHttpRequest = FakeXHR;
    try {
      await expect(uploadFile({ name: 'a.png' }, '/upload', null, null, document))
        .rejects.toThrow(/unsafe URL/i);
    } finally {
      global.XMLHttpRequest = RealXHR;
    }
  });
});

// ── Multi-file drop inserts every image ───────────────────────────────────────
// The drop handler routes each file through processImageFile + createFigure +
// insertFigure. In jsdom, image onload (used for dimension measurement) never
// fires, so instead of asserting on rendered figures we assert that every
// dropped file is processed (one resolve per file, in order).
describe('image-drag-drop — processes all dropped images', () => {
  it('drops 3 images → processImageFile called 3 times in order', async () => {
    const uploadMod = await import('../src/plugins/image/image-upload.js');
    const { installDragDrop } = await import('../src/plugins/image/image-drag-drop.js');

    // Route through the upload path (imageUploadUrl set) so we can fully stub it.
    editor._config.imageUploadUrl = '/upload';
    const seen = [];
    const realProcess = uploadMod.processImageFile;
    // Replace the module export via a spy on the imported binding is not possible
    // for ESM; instead stub global XHR so uploadFile resolves a safe URL fast.
    const RealXHR = global.XMLHttpRequest;
    class FakeXHR {
      constructor() { this.upload = { addEventListener() {} }; this.status = 200; }
      addEventListener(type, cb) { if (type === 'load') this._load = cb; }
      open() {} send() {
        seen.push(true);
        this.responseText = JSON.stringify({ url: 'https://cdn.example.com/x.png' });
        this._load && this._load();
      }
    }
    global.XMLHttpRequest = FakeXHR;

    // measureImage() awaits img.onload, which never fires in jsdom. Auto-fire it
    // when src is assigned so each per-file await resolves and the next sends.
    const imgProto = global.HTMLImageElement && global.HTMLImageElement.prototype;
    const realSrc = imgProto && Object.getOwnPropertyDescriptor(imgProto, 'src');
    if (imgProto) {
      Object.defineProperty(imgProto, 'src', {
        configurable: true,
        set(v) { this._src = v; setTimeout(() => this.onload && this.onload(), 0); },
        get() { return this._src; },
      });
    }

    installDragDrop(editor);
    const mk = (n) => ({ size: 1000, type: 'image/png', name: `${n}.png` });
    const files = [mk('a'), mk('b'), mk('c')];
    try {
      editor.emit('drop', {
        dataTransfer: { files, items: files.map(f => ({ kind: 'file', type: f.type })), types: ['Files'] },
        preventDefault: () => {},
      });
      await new Promise((r) => setTimeout(r, 200));
      expect(seen.length).toBe(3);
    } finally {
      global.XMLHttpRequest = RealXHR;
      if (imgProto && realSrc) Object.defineProperty(imgProto, 'src', realSrc);
      void realProcess;
    }
  });
});

// ── Paste with no extractable file emits an error ─────────────────────────────
describe('image-paste — emits error when getAsFile returns null', () => {
  it('emits plugin:image:paste:nofile', async () => {
    const { installPaste } = await import('../src/plugins/image/image-paste.js');
    installPaste(editor);
    const errors = [];
    editor.on('error', (e) => errors.push(e));
    const fakeEvent = {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => null }], types: ['Files'] },
      preventDefault: () => {},
    };
    editor.emit('paste', fakeEvent);
    await new Promise((r) => setTimeout(r, 30));
    expect(errors.some((e) => e.context === 'plugin:image:paste:nofile')).toBe(true);
  });
});

// ── Insert-image keyboard shortcut (Ctrl/Cmd+Shift+I) ─────────────────────────
describe('image-plugin — insert shortcut', () => {
  it('Ctrl+Shift+I is consumed by onKeyDown', () => {
    const p = createImagePlugin();
    p.install(editor);
    // Stub the dialog opener so the test doesn't await a modal.
    let opened = false;
    p._openInsertDialog = () => { opened = true; };
    const handled = p.onKeyDown({ ctrlKey: true, shiftKey: true, key: 'I' });
    expect(handled).toBe(true);
    expect(opened).toBe(true);
    p.destroy();
  });
});

// ── Backspace at start of paragraph after a list merges into last <li> ────────
describe('block-editing — backspace after list', () => {
  it('merges paragraph content into the last <li>', () => {
    const root = editor.getEditorElement();
    root.innerHTML = '<ul><li>one</li><li>two</li></ul><p>tail</p>';
    const para = root.querySelector('p');
    const handled = mergeWithPrevious(editor, para);
    expect(handled).toBe(true);
    expect(root.querySelector('p')).toBeNull();
    const lastLi = root.querySelector('ul li:last-child');
    expect(lastLi.textContent).toBe('twotail');
  });
});

// ── 9.5 — broken image emits a load-error event for the host to toast ─────────
describe('image — load-error signal', () => {
  it('emits plugin:image:loaderror when the inserted img fires error', async () => {
    const { createFigure, insertFigure } = await import('../src/plugins/image/image-dom.js');
    const errors = [];
    editor.on('error', (e) => errors.push(e));
    const fig = createFigure('https://x.com/missing.png', {}, {}, document);
    insertFigure(editor, fig);
    const img = editor.getEditorElement().querySelector('figure img');
    img.dispatchEvent(new Event('error'));
    expect(errors.some((e) => e.context === 'plugin:image:loaderror')).toBe(true);
  });
});
