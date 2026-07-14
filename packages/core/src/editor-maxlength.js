/**
 * maxLength enforcement helpers, applied as a mixin to OpenEditor.
 * Extracted from editor-events.js to keep that file under the 300-line limit.
 */

export const editorMaxLengthMixin = {

  // Raw (untrimmed) character count — the metric maxLength enforcement and
  // truncation both use, so the keydown/beforeinput gate agrees with the
  // TreeWalker truncation (getText() trims, which let whitespace overflow).
  _rawTextLength() {
    const el = this._editorEl;
    if (!el) return 0;
    return (el.textContent || '').length;
  },

  // Truncate editor content to maxLength by walking text nodes. Shared by the
  // paste handler and IME composition-end so both paths enforce the limit.
  _truncateToMaxLength() {
    if (this._config.maxLength == null) return;
    if (this._destroyed) return;
    const max = this._config.maxLength;
    const current = this._rawTextLength();
    if (current <= max) return;
    const el = this._editorEl;
    if (!el) return;
    const doc = this._iframeDoc || document;
    const tmp = doc.createElement('div');
    tmp.innerHTML = el.innerHTML;
    let count = 0;
    const walker = doc.createTreeWalker(tmp, 4);
    let n;
    while ((n = walker.nextNode()) !== null) {
      // Guard: nodeValue can be null on non-text nodes that sneak through
      if (n.nodeValue == null) continue;
      const rem = max - count;
      if (rem <= 0) { n.nodeValue = ''; }
      else if (count + n.nodeValue.length > max) { n.nodeValue = n.nodeValue.slice(0, rem); count = max; }
      else { count += n.nodeValue.length; }
    }
    el.innerHTML = tmp.innerHTML;
    // Take a history snapshot so the truncation is undoable (H-2/M-8 fix).
    if (this.history && !this.history._isApplying) this.history.takeSnapshot();
    this.emit('maxLengthExceeded', { current, max });
  },

  _onPasteMaxLength() {
    if (this._config.maxLength == null) return;
    const tid = setTimeout(() => {
      // Guard against editor being destroyed between paste and callback (C-3).
      if (!this._timers) return;
      this._timers.delete(tid);
      if (!this._destroyed) this._truncateToMaxLength();
    }, 0);
    if (this._timers) this._timers.add(tid);
  },

};
