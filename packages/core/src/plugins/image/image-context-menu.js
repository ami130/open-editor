/**
 * image-context-menu.js — the right-click / keyboard actions menu for a selected
 * image island (align, properties, link, delete). Extracted from
 * image-selection.js to keep it under the 300-line limit. Each function takes the
 * ImageSelectionManager (`mgr`) so it can reuse its select/emit/link/delete paths.
 */
import { applyAlignment } from './image-dom.js';

/** Build the menu item list bound to the given manager + figure. */
export function buildImageMenuItems(mgr, fig) {
  return [
    { label: 'Float left',   action: () => { applyAlignment(fig, 'left');   mgr._emit('Aligned left'); } },
    { label: 'Center',       action: () => { applyAlignment(fig, 'center'); mgr._emit('Centered'); } },
    { label: 'Float right',  action: () => { applyAlignment(fig, 'right');  mgr._emit('Aligned right'); } },
    { label: 'Inline',       action: () => { applyAlignment(fig, 'inline'); mgr._emit('Inline'); } },
    { separator: true },
    { label: 'Image properties…', action: () => {
      if (typeof mgr.onEditProps === 'function') mgr.onEditProps(fig);
    } },
    { label: 'Add / edit link…', action: () => mgr._promptLink(fig) },
    { separator: true },
    { label: 'Delete image',  action: () => mgr.deleteFigure(fig) },
  ];
}

/** Mouse contextmenu: select the right-clicked figure and open the menu at the cursor. */
export function handleImageContextMenu(mgr, e) {
  const fig = e.target && e.target.closest ? e.target.closest('[data-oe-island="image"]') : null;
  if (!fig) return;
  e.preventDefault();
  mgr._selectFigure(fig);
  const ed = mgr._editor;
  if (!ed || !ed.ui || !ed.ui.contextMenu) return;
  const wRect = ed._wrapper.getBoundingClientRect();
  ed.ui.contextMenu.show(e.clientX - wRect.left, e.clientY - wRect.top, buildImageMenuItems(mgr, fig));
}

/**
 * A11Y: open the menu for the currently-selected figure, anchored at its top-left,
 * for keyboard invocation (ContextMenu / Shift+F10). Returns true if it opened.
 */
export function openImageMenuForSelected(mgr) {
  const fig = mgr._selectedFigure;
  const ed = mgr._editor;
  if (!fig || !ed || !ed.ui || !ed.ui.contextMenu || !ed._wrapper) return false;
  try {
    const fRect = fig.getBoundingClientRect();
    const wRect = ed._wrapper.getBoundingClientRect();
    ed.ui.contextMenu.show(fRect.left - wRect.left + 8, fRect.top - wRect.top + 8,
      buildImageMenuItems(mgr, fig));
    return true;
  } catch { return false; }
}
