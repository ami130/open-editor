/**
 * link-popover.js — floating hover popover for an <a> (Phase 10).
 *
 * Jodit-style bubble shown above the anchor with three actions in Jodit's order:
 *   👁 Open · ✏️ Edit · 🔗 Unlink, plus the truncated URL.
 *
 * Edit/Unlink are wired via callbacks (onEdit / onUnlink) the plugin supplies,
 * so this file never imports the dialog or link-dom (avoids an import cycle).
 * Positioning mirrors inline-toolbar.js _reposition() exactly (rect math vs the
 * wrapper, flip-below-if-no-room, horizontal clamp, iframe offset handling).
 */

// Jodit's exact open-safety regex — only these schemes may be opened.
const SAFE_OPEN = /^(https?:|mailto:|tel:)/i;

const ICON_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const ICON_UNLINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18.84 12.25l1.72-1.71a4 4 0 0 0-5.66-5.66l-1.51 1.51"/><path d="M5.17 11.75l-1.72 1.71a4 4 0 0 0 5.66 5.66l1.51-1.51"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="16" y1="19" x2="16" y2="22"/><line x1="19" y1="16" x2="22" y2="16"/></svg>';
const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

export class LinkPopover {
  constructor(editor) {
    this._editor = editor;
    this._anchor = null;
    this.onEdit = null;
    this.onUnlink = null;

    this._onDocClick = (e) => this._maybeHideOnOutside(e);
    this._onScroll = () => this.hide();
    this._onKeyDown = (e) => { if (e.key === 'Escape') this.hide(); };
    // Don't hide when focus moved INTO the popover itself (keyboard entry via
    // Alt+Enter focuses a toolbar button, which blurs the editor — that must not
    // immediately close the popover the user is trying to use). Defer so
    // document.activeElement has settled on the newly-focused node.
    this._onBlur = () => {
      const doc = (this._el && this._el.ownerDocument) || document;
      const view = doc.defaultView || window;
      const check = () => { if (!(this._el && this._el.contains(doc.activeElement))) this.hide(); };
      if (view && view.requestAnimationFrame) view.requestAnimationFrame(check);
      else setTimeout(check, 0);
    };

    this._build();
    this._bind();
  }

  _build() {
    const doc = (this._editor._wrapper && this._editor._wrapper.ownerDocument) || document;
    const pop = doc.createElement('div');
    pop.className = 'oe-link-popover';
    pop.hidden = true;
    // A11Y (L7): expose the popover as a labelled toolbar so screen readers
    // announce it and its buttons form a keyboard-navigable group.
    pop.setAttribute('role', 'toolbar');
    pop.setAttribute('aria-label', 'Link actions');

    this._urlEl = doc.createElement('span');
    this._urlEl.className = 'oe-link-popover__url';
    pop.appendChild(this._urlEl);

    const sep = doc.createElement('span');
    sep.className = 'oe-link-popover__sep';
    pop.appendChild(sep);

    this._openBtn = this._mkBtn(doc, ICON_OPEN, 'Open link', '');
    this._copyBtn = this._mkBtn(doc, ICON_COPY, 'Copy link', '');
    this._editBtn = this._mkBtn(doc, ICON_EDIT, 'Edit link', '');
    this._unlinkBtn = this._mkBtn(doc, ICON_UNLINK, 'Unlink', '--unlink');
    this._btns = [this._openBtn, this._copyBtn, this._editBtn, this._unlinkBtn];
    for (const b of this._btns) pop.appendChild(b);

    // Prevent mousedown on the popover from moving the editor selection/focus.
    // Otherwise the caret leaves the <a>, selectionChange fires, the plugin
    // calls hide() (which nulls _anchor), and the button's click handler then
    // sees a null anchor and no-ops. preventDefault keeps the selection put.
    pop.addEventListener('mousedown', (e) => e.preventDefault());

    this._openBtn.addEventListener('click', () => this._doOpen());
    this._copyBtn.addEventListener('click', () => this._doCopy());
    this._editBtn.addEventListener('click', () => {
      const a = this._anchor;
      if (a && typeof this.onEdit === 'function') this.onEdit(a);
    });
    this._unlinkBtn.addEventListener('click', () => {
      const a = this._anchor;
      if (a && typeof this.onUnlink === 'function') this.onUnlink(a);
      this.hide();
    });

    // A11Y (L7): roving-tabindex arrow navigation within the toolbar. Only the
    // active button is tabbable; ←/→ move between buttons, Escape closes.
    pop.addEventListener('keydown', (e) => this._onToolbarKey(e));

    if (this._editor._wrapper) this._editor._wrapper.appendChild(pop);
    this._el = pop;
  }

  _mkBtn(doc, icon, title, mod) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'oe-link-popover__btn' + (mod ? ` oe-link-popover__btn${mod}` : '');
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = icon;
    return b;
  }

  // Documents that can receive user input for this editor. In iframe mode the
  // editable content lives in _iframeDoc, so mousedown/keydown fire THERE — not
  // on the wrapper's (top) document. Binding only the top doc meant outside-
  // click-to-close and Escape-to-close never fired for iframe editors (MEDIUM
  // fix). Return both, de-duped.
  _docs() {
    const ed = this._editor;
    if (!ed) return [document];
    const top = (ed._wrapper && ed._wrapper.ownerDocument) || document;
    const inner = ed._iframeDoc;
    return (inner && inner !== top) ? [top, inner] : [top];
  }

  _bind() {
    const ed = this._editor;
    for (const doc of this._docs()) {
      doc.addEventListener('mousedown', this._onDocClick, true);
      doc.addEventListener('keydown', this._onKeyDown, true);
      const w = doc.defaultView;
      if (w) {
        w.addEventListener('scroll', this._onScroll, true);
        // L8: a resize / rotation / virtual-keyboard reflow moves the anchor; the
        // popover was pinned to stale coords. Hide it (same as scroll) so it never
        // floats detached — it reappears correctly on the next caret-in-link.
        w.addEventListener('resize', this._onScroll, true);
      }
    }
    ed.on('blur', this._onBlur);
  }

  _doOpen() {
    const a = this._anchor;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!SAFE_OPEN.test(href)) return; // unsafe scheme — do nothing
    const win = this._editor._wrapper && this._editor._wrapper.ownerDocument
      && this._editor._wrapper.ownerDocument.defaultView;
    if (win && typeof win.open === 'function') win.open(href, '_blank', 'noopener');
  }

  // L7: copy the link URL to the clipboard, with a toast confirmation.
  _doCopy() {
    const a = this._anchor;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href) return;
    const ed = this._editor;
    const done = (ok) => {
      if (ed && ed.ui && ed.ui.toast) {
        ok ? ed.ui.toast.success('Link copied') : ed.ui.toast.error('Couldn’t copy the link');
      }
    };
    try {
      const nav = (ed._wrapper && ed._wrapper.ownerDocument
        && ed._wrapper.ownerDocument.defaultView && ed._wrapper.ownerDocument.defaultView.navigator);
      if (nav && nav.clipboard && nav.clipboard.writeText) {
        nav.clipboard.writeText(href).then(() => done(true), () => done(false));
      } else { done(false); }
    } catch { done(false); }
  }

  // A11Y (L7): move keyboard focus into the popover's first button. Called by the
  // plugin (e.g. a shortcut) so a keyboard user whose caret is in a link can act.
  focusFirst() {
    if (!this._el || this._el.hidden || !this._btns) return false;
    const first = this._btns.find((b) => !b.disabled) || this._btns[0];
    this._setActive(this._btns.indexOf(first));
    try { first.focus(); } catch { /* focus unavailable */ }
    return true;
  }

  _setActive(idx) {
    if (!this._btns) return;
    this._active = Math.max(0, Math.min(idx, this._btns.length - 1));
    this._btns.forEach((b, i) => b.setAttribute('tabindex', i === this._active ? '0' : '-1'));
  }

  _onToolbarKey(e) {
    if (!this._btns) return;
    if (e.key === 'Escape') { this.hide(); this._refocusEditor(); return; }
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    let i = (this._active + dir + this._btns.length) % this._btns.length;
    // Skip a disabled (e.g. unsafe Open) button.
    let guard = this._btns.length;
    while (this._btns[i].disabled && guard-- > 0) i = (i + dir + this._btns.length) % this._btns.length;
    this._setActive(i);
    try { this._btns[i].focus(); } catch { /* ignore */ }
  }

  _refocusEditor() {
    const el = this._editor && this._editor.getEditorElement && this._editor.getEditorElement();
    if (el && el.focus) try { el.focus(); } catch { /* ignore */ }
  }

  _maybeHideOnOutside(e) {
    if (!this._el || this._el.hidden) return;
    const t = e.target;
    if (this._el.contains(t)) return;         // clicked inside the popover
    if (this._anchor && this._anchor.contains && this._anchor.contains(t)) return;
    this.hide();
  }

  /** Position the popover above `anchorEl` (flip below if no room). */
  showFor(anchorEl) {
    if (!anchorEl || !this._el) return;
    this._anchor = anchorEl;
    const href = anchorEl.getAttribute('href') || '';
    this._urlEl.textContent = href;
    this._urlEl.title = href;
    // Disable Open for unsafe schemes so it reads as a no-op affordance.
    this._openBtn.disabled = !SAFE_OPEN.test(href);
    this._copyBtn.disabled = !href;
    // A11Y (L7): reset the roving tabindex so the first enabled button is the
    // single tab-stop each time the popover appears.
    const firstEnabled = this._btns.findIndex((b) => !b.disabled);
    this._setActive(firstEnabled === -1 ? 0 : firstEnabled);

    const ed = this._editor;
    const wrapper = ed._wrapper;
    if (!wrapper || typeof anchorEl.getBoundingClientRect !== 'function') return;
    const rect = anchorEl.getBoundingClientRect();
    const wRect = wrapper.getBoundingClientRect();
    // iframe mode: anchor rects are in the iframe's coordinate space; add the
    // iframe element's offset within the wrapper before subtracting wRect.
    let ox = 0, oy = 0;
    if (ed._iframeEl && typeof ed._iframeEl.getBoundingClientRect === 'function') {
      const iRect = ed._iframeEl.getBoundingClientRect();
      ox = iRect.left - wRect.left;
      oy = iRect.top - wRect.top;
    }
    this._el.hidden = false;
    const bRect = this._el.getBoundingClientRect();
    let top = rect.top - wRect.top + oy - bRect.height - 8;
    if (top < 0) top = rect.bottom - wRect.top + oy + 8; // flip below
    let left = rect.left - wRect.left + ox + (rect.width / 2) - (bRect.width / 2);
    left = Math.max(0, Math.min(left, wRect.width - bRect.width));
    this._el.style.top = `${top}px`;
    this._el.style.left = `${left}px`;
  }

  hide() {
    if (this._el) this._el.hidden = true;
    this._anchor = null;
  }

  getElement() { return this._el; }
  getAnchor() { return this._anchor; }

  destroy() {
    const ed = this._editor;
    for (const doc of this._docs()) {
      doc.removeEventListener('mousedown', this._onDocClick, true);
      doc.removeEventListener('keydown', this._onKeyDown, true);
      const w = doc.defaultView;
      if (w) { w.removeEventListener('scroll', this._onScroll, true); w.removeEventListener('resize', this._onScroll, true); }
    }
    if (ed) ed.off('blur', this._onBlur);
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    this._el = null;
    this._anchor = null;
    this._editor = null;
    this.onEdit = null;
    this.onUnlink = null;
  }
}
