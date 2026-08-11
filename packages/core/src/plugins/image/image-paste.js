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
import { processImageFile, fileSizeError } from './image-upload.js';
import { promptForAlt } from './image-alt-prompt.js';
import { imageError, imageProgress } from './image-feedback.js';

// A screenshot/clipboard image needs an upload server OR data-URI embedding.
// A custom handler (T12) counts as a configured upload path.
const uploadDeadEnd = (config) => !config.imageUploadUrl
  && typeof config.imageUploadHandler !== 'function'
  && !config.imageAllowDataUri;

/**
 * Register the paste handler on the editor.
 * Called from image-plugin.js install() via editor.on() so PluginManager
 * auto-cleans it on uninstall.
 */
export function installPaste(editor) {
  editor.on('paste', (e) => {
    if (!e.clipboardData) return;

    // IMG10: gather ALL image files on the clipboard (was: .find → first only).
    const items = Array.from(e.clipboardData.items || []);
    const imageFiles = items
      .filter((item) => item.type && item.type.startsWith('image/'))
      .map((item) => item.getAsFile && item.getAsFile())
      .filter(Boolean);
    if (!imageFiles.length) {
      // Only claim the event if the clipboard actually carried image items but we
      // couldn't read a file from any — otherwise let core paste handle text/html.
      const hadImageItem = items.some((it) => it.type && it.type.startsWith('image/'));
      if (hadImageItem) {
        e.preventDefault();
        imageError(editor, 'Pasted image could not be read from the clipboard.',
          'plugin:image:paste:nofile');
      }
      return;
    }

    // Claim the paste event so core HTML paste path exits immediately.
    e.preventDefault();
    handlePastedFiles(editor, imageFiles);
  });
}

async function handlePastedFiles(editor, files) {
  for (const file of files) await handlePastedFile(editor, file);
}

async function handlePastedFile(editor, file) {
  const config = editor._config || {};
  const doc    = editor._wrapper && editor._wrapper.ownerDocument || document;

  // IMG9: honor config.imageMaxFileSize (was hardcoded 10 MB, ignoring config).
  const sizeErr = fileSizeError(file, config);
  if (sizeErr) { imageError(editor, sizeErr, 'plugin:image:paste:size'); return; }

  // IMG6: a valid-but-unembeddable image (no upload server, no data-URI) is a
  // dead-end — warn instead of silently doing nothing. Checked AFTER size so the
  // more specific "too large" error wins for oversized files.
  if (uploadDeadEnd(config)) {
    imageError(editor,
      'Pasting an image needs image uploads or inline embedding to be enabled ' +
      '(imageUploadUrl, imageUploadHandler, or imageAllowDataUri). '
      + 'Use Insert Image → From URL instead.',
      'plugin:image:paste:deadend');
    return;
  }

  // IMG8: drop/paste have no dialog progress bar — show a sticky progress toast.
  // #9: an AbortController lets the toast's × cancel an in-flight upload.
  const uploading = !!config.imageUploadUrl || typeof config.imageUploadHandler === 'function';
  const ctrl = uploading && typeof AbortController !== 'undefined' ? new AbortController() : null;
  const prog = uploading
    ? imageProgress(editor, 'Uploading pasted image…', ctrl ? () => ctrl.abort() : null)
    : null;
  try {
    const result = await processImageFile(file, config,
      prog ? (pct) => prog.update(`Uploading pasted image… ${pct}%`) : null,
      ctrl ? ctrl.signal : null, doc);
    if (!result) { if (prog) prog.close(); return; }
    let alt;
    if (config.imageRequireAlt) {
      alt = await promptForAlt(editor);
      if (alt === null) { if (prog) prog.close(); return; } // cancelled
    }
    buildAndInsertFigure(editor, result, {
      width:  result.width  || undefined,
      height: result.height || undefined,
      ...(alt ? { alt } : {}),
    }, config, doc, 'plugin:image:paste');
    if (prog) prog.success('Image added');
  } catch (err) {
    if (prog) prog.close();
    imageError(editor, err && err.message ? err.message : 'Pasting the image failed.',
      'plugin:image:paste');
  }
}
