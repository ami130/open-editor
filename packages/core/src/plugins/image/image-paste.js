/**
 * image-paste.js — Paste image from clipboard (9.6).
 *
 * Intercepts the 'paste' event emitted by the editor's core _onPaste handler.
 * When the clipboard contains an image/*, calls e.preventDefault() to stop
 * the core HTML paste path, then processes the file via processImageFile().
 *
 * The core _onPaste guard: `if (e.defaultPrevented) return;` ensures our
 * preventDefault() works correctly with no changes to core code.
 */
import { buildAndInsertFigure } from './image-dom.js';
import { processImageFile } from './image-upload.js';

/**
 * Register the paste handler on the editor.
 * Called from image-plugin.js install() via editor.on() so PluginManager
 * auto-cleans it on uninstall.
 */
export function installPaste(editor) {
  editor.on('paste', (e) => {
    if (!e.clipboardData) return;

    const items = Array.from(e.clipboardData.items || []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    if (!imageItem) return; // no image — let core paste handle text/html

    // Claim the paste event so core HTML paste path exits immediately
    e.preventDefault();

    const file = imageItem.getAsFile && imageItem.getAsFile();
    if (!file) {
      editor.emit('error', {
        error: new Error('Pasted image could not be read from the clipboard.'),
        context: 'plugin:image:paste:nofile',
      });
      return;
    }

    handlePastedFile(editor, file);
  });
}

async function handlePastedFile(editor, file) {
  const config = editor._config || {};
  const doc    = editor._wrapper && editor._wrapper.ownerDocument || document;

  if (file.size > 10 * 1024 * 1024) {
    editor.emit('error', {
      error: new Error(`Pasted image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`),
      context: 'plugin:image:paste:size',
    });
    return;
  }

  try {
    const result = await processImageFile(file, config, null, null, doc);
    if (!result) return;
    buildAndInsertFigure(editor, result, {
      width:  result.width  || undefined,
      height: result.height || undefined,
    }, config, doc, 'plugin:image:paste');
  } catch (err) {
    editor.emit('error', { error: err, context: 'plugin:image:paste' });
  }
}
