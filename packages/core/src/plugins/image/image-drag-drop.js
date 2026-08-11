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
import { processImageFile, fileSizeError } from './image-upload.js';
import { promptForAlt } from './image-alt-prompt.js';
import { placeCaretFromPoint } from './image-dom.js';
import { imageError, imageProgress } from './image-feedback.js';
import { ImageDropIndicator } from './image-drop-indicator.js';

const DRAGOVER_CLASS = 'oe-editor--dragover';

const isReadonly = (editor) => !!(editor && editor._state && editor._state.isReadOnly);
// A custom handler (T12) counts as a configured upload path.
const uploadDeadEnd = (config) => !config.imageUploadUrl
  && typeof config.imageUploadHandler !== 'function'
  && !config.imageAllowDataUri;

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
  if (!edEl) return null;

  // IMG15: caret line showing where a dropped image will land. Returned to the
  // plugin so its destroy() removes the overlay element.
  const indicator = new ImageDropIndicator(editor);

  // dragenter — show drop zone highlight. IMG7: a readonly editor accepts nothing.
  editor.on('dragenter', (e) => {
    if (isReadonly(editor) || !hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    edEl.classList.add(DRAGOVER_CLASS);
  });

  // dragover — must call preventDefault to allow drop
  editor.on('dragover', (e) => {
    if (isReadonly(editor) || !hasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    edEl.classList.add(DRAGOVER_CLASS);
    // IMG15: live drop-point caret line.
    if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
      indicator.update(e.clientX, e.clientY);
    }
  });

  // dragleave — remove highlight only when leaving the editor entirely
  editor.on('dragleave', (e) => {
    // relatedTarget check prevents flickering on child elements
    if (edEl.contains(e.relatedTarget)) return;
    edEl.classList.remove(DRAGOVER_CLASS);
    indicator.hide();
  });

  // drop — process image files
  editor.on('drop', (e) => {
    if (!hasImageFiles(e.dataTransfer)) return;
    indicator.hide();
    // IMG7: never insert into a readonly editor. preventDefault so the browser
    // doesn't navigate to / open the dropped file, then bail silently.
    if (isReadonly(editor)) { e.preventDefault(); edEl.classList.remove(DRAGOVER_CLASS); return; }
    e.preventDefault();
    edEl.classList.remove(DRAGOVER_CLASS);

    const files = Array.from(e.dataTransfer.files || []).filter(
      (f) => f.type.startsWith('image/')
    );
    if (!files.length) {
      // IMG2a: the editor lit up "drop here" (Files present) but nothing was an
      // image — tell the user instead of silently no-op-ing on a PDF/folder drop.
      imageError(editor, 'Only image files can be dropped here.', 'plugin:image:drop:notimage');
      return;
    }

    // #1 fix: move the caret to WHERE the image was dropped, so it lands there
    // instead of at the stale text selection. If the point isn't in the
    // editable (or the API is unavailable), this is a no-op and we fall back to
    // the current selection.
    if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
      placeCaretFromPoint(editor, e.clientX, e.clientY);
    }

    // Insert every dropped image, in drop order (sequential so the insert
    // position — which depends on cursor state — stays deterministic).
    handleDroppedFiles(editor, files);
  });

  return indicator;   // IMG15 — caller destroys it on plugin uninstall
}

async function handleDroppedFiles(editor, files) {
  for (const file of files) {
    await handleDroppedFile(editor, file);
  }
}

async function handleDroppedFile(editor, file) {
  const config = editor._config || {};
  const doc    = editor._wrapper && editor._wrapper.ownerDocument || document;

  const sizeErr = fileSizeError(file, config);
  if (sizeErr) { imageError(editor, sizeErr, 'plugin:image:drop:size'); return; }  // IMG5

  // IMG6: unembeddable (no upload server / no data-URI) → warn. After size so the
  // "too large" error wins for oversized files.
  if (uploadDeadEnd(config)) {
    imageError(editor,
      'Dropping an image needs image uploads or inline embedding to be enabled ' +
      '(imageUploadUrl, imageUploadHandler, or imageAllowDataUri).', 'plugin:image:drop:deadend');
    return;
  }

  // IMG8: show a sticky progress toast while an upload is in flight (no dialog here).
  // #9: an AbortController lets the toast's × cancel an in-flight upload.
  const uploading = !!config.imageUploadUrl || typeof config.imageUploadHandler === 'function';
  const ctrl = uploading && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const prog = uploading
    ? imageProgress(editor, 'Uploading image…', ctrl ? () => ctrl.abort() : null)
    : null;
  try {
    const result = await processImageFile(file, config,
      prog ? (pct) => prog.update(`Uploading image… ${pct}%`) : null,
      ctrl ? ctrl.signal : null, doc);
    if (!result) { if (prog) prog.close(); return; }
    // imageRequireAlt: drag-drop has no metadata step, so prompt for alt first.
    let alt;
    if (config.imageRequireAlt) {
      alt = await promptForAlt(editor);
      if (alt === null) { if (prog) prog.close(); return; } // cancelled
    }
    buildAndInsertFigure(editor, result, {
      width:  result.width  || undefined,
      height: result.height || undefined,
      ...(alt ? { alt } : {}),
    }, config, doc, 'plugin:image:drop');
    if (prog) prog.success('Image added');
  } catch (err) {
    if (prog) prog.close();
    imageError(editor, err && err.message ? err.message : 'Dropping the image failed.',
      'plugin:image:drop');   // IMG5
  }
}
