/**
 * image-require-alt-quickinsert.test.js — imageRequireAlt must ALSO be enforced
 * on the quick-insert paths (paste, drag-drop), which have no metadata step and
 * previously inserted alt-less images, silently defeating the requirement.
 * (The dialog path is covered in image-dialog.test.js.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestEditor } from '../src/testing/test-harness.js';

// Stub the image-file resolver so no network/canvas is needed — it always
// resolves to a usable http src that createFigure will accept.
vi.mock('../src/plugins/image/image-upload.js', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    processImageFile: vi.fn(async () => ({ src: 'https://cdn.example.com/x.png', width: 100, height: 80 })),
    fileSizeError: () => null,
  };
});

let editor;
beforeEach(() => { editor = createTestEditor({ imageRequireAlt: true }); });
afterEach(() => {
  if (!editor.isDestroyed()) editor.destroy();
  if (editor._target && editor._target.parentNode) editor._target.remove();
});

/** Make modal.open resolve as if the user typed `alt` then clicked Insert, or
 *  cancelled (alt === null). Fills the input the prompt built into config.body. */
function mockAltModal(altValue) {
  editor.ui.modal.open = vi.fn(async (config) => {
    const input = config.body.querySelector('#oe-img-alt-prompt-input');
    if (altValue === null) return null;           // cancel
    if (input) input.value = altValue;
    return 'insert';
  });
}

const figures = () => editor.getEditorElement().querySelectorAll('figure img');
const fakeImageFile = () => ({ type: 'image/png', name: 'p.png', size: 1234 });

describe('imageRequireAlt — quick-insert enforcement (paste)', () => {
  it('prompts for alt on paste and inserts with the entered alt', async () => {
    const { installPaste } = await import('../src/plugins/image/image-paste.js');
    installPaste(editor);
    mockAltModal('A pasted screenshot');
    const ev = {
      preventDefault: vi.fn(),
      clipboardData: { items: [{ type: 'image/png', getAsFile: fakeImageFile }] },
    };
    editor.emit('paste', ev);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(editor.ui.modal.open).toHaveBeenCalled();
    const imgs = figures();
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute('alt')).toBe('A pasted screenshot');
  });

  it('cancelling the alt prompt SKIPS the paste insert (no alt-less image)', async () => {
    const { installPaste } = await import('../src/plugins/image/image-paste.js');
    installPaste(editor);
    mockAltModal(null); // user cancels
    const ev = {
      preventDefault: vi.fn(),
      clipboardData: { items: [{ type: 'image/png', getAsFile: fakeImageFile }] },
    };
    editor.emit('paste', ev);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(figures().length).toBe(0); // nothing inserted
  });
});

describe('imageRequireAlt — quick-insert enforcement (drag-drop)', () => {
  it('prompts for alt on drop and inserts with the entered alt', async () => {
    const { installDragDrop } = await import('../src/plugins/image/image-drag-drop.js');
    installDragDrop(editor);
    mockAltModal('A dropped photo');
    const ev = {
      preventDefault: vi.fn(),
      clientX: 0, clientY: 0,
      dataTransfer: { types: ['Files'], files: [fakeImageFile()] },
    };
    editor.emit('drop', ev);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(editor.ui.modal.open).toHaveBeenCalled();
    const imgs = figures();
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute('alt')).toBe('A dropped photo');
  });
});
