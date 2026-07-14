/**
 * keydown-guards.js — keydown-path guards extracted from editor-events.js
 * (300-line limit): the 2.13 maxLength additive-key blocker and the
 * 17.5.6-found overtype-selection collapse (Firefox document-shred fix).
 */
import { handleMultiBlockDelete, ensureEditorFloor } from './block-editing.js';

// Non-additive keys: navigation, modifiers, control keys, function keys.
// PageUp/PageDown/Insert also listed (H-2 fix: complete non-additive set).
const NON_ADDITIVE = new Set(['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight',
  'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab',
  'Escape', 'Enter', 'Shift', 'Control', 'Alt', 'AltGraph',
  'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'Pause',
  'PageUp', 'PageDown', 'Insert', 'PrintScreen',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
  'F7', 'F8', 'F9', 'F10', 'F11', 'F12']);

/**
 * 2.13 — block additive keystrokes at maxLength. Returns true when the event
 * was consumed (caller must return immediately).
 */
export function guardMaxLength(editor, e) {
  if (editor._isComposing || editor._config.maxLength == null) return false;
  const additive = !NON_ADDITIVE.has(e.key);
  const isShortcut = e.ctrlKey || e.metaKey || e.altKey;
  const selInfo = editor.selection && editor.selection.get();
  const selCollapsed = !selInfo || selInfo.collapsed !== false;
  if (additive && !isShortcut && selCollapsed
      && editor._rawTextLength() >= editor._config.maxLength) {
    e.preventDefault();
    editor.emit('maxLengthExceeded', {
      current: editor._rawTextLength(), max: editor._config.maxLength,
    });
    return true;
  }
  return false;
}

/**
 * 17.5.6-found Firefox bug: OVERTYPING a selection that Firefox anchors at
 * the EDITOR ROOT (its select-all does this) let the browser delete every
 * block and then type into the bare root — one new <p> per keystroke burst
 * (select-all → type = shredded document). Two cases, no preventDefault —
 * the typed character inserts natively into the surviving valid block:
 *  • multi-block selection → same merge as Backspace/Delete;
 *  • root-anchored selection (getParentBlock = null, so the merge bails) →
 *    delete the contents ourselves and restore the <p><br></p> floor.
 */
export function guardOvertypeSelection(editor, e) {
  if (editor._isComposing) return;
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!handleMultiBlockDelete(editor)) {
    const info = editor.selection && editor.selection.get();
    const root = editor.getEditorElement();
    if (info && !info.collapsed
        && (info.startNode === root || info.endNode === root)) {
      info.range.deleteContents();
      ensureEditorFloor(editor);
    }
  }
}
