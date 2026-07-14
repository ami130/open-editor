/**
 * Phase 9 — image-dialog.js unit tests (9.1, 9.2, 9.10, 9.15).
 *
 * Tests the DOM structure produced by openImageDialog() and validates
 * that URL sanitization is applied before resolving.
 * The modal is mocked so no actual Phase 6 modal rendering is needed.
 *
 * Architecture note: buttons are passed to modal.open() as a `buttons` array
 * (not rendered inside the body node). The mock captures both body and buttons.
 * Validation runs inside the async openImageDialog() loop after modal.open() resolves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';

let editor;

// Helper: create a modal mock that resolves with a specific value on the next call.
function mockModalResolveWith(value) {
  editor.ui.modal._capturedBody    = null;
  editor.ui.modal._capturedButtons = null;
  editor.ui.modal.open = vi.fn((config) => {
    editor.ui.modal._capturedBody    = config.body;
    editor.ui.modal._capturedButtons = config.buttons;
    return Promise.resolve(value);
  });
  editor.ui.modal.close = vi.fn();
}

beforeEach(() => {
  editor = createTestEditor();
  // Default: cancel (null) so the dialog returns without inserting
  if (editor.ui && editor.ui.modal) mockModalResolveWith(null);
});

afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

describe('9.1 — openImageDialog builds correct DOM', () => {
  it('dialog root has class oe-img-dialog', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor); // don't await — just inspect captured body
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    expect(body).not.toBeNull();
    expect(body.classList.contains('oe-img-dialog')).toBe(true);
  });

  it('contains URL and Upload tabs', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    const tabs = body.querySelectorAll('.oe-img-dialog__tab');
    expect(tabs.length).toBe(2);
    const labels = Array.from(tabs).map((t) => t.textContent);
    expect(labels.some((l) => l.includes('URL'))).toBe(true);
    expect(labels.some((l) => l.includes('Upload'))).toBe(true);
  });

  it('9.10 — has an alt text input', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    const altInput = body.querySelector('#oe-img-alt');
    expect(altInput).not.toBeNull();
    expect(altInput.tagName.toLowerCase()).toBe('input');
  });

  it('9.15 — has a title input', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    const titleInput = body.querySelector('#oe-img-title');
    expect(titleInput).not.toBeNull();
  });

  it('has alignment icon buttons for none/left/center/right/inline', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    const alignBtns = body.querySelectorAll('.oe-img-dialog__align-btn');
    // 5 buttons: none, left, center, right, inline
    expect(alignBtns.length).toBeGreaterThanOrEqual(4);
  });

  it('passes Insert and Cancel to modal buttons array', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const buttons = editor.ui.modal._capturedButtons;
    expect(Array.isArray(buttons)).toBe(true);
    const labels = buttons.map((b) => b.label);
    expect(labels.some((l) => l.toLowerCase().includes('insert'))).toBe(true);
    expect(labels.some((l) => l.toLowerCase().includes('cancel'))).toBe(true);
  });

  it('has a file input accepting image/*', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    const fileInput = body.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    expect(fileInput.accept).toBe('image/*');
  });

  it('9.17 — has an abort upload button', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    const abortBtn = body.querySelector('.oe-img-dialog__abort');
    expect(abortBtn).not.toBeNull();
    expect(abortBtn.textContent.trim().toLowerCase()).toContain('cancel');
  });
});

describe('URL validation in dialog', () => {
  it('Insert action with empty URL shows error and re-opens modal', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');

    // First call returns 'insert' (user clicked Insert with empty URL),
    // second call returns null (user cancels after seeing error).
    let callCount = 0;
    editor.ui.modal.open = vi.fn((config) => {
      editor.ui.modal._capturedBody = config.body;
      callCount++;
      return Promise.resolve(callCount === 1 ? 'insert' : null);
    });

    const result = await openImageDialog(editor);

    // The first 'insert' with empty URL should have shown an error and looped;
    // the second null resolves as cancel.
    expect(result).toBeNull();
    expect(callCount).toBe(2);
    // The error element should be populated after the failed insert attempt
    const errEl = editor.ui.modal._capturedBody.querySelector('.oe-img-dialog__error');
    expect(errEl.textContent).not.toBe('');
  });

  it('Cancel (null from modal) resolves the dialog with null', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    // mockModalResolveWith(null) already set in beforeEach
    const result = await openImageDialog(editor);
    expect(result).toBeNull();
  });

  it('Insert with valid URL resolves with src and metadata', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');

    editor.ui.modal.open = vi.fn((config) => {
      editor.ui.modal._capturedBody = config.body;
      // Set URL field value before resolving
      const inUrl = config.body.querySelector('#oe-img-url');
      if (inUrl) inUrl.value = 'https://example.com/photo.jpg';
      return Promise.resolve('insert');
    });

    const result = await openImageDialog(editor);
    expect(result).not.toBeNull();
    expect(result.src).toBe('https://example.com/photo.jpg');
  });
});
