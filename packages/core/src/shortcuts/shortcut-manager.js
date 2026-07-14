/**
 * Normalizes a shortcut string to a canonical form.
 * e.g. "ctrl+b", "Ctrl+B", "CTRL+B" → "ctrl+b"
 * Modifier order is always: ctrl > alt > shift > meta > key
 */
function normalizeKeys(keys) {
  const lower = keys.toLowerCase();
  // Split on '+' but preserve a literal trailing '+' key: "ctrl++" naively
  // splits to ['ctrl','',''], losing the '+'. Detect a trailing '+' separately.
  const trailingPlus = /\+\+$/.test(lower);
  const parts = lower.split('+').map((p) => p.trim()).filter((p) => p !== '');
  const modifiers = [];
  let key = '';

  for (const part of parts) {
    if (part === 'ctrl' || part === 'control') modifiers.push('ctrl');
    else if (part === 'alt') modifiers.push('alt');
    else if (part === 'shift') modifiers.push('shift');
    else if (part === 'meta' || part === 'cmd' || part === 'command') modifiers.push('meta');
    else key = part;
  }
  if (trailingPlus && !key) key = '+';

  const order = ['ctrl', 'alt', 'shift', 'meta'];
  const sorted = order.filter((m) => modifiers.includes(m));
  if (key) sorted.push(key);
  return sorted.join('+');
}

export class ShortcutManager {
  constructor(logger = null) {
    this._shortcuts = new Map();
    this._logger = logger;
  }

  register(keys, command, label = '') {
    const normalized = normalizeKeys(keys);
    if (this._shortcuts.has(normalized)) {
      const existing = this._shortcuts.get(normalized);
      if (this._logger) {
        this._logger.warn(
          `ShortcutManager: conflict — "${normalized}" already registered as "${existing.command}". Overwriting with "${command}".`
        );
      }
    }
    this._shortcuts.set(normalized, { keys: normalized, command, label });
    return this;
  }

  unregister(keys) {
    const normalized = normalizeKeys(keys);
    this._shortcuts.delete(normalized);
    return this;
  }

  getAll() {
    return new Map(this._shortcuts);
  }

  /**
   * Matches a KeyboardEvent against registered shortcuts.
   * Returns the matching descriptor or null.
   */
  match(event) {
    // AltGr (reported as ctrlKey+altKey) is used to type characters on many
    // international layouts — it must not trigger ctrl+alt shortcuts.
    if (typeof event.getModifierState === 'function' && event.getModifierState('AltGraph')) {
      return null;
    }

    const parts = [];
    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('meta');

    const key = (event.key || '').toLowerCase();
    if (key && key !== 'control' && key !== 'alt' && key !== 'shift' && key !== 'meta') {
      parts.push(key);
    }

    const combo = parts.join('+');
    return this._shortcuts.get(combo) || null;
  }
}
