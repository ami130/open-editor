/**
 * Structured-JSON content API (getJSON / setJSON), applied as a mixin to
 * OpenEditor. Extracted from editor-api.js to keep it under the 300-line limit.
 * The JSON shape is { version: '1.0', content: [{ type, html }, …] }.
 */

export const editorJsonMixin = {

  getJSON() {
    const html = this.getHTML();
    const doc = this._iframeDoc || document;
    const tmp = doc.createElement('div');
    tmp.innerHTML = html;

    const content = [];
    for (const child of Array.from(tmp.childNodes)) {
      if (child.nodeType === 1) {
        content.push({ type: child.tagName.toLowerCase(), html: child.outerHTML });
      } else if (child.nodeType === 3 && child.textContent.trim()) {
        // Escape so a top-level text node containing < or & survives the
        // setJSON round-trip (block.html is concatenated into innerHTML).
        const escaped = child.textContent
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        content.push({ type: 'text', html: escaped });
      }
    }
    return { version: '1.0', content };
  },

  setJSON(obj) {
    if (this._destroyed) return;
    if (!obj || typeof obj !== 'object') {
      this.logger.warn('setJSON: invalid argument — expected object');
      return;
    }
    const version = obj.version || '1.0';
    if (version !== '1.0') {
      this.logger.warn('setJSON: unknown version "' + version + '" — attempting restore anyway');
    }
    if (!Array.isArray(obj.content)) {
      this.logger.warn('setJSON: missing content array');
      return;
    }
    this.setHTML(obj.content.map((block) => block.html || '').join(''));
  },

};
