/**
 * image-drag-drop.js — Drag-and-drop image files into the editor (9.5).
 *
 * Wired inside the plugin's install() via editor.on() so PluginManager
 * auto-removes all listeners on uninstall.
 *
 * Handles: dragenter, dragover, dragleave, drop.
 * Only intercepts when the data transfer contains image files.
 */
import { buildAndInsertFigure } from './image-dom.js';
import { processImageFile } from './image-upload.js';

const DRAGOVER_CLASS = 'oe-editor--dragover';

/**
 * Returns true if the dataTransfer contains at least one image file.
 */
function hasImageFiles(dataTransfer) {
  if (!dataTransfer) return false;
  // types includes 'Files' when files are being dragged
  if (dataTransfer.types && Array.from(dataTransfer.types).includes('Files')) return true;
  // items check for more specificity when available
  if (dataTransfer.items) {
    return Array.from(dataTransfer.items).some(
      (item) => item.kind === 'file' && item.type.startsWith('image/')
    );
  }
  return false;
}

/**
 * Register drag-and-drop handlers on the editor element.
 * Called from image-plugin.js install() — all listeners go through editor.on()
 * so they are auto-removed on uninstall by PluginManager.
 */
export function installDragDrop(editor) {
  const edEl = editor.getEditorElement();
  if (!edEl) return;

  // dragenter — show drop zone highlight
  editor.on('dragenter', (e) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    edEl.classList.add(DRAGOVER_CLASS);
  });

  // dragover — must call preventDefault to allow drop
  editor.on('dragover', (e) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    edEl.classList.add(DRAGOVER_CLASS);
  });

  // dragleave — remove highlight only when leaving the editor entirely
  editor.on('dragleave', (e) => {
    // relatedTarget check prevents flickering on child elements
    if (edEl.contains(e.relatedTarget)) return;
    edEl.classList.remove(DRAGOVER_CLASS);
  });

  // drop — process image files
  editor.on('drop', (e) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    edEl.classList.remove(DRAGOVER_CLASS);

    const files = Array.from(e.dataTransfer.files || []).filter(
      (f) => f.type.startsWith('image/')
    );
    if (!files.length) return;

    // Insert every dropped image, in drop order (sequential so the insert
    // position — which depends on cursor state — stays deterministic).
    handleDroppedFiles(editor, files);
  });
}

async function handleDroppedFiles(editor, files) {
  for (const file of files) {
    await handleDroppedFile(editor, file);
  }
}

async function handleDroppedFile(editor, file) {
  const config = editor._config || {};
  const doc    = editor._wrapper && editor._wrapper.ownerDocument || document;

  if (file.size > 10 * 1024 * 1024) {
    editor.emit('error', {
      error: new Error(`Dropped image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`),
      context: 'plugin:image:drop:size',
    });
    return;
  }

  try {
    const result = await processImageFile(file, config, null, null, doc);
    if (!result) return;
    buildAndInsertFigure(editor, result, {
      width:  result.width  || undefined,
      height: result.height || undefined,
    }, config, doc, 'plugin:image:drop');
  } catch (err) {
    editor.emit('error', { error: err, context: 'plugin:image:drop' });
  }
}
