/**
 * createTestEditor — minimal editor instance for plugin unit tests (8.12).
 *
 * Mounts OpenEditor with toolbar, statusBar, inlineToolbar, and
 * blockquoteToolbar all disabled so tests run in jsdom without a DOM rendering
 * environment. Passed config is merged on top of these safe defaults.
 *
 * Usage (Vitest + jsdom):
 *   import { createTestEditor } from '../src/testing/test-harness.js';
 *   const editor = createTestEditor();
 *   // ... test plugin behaviour ...
 *   editor.destroy();
 *   target.remove();
 */
import { OpenEditor } from '../editor.js';

export function createTestEditor(config = {}) {
  const target = (typeof document !== 'undefined')
    ? document.createElement('div')
    : null;
  if (!target) throw new Error('createTestEditor requires a DOM environment (jsdom).');
  document.body.appendChild(target);

  const editor = new OpenEditor(target, {
    toolbar:           false,
    statusBar:         false,
    inlineToolbar:     false,
    blockquoteToolbar: false,
    debug:             false,
    ...config,
  });

  // Convenience: attach target to editor so callers can do editor._target.remove()
  editor._target = target;
  return editor;
}
