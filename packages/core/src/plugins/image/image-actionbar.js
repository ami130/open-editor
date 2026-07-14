/**
 * image-actionbar.js — floating quick-action bar for a selected image (9.4).
 *
 * Appears above the selected <figure> (the resize overlay sits on the figure;
 * this bar floats above it) so users get discoverable align / edit / link /
 * delete actions without needing the right-click context menu.
 *
 * Driven by the editor's imageSelected / imageDeselected events (the same ones
 * the resize overlay uses). Alignment is applied directly; edit / link / delete
 * are wired via callbacks (onEdit / onLink / onDelete) the plugin supplies, so
 * this file never imports the dialog (avoids an import cycle). Positioning
 * mirrors link-popover.js / inline-toolbar.js (rect vs wrapper, clamp, iframe).
 */
import { applyAlignment } from './image-dom.js';

const ICON = {
  left:   '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="6" height="8" rx="1"/><rect x="8" y="3" width="7" height="1.5"/><rect x="8" y="5.5" width="7" height="1.5"/><rect x="1" y="11" width="14" height="1.5"/><rect x="1" y="13.5" width="11" height="1.5"/></svg>',
  center: '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="5" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="14" height="1.5"/><rect x="2" y="11.5" width="12" height="1.5"/><rect x="1" y="14" width="14" height="1.5"/></svg>',
  right:  '<svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="9" y="1" width="6" height="8" rx="1"/><rect x="1" y="3" width="7" height="1.5"/><rect x="1" y="5.5" width="7" height="1.5"/><rect x="1" y="11" width="14" height="1.5"/><rect x="4" y="13.5" width="11" height="1.5"/></svg>',
  edit:   '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  link:   '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  del:    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
};

export class ImageActionBar {
  constructor(editor) {
    this._editor = editor;
    this._figure = null;
    this.onEdit = null;
    this.onLink = null;
    this.onDelete = null;

    this._onSel   = ({ figure }) => this.showFor(figure);
    this._onDesel = () => this.hide();
    this._onRepos = () => { if (this._figure) this._reposition(); };

    this._build();
    editor.on('imageSelected', this._onSel);
    editor.on('imageDeselected', this._onDesel);
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
    bar.setAttribute('aria-label', 'Image actions');
    bar.hidden = true;
    // Prevent mousedown from moving the editor selection / deselecting the image.
    bar.addEventListener('mousedown', (e) => e.preventDefault());

    const align = (a) => { if (this._figure) { applyAlignment(this._figure, a); this._emit(); this._reposition(); } };
    const bl = this._mkBtn(doc, ICON.left, 'Align left', '');
    const bc = this._mkBtn(doc, ICON.center, 'Center', '');
    const br = this._mkBtn(doc, ICON.right, 'Align right', '');
    bl.addEventListener('click', () => align('left'));
    bc.addEventListener('click', () => align('center'));
    br.addEventListener('click', () => align('right'));

    const sep = doc.createElement('span'); sep.className = 'oe-img-actionbar__sep';
    const be = this._mkBtn(doc, ICON.edit, 'Edit image', '');
    const bk = this._mkBtn(doc, ICON.link, 'Add / edit link', '');
    const bd = this._mkBtn(doc, ICON.del, 'Delete image', '--del');
    be.addEventListener('click', () => { const f = this._figure; if (f && this.onEdit) this.onEdit(f); });
    bk.addEventListener('click', () => { const f = this._figure; if (f && this.onLink) this.onLink(f); });
    bd.addEventListener('click', () => { const f = this._figure; if (f && this.onDelete) this.onDelete(f); });

    for (const el of [bl, bc, br, sep, be, bk, bd]) bar.appendChild(el);
    if (this._editor._wrapper) this._editor._wrapper.appendChild(bar);
    this._el = bar;
  }

  _emit() { this._editor && this._editor.emit('afterCommand', { command: 'imageAligned', args: [] }); }

  showFor(figure) {
    if (!figure || !this._el) return;
    this._figure = figure;
    this._el.hidden = false;
    this._reposition();
  }

  /** Position above the figure (flip below if no room). Mirrors link-popover. */
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
    if (top < 0) top = rect.top - wRect.top + oy + 6; // flip just inside the top
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
      ed.off('imageSelected', this._onSel);
      ed.off('imageDeselected', this._onDesel);
      const doc = ed._wrapper && ed._wrapper.ownerDocument;
      if (doc && doc.defaultView) {
        doc.defaultView.removeEventListener('scroll', this._onRepos);
        doc.defaultView.removeEventListener('resize', this._onRepos);
      }
    }
    if (this._scrollTarget) { this._scrollTarget.removeEventListener('scroll', this._onRepos); this._scrollTarget = null; }
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    this._el = null; this._figure = null; this._editor = null;
    this.onEdit = this.onLink = this.onDelete = null;
  }
}
