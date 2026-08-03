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

  // #4 (2026-07-16): with no upload server AND data URIs blocked, switching to
  // the Upload tab warns up front rather than letting the user hit a silent
  // dead-end at insert.
  it('warns on the Upload tab when file upload is not configured', async () => {
    // editor has no imageUploadUrl and imageAllowDataUri is false by default
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    body.querySelector('#oe-img-tab-file').click();       // switch to Upload File
    const err = body.querySelector('.oe-img-dialog__error');
    expect(err.textContent.toLowerCase()).toContain('not configured');
    expect(err.classList.contains('oe-img-dialog__panel--hidden')).toBe(false);
  });

  it('does NOT warn on the Upload tab when imageAllowDataUri is enabled', async () => {
    editor._config.imageAllowDataUri = true;
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    body.querySelector('#oe-img-tab-file').click();
    const err = body.querySelector('.oe-img-dialog__error');
    expect(err.textContent).toBe('');
  });

  // #9: the dropzone hint reflects a custom imageMaxFileSize.
  it('dropzone hint shows the configured max file size', async () => {
    editor._config.imageMaxFileSize = 3 * 1024 * 1024; // 3 MB
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    const hint = body.querySelector('.oe-img-dialog__dz-hint');
    expect(hint.textContent).toContain('3.0 MB');
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

describe('drop zone — whole box opens the file picker', () => {
  it('clicking anywhere in the drop zone (not just "browse") triggers the file input', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    const dropZone = body.querySelector('.oe-img-dialog__dropzone');
    const fileInput = body.querySelector('#oe-img-file');
    expect(dropZone).toBeTruthy();
    let clicked = 0;
    fileInput.addEventListener('click', () => { clicked++; });
    // Click the drop zone background (e.g. its icon/hint area), NOT the label.
    const hint = dropZone.querySelector('.oe-img-dialog__dz-hint') || dropZone;
    hint.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toBe(1); // exactly once — the file picker opened
  });

  it('does NOT double-fire when the "browse" label itself is clicked', async () => {
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    const dropZone = body.querySelector('.oe-img-dialog__dropzone');
    const fileInput = body.querySelector('#oe-img-file');
    let clicked = 0;
    fileInput.addEventListener('click', () => { clicked++; });
    // Clicking the "browse" label natively activates the file input ONCE. The
    // dropzone's own click handler must SKIP the label (chooseLbl.contains) so it
    // doesn't add a second click → the picker opens exactly once, not twice.
    const label = dropZone.querySelector('.oe-img-dialog__choose');
    label.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicked).toBe(1); // exactly once — no double-fire from the dropzone handler
  });
});

describe('imageRequireAlt (accessibility)', () => {
  it('with imageRequireAlt, a valid URL but EMPTY alt is blocked and the modal re-opens', async () => {
    editor.destroy();
    editor = createTestEditor({ imageRequireAlt: true });
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');

    let callCount = 0;
    editor.ui.modal.open = vi.fn((config) => {
      editor.ui.modal._capturedBody = config.body;
      const inUrl = config.body.querySelector('#oe-img-url');
      if (inUrl) inUrl.value = 'https://example.com/photo.jpg'; // valid src, but alt left empty
      callCount++;
      return Promise.resolve(callCount === 1 ? 'insert' : null); // cancel on the re-open
    });

    const result = await openImageDialog(editor);
    expect(result).toBeNull();       // blocked — not inserted
    expect(callCount).toBe(2);       // looped: shown error + re-opened
    const errEl = editor.ui.modal._capturedBody.querySelector('.oe-img-dialog__error');
    expect(errEl.textContent.toLowerCase()).toContain('alt text');
  });

  it('with imageRequireAlt, a valid URL WITH alt inserts normally', async () => {
    editor.destroy();
    editor = createTestEditor({ imageRequireAlt: true });
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');

    editor.ui.modal.open = vi.fn((config) => {
      editor.ui.modal._capturedBody = config.body;
      config.body.querySelector('#oe-img-url').value = 'https://example.com/p.jpg';
      config.body.querySelector('#oe-img-alt').value = 'A described photo';
      return Promise.resolve('insert');
    });

    const result = await openImageDialog(editor);
    expect(result).not.toBeNull();
    expect(result.alt).toBe('A described photo');
  });

  it('the alt field is marked required (aria-required + "*") when imageRequireAlt is on', async () => {
    editor.destroy();
    editor = createTestEditor({ imageRequireAlt: true });
    mockModalResolveWith(null); // capture the body without a real modal render
    const { openImageDialog } = await import('../src/plugins/image/image-dialog.js');
    openImageDialog(editor);
    await new Promise((r) => setTimeout(r, 0));
    const body = editor.ui.modal._capturedBody;
    expect(body.querySelector('#oe-img-alt').getAttribute('aria-required')).toBe('true');
    expect(body.querySelector('label[for="oe-img-alt"]').textContent).toContain('*');
  });
});
