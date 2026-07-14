/**
 * command-announcer.js — 14.2 command-state live region.
 *
 * A screen-reader user pressing Ctrl+B (or any formatting shortcut) hears
 * nothing about whether the format turned on or off — `aria-pressed` on a
 * toolbar button is only conveyed when THAT button is focused, not when the
 * command runs from the keyboard while focus is in the editor.
 *
 * This attaches a visually-hidden `aria-live="polite"` region to the wrapper and
 * announces "Bold on" / "Bold off" (etc.) after each toggle command, using the
 * command's own isActive() to read the resulting state.
 */

// Commands whose state is a meaningful on/off toggle worth announcing, with a
// human label. Non-toggle commands (insertImage, undo…) are intentionally omitted.
const TOGGLE_LABELS = {
  bold: 'Bold', italic: 'Italic', underline: 'Underline',
  strikethrough: 'Strikethrough', superscript: 'Superscript', subscript: 'Subscript',
  inlineCode: 'Code', overline: 'Overline',
  unorderedList: 'Bulleted list', orderedList: 'Numbered list',
  blockquote: 'Quote',
  alignLeft: 'Align left', alignCenter: 'Align center',
  alignRight: 'Align right', alignJustify: 'Justify',
};

export class CommandAnnouncer {
  constructor(editor) {
    this._editor = editor;
    this._region = null;
    this._onAfter = (payload) => this._announce(payload);
    this._build();
    editor.on('afterCommand', this._onAfter);
  }

  _build() {
    const doc = (this._editor._wrapper && this._editor._wrapper.ownerDocument) || document;
    const r = doc.createElement('div');
    r.className = 'oe-sr-live';
    r.setAttribute('aria-live', 'polite');
    r.setAttribute('aria-atomic', 'true');
    // Visually hidden but available to assistive tech.
    r.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;' +
      'clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;';
    if (this._editor._wrapper) this._editor._wrapper.appendChild(r);
    this._region = r;
  }

  _announce(payload) {
    if (!this._region || !payload) return;
    const label = TOGGLE_LABELS[payload.command];
    if (!label) return;
    let on;
    try { on = !!(this._editor.commands && this._editor.commands.isActive(payload.command)); }
    catch { return; }
    // Re-set even when the string repeats: assign '' first so a repeat still
    // triggers a fresh announcement (some SRs skip identical successive text).
    this._region.textContent = '';
    this._region.textContent = `${label} ${on ? 'on' : 'off'}`;
  }

  destroy() {
    if (this._editor) this._editor.off('afterCommand', this._onAfter);
    if (this._region && this._region.parentNode) this._region.parentNode.removeChild(this._region);
    this._region = null;
    this._editor = null;
  }
}
