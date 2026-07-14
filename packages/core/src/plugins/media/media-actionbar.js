/**
 * media-actionbar.js — floating quick-action bar for a selected video embed.
 * Adapted from image-actionbar.js: align left/center/right + delete (no
 * edit/link buttons — a video embed has nothing to edit but its URL).
 * Driven by mediaSelected/mediaDeselected, same as the resize overlay.
 */
import { applyAlignment } from './media-dom.js';

const ICON = {
  left:   '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="6" height="8" rx="1"/><rect x="8" y="3" width="7" height="1.5"/><rect x="8" y="5.5" width="7" height="1.5"/><rect x="1" y="11" width="14" height="1.5"/><rect x="1" y="13.5" width="11" height="1.5"/></svg>',
  center: '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="5" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="14" height="1.5"/><rect x="2" y="11.5" width="12" height="1.5"/><rect x="1" y="14" width="14" height="1.5"/></svg>',
  right:  '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="9" y="1" width="6" height="8" rx="1"/><rect x="1" y="3" width="7" height="1.5"/><rect x="1" y="5.5" width="7" height="1.5"/><rect x="1" y="11" width="14" height="1.5"/><rect x="4" y="13.5" width="11" height="1.5"/></svg>',
  del:    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
};

export class MediaActionBar {
  constructor(editor) {
    this._editor = editor;
    this._figure = null;
    this.onDelete = null;

    this._onSel   = ({ figure }) => this.showFor(figure);
    this._onDesel = () => this.hide();
    this._onRepos = () => { if (this._figure) this._reposition(); };

    this._build();
    editor.on('mediaSelected', this._onSel);
    editor.on('mediaDeselected', this._onDesel);
    const doc = editor._wrapper && editor._wrapper.ownerDocument;
    if (doc && doc.defaultView) {
      doc.defaultView.addEventListener('scroll', this._onRepos, { passive: true });
      doc.defaultView.addEventListener('resize', this._onRepos, { passive: true });
    }
    const edEl = editor.getEditorElement && editor.getEditorElement();
    if (edEl) { edEl.addEventListener('scroll', this._onRepos, { passive: true }); this._scrollTarget = edEl; }
  }

  _mkBtn(doc, icon, title, mod) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'oe-img-actionbar__btn' + (mod ? ` oe-img-actionbar__btn${mod}` : '');
    b.title = title; b.setAttribute('aria-label', title);
    b.innerHTML = icon;
    return b;
  }

  _build() {
    const doc = (this._editor._wrapper && this._editor._wrapper.ownerDocument) || document;
    const bar = doc.createElement('div');
    bar.className = 'oe-img-actionbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Video actions');
    bar.hidden = true;
    bar.addEventListener('mousedown', (e) => e.preventDefault());

    const align = (a) => { if (this._figure) { applyAlignment(this._figure, a); this._emit(); this._reposition(); } };
    const bl = this._mkBtn(doc, ICON.left, 'Align left', '');
    const bc = this._mkBtn(doc, ICON.center, 'Center', '');
    const br = this._mkBtn(doc, ICON.right, 'Align right', '');
    bl.addEventListener('click', () => align('left'));
    bc.addEventListener('click', () => align('center'));
    br.addEventListener('click', () => align('right'));

    const sep = doc.createElement('span'); sep.className = 'oe-img-actionbar__sep';
    const bd = this._mkBtn(doc, ICON.del, 'Delete video', '--del');
    bd.addEventListener('click', () => { const f = this._figure; if (f && this.onDelete) this.onDelete(f); });

    for (const el of [bl, bc, br, sep, bd]) bar.appendChild(el);
    if (this._editor._wrapper) this._editor._wrapper.appendChild(bar);
    this._el = bar;
  }

  _emit() { this._editor && this._editor.emit('afterCommand', { command: 'mediaAligned', args: [] }); }

  showFor(figure) {
    if (!figure || !this._el) return;
    this._figure = figure;
    this._el.hidden = false;
    this._reposition();
  }

  /** Position above the figure (flip below if no room). Mirrors image-actionbar. */
  _reposition() {
    const ed = this._editor;
    const wrapper = ed && ed._wrapper;
    if (!this._figure || !wrapper || typeof this._figure.getBoundingClientRect !== 'function') return;
    const rect = this._figure.getBoundingClientRect();
    const wRect = wrapper.getBoundingClientRect();
    let ox = 0, oy = 0;
    if (ed._iframeEl && typeof ed._iframeEl.getBoundingClientRect === 'function') {
      const iRect = ed._iframeEl.getBoundingClientRect();
      ox = iRect.left - wRect.left; oy = iRect.top - wRect.top;
    }
    const bRect = this._el.getBoundingClientRect();
    let top = rect.top - wRect.top + oy - bRect.height - 6;
    if (top < 0) top = rect.top - wRect.top + oy + 6;
    let left = rect.left - wRect.left + ox;
    left = Math.max(0, Math.min(left, wRect.width - bRect.width));
    this._el.style.top = `${top}px`;
    this._el.style.left = `${left}px`;
  }

  hide() { if (this._el) this._el.hidden = true; this._figure = null; }
  getElement() { return this._el; }

  destroy() {
    const ed = this._editor;
    if (ed) {
      ed.off('mediaSelected', this._onSel);
      ed.off('mediaDeselected', this._onDesel);
      const doc = ed._wrapper && ed._wrapper.ownerDocument;
      if (doc && doc.defaultView) {
        doc.defaultView.removeEventListener('scroll', this._onRepos);
        doc.defaultView.removeEventListener('resize', this._onRepos);
      }
    }
    if (this._scrollTarget) { this._scrollTarget.removeEventListener('scroll', this._onRepos); this._scrollTarget = null; }
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    this._el = null; this._figure = null; this._editor = null;
    this.onDelete = null;
  }
}
