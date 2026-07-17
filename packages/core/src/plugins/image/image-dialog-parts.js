/**
 * image-dialog-parts.js — Pure DOM-building helpers for the Insert Image dialog.
 *
 * Split out of image-dialog.js to keep both files under the 300-line limit.
 * Everything here is self-contained (no closures over dialog state):
 *   el(), labeledInput()        — generic element factories
 *   ALIGN_ICONS / ALIGN_LABELS  — alignment button assets
 *   isValidImageUrl()           — URL-tab scheme check
 *   buildAlignmentField()       — the 5-button alignment radiogroup
 */

export function el(doc, tag, attrs = {}, text) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else node.setAttribute(k, v);
  }
  if (text != null) node.textContent = text;
  return node;
}

export function labeledInput(doc, id, labelText, inputAttrs = {}) {
  const wrap  = el(doc, 'div', { className: 'oe-img-dialog__field' });
  const label = el(doc, 'label', { for: id, className: 'oe-img-dialog__label' }, labelText);
  const input = el(doc, 'input', { id, className: 'oe-img-dialog__input', ...inputAttrs });
  wrap.appendChild(label);
  wrap.appendChild(input);
  return { wrap, input };
}

/** The upload progress bar (hidden until upload starts). Returns its refs. */
export function buildProgressBar(doc) {
  const progressWrap  = el(doc, 'div', { className: 'oe-img-dialog__progress-wrap oe-img-dialog__panel--hidden' });
  const progressTrack = el(doc, 'div', { className: 'oe-img-dialog__progress-track' });
  const progressBar   = el(doc, 'div', { className: 'oe-img-dialog__progress-bar' });
  const progressPct   = el(doc, 'span', { className: 'oe-img-dialog__progress-pct' }, '0%');
  const abortBtn      = el(doc, 'button', { className: 'oe-img-dialog__abort', type: 'button' }, 'Cancel upload');
  progressTrack.appendChild(progressBar);
  progressWrap.appendChild(progressTrack);
  progressWrap.appendChild(progressPct);
  progressWrap.appendChild(abortBtn);
  return { progressWrap, progressBar, progressPct, abortBtn };
}

// Alignment icon button SVGs (inline — no external resource)
export const ALIGN_ICONS = {
  '':       '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="1" y="3" width="14" height="2"/><rect x="1" y="7" width="10" height="2"/><rect x="1" y="11" width="12" height="2"/></svg>',
  'left':   '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="1" y="1" width="6" height="8" rx="1"/><rect x="8" y="3" width="7" height="1.5"/><rect x="8" y="5.5" width="7" height="1.5"/><rect x="1" y="11" width="14" height="1.5"/><rect x="1" y="13.5" width="11" height="1.5"/></svg>',
  'center': '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="5" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="14" height="1.5"/><rect x="2" y="11.5" width="12" height="1.5"/><rect x="1" y="14" width="14" height="1.5"/></svg>',
  'right':  '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="9" y="1" width="6" height="8" rx="1"/><rect x="1" y="3" width="7" height="1.5"/><rect x="1" y="5.5" width="7" height="1.5"/><rect x="1" y="11" width="14" height="1.5"/><rect x="4" y="13.5" width="11" height="1.5"/></svg>',
  'inline': '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><rect x="1" y="4" width="5" height="5" rx="1"/><rect x="7" y="4" width="8" height="1.5"/><rect x="7" y="7.5" width="8" height="1.5"/><rect x="1" y="11" width="14" height="1.5"/><rect x="1" y="13.5" width="11" height="1.5"/></svg>',
};
export const ALIGN_LABELS = { '': 'None', left: 'Float left', center: 'Center', right: 'Float right', inline: 'Inline' };

export function isValidImageUrl(src) {
  if (typeof src !== 'string') return false;
  const s = src.trim().toLowerCase();
  return s.startsWith('https://') || s.startsWith('http://') || s.startsWith('/');
}

/**
 * Build the alignment radiogroup field.
 * @param {Document} doc
 * @param {string} [initial=''] pre-selected alignment ('' | left | center | right | inline)
 * Returns { field, getAlignment, setAlignment } — getAlignment() returns the
 * current value; setAlignment(val) selects it programmatically.
 */
export function buildAlignmentField(doc, initial = '') {
  const field = el(doc, 'div', { className: 'oe-img-dialog__field' });
  const lAlign = el(doc, 'label', { className: 'oe-img-dialog__label' }, 'Alignment');
  const group = el(doc, 'div', {
    className: 'oe-img-dialog__align-group', role: 'radiogroup', 'aria-label': 'Image alignment',
  });
  const btns = {};
  let selected = '';

  function select(val) {
    selected = val;
    for (const [v, b] of Object.entries(btns)) {
      b.classList.toggle('oe-img-dialog__align-btn--active', v === val);
      b.setAttribute('aria-pressed', v === val ? 'true' : 'false');
    }
  }

  for (const val of ['', 'left', 'center', 'right', 'inline']) {
    const btn = el(doc, 'button', {
      className: 'oe-img-dialog__align-btn', type: 'button', title: ALIGN_LABELS[val],
    });
    btn.innerHTML = ALIGN_ICONS[val];
    btns[val] = btn;
    btn.addEventListener('click', () => select(val));
    group.appendChild(btn);
  }
  field.appendChild(lAlign);
  field.appendChild(group);
  select(initial || '');
  return { field, getAlignment: () => selected, setAlignment: select };
}
