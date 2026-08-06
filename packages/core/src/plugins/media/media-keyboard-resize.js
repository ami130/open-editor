/**
 * media-keyboard-resize.js — arrow-key resize for a selected video embed.
 * Mirrors image-keyboard-resize.js's keyboardResizeImage, adapted for the fact
 * that the embed FIGURE itself is the resizable box (no inner <img>).
 */

// Same floor as media-resize.js's drag path — smaller and a provider's own
// controls (YouTube/Vimeo chrome) become unusable.
const MIN_WIDTH = 160;
const MIN_HEIGHT = 90;
const MAX_WIDTH = 8000;
const MAX_HEIGHT = 8000;
const clampW = (w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w));
const clampH = (h) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h));

/**
 * Arrow-key resize: Right/Left change width, Up/Down change height; aspect
 * ratio is preserved by deriving the other axis. Shift = 10px step, else 1px.
 */
export function keyboardResizeMedia(editor, figure, e) {
  if (!figure) return false;
  const rect = figure.getBoundingClientRect();
  let w = Math.round(rect.width) || parseInt(figure.style.width, 10) || 0;
  let h = Math.round(rect.height) || parseInt(figure.style.height, 10) || 0;
  if (!w || !h) return false;
  const ratio = w / h;
  const step = e.shiftKey ? 10 : 1;

  if (e.key === 'ArrowRight')      w = clampW(w + step);
  else if (e.key === 'ArrowLeft')  w = clampW(w - step);
  else if (e.key === 'ArrowDown')  h = clampH(h + step);
  else if (e.key === 'ArrowUp')    h = clampH(h - step);
  else return false;

  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') h = clampH(Math.round(w / ratio));
  else w = clampW(Math.round(h * ratio));

  if (editor && editor.history && editor.history.takeSnapshot) editor.history.takeSnapshot();
  figure.style.aspectRatio = '';
  figure.style.width  = `${w}px`;
  figure.style.height = `${h}px`;
  if (editor) {
    editor.emit('mediaSelected', { figure }); // reposition overlay + action bar
    if (editor._onChangeFn) editor._onChangeFn();
    editor.emit('afterCommand', { command: 'keyboardResizeMedia', args: [],
      announce: `Video resized to ${w} by ${h} pixels` });
  }
  return true;
}
