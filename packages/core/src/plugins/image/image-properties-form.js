/**
 * image-properties-form.js — pure form builder for the Image Properties dialog
 * (Phase 9.1). Split out so the field-building + value-reading logic is
 * unit-testable without the async ModalManager glue (mirrors link-dialog-form).
 *
 * buildImagePropsForm(doc, figure) → { form, read, srcInput }
 *   `figure` is the <figure> island being edited (contains the <img>).
 *   read() → { src, alt, title, width, height, lockAspect, alignment,
 *              borderRadius, margins:{top,right,bottom,left}, marginLock }
 *
 * Sizing/border-radius/margins are stored on the <img> (alignment owns the
 * figure's own margins, so keeping user margins on the image avoids collision).
 */
import { el, labeledInput, buildAlignmentField } from './image-dialog-parts.js';
import { buildAdvancedFields } from './image-props-advanced.js';

/** Read the alignment currently applied to a figure (by its oe-figure-- class). */
function currentAlignment(figure) {
  if (figure.classList.contains('oe-figure--left'))   return 'left';
  if (figure.classList.contains('oe-figure--center')) return 'center';
  if (figure.classList.contains('oe-figure--right'))  return 'right';
  if (figure.classList.contains('oe-figure--inline')) return 'inline';
  return '';
}

/** Parse an integer pixel value from a style/attribute string, or '' if none. */
function pxValue(v) {
  if (v == null || v === '') return '';
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? m[0] : '';
}

function numRow(doc, id, label, value) {
  return labeledInput(doc, id, label, { type: 'number', value: value === '' ? '' : String(value), min: '0' });
}

/**
 * Build the properties form for an existing figure.
 * @param {Document} doc
 * @param {HTMLElement} figure
 * @param {Array<{value,label}>} [availableClasses] optional class dropdown options
 */
export function buildImagePropsForm(doc, figure, availableClasses) {
  const img = figure.querySelector('img');
  const form = el(doc, 'div', { className: 'oe-img-props' });

  // ── Source (editable) ────────────────────────────────────────────────────────
  const { wrap: wSrc, input: inSrc } = labeledInput(doc, 'oe-imgp-src', 'Source URL', {
    type: 'text', placeholder: 'https://example.com/image.png',
  });
  inSrc.value = (img && img.getAttribute('src')) || '';
  form.appendChild(wSrc);

  // ── Alt + Title ────────────────────────────────────────────────────────────────
  const { wrap: wAlt, input: inAlt } = labeledInput(doc, 'oe-imgp-alt', 'Alt text',
    { type: 'text', maxlength: '125', placeholder: 'Describe the image' });
  inAlt.value = (img && img.getAttribute('alt')) || '';
  // 9.5 — accessibility nudge: empty alt is valid for decorative images, but
  // tell the user so it's a conscious choice rather than an oversight.
  const altHint = el(doc, 'div', { className: 'oe-img-props__hint', id: 'oe-imgp-alt-hint' });
  const refreshAltHint = () => {
    altHint.textContent = inAlt.value.trim() === ''
      ? 'Empty alt = decorative image (hidden from screen readers).'
      : '';
  };
  refreshAltHint();
  inAlt.addEventListener('input', refreshAltHint);
  wAlt.appendChild(altHint);
  form.appendChild(wAlt);

  const { wrap: wTitle, input: inTitle } = labeledInput(doc, 'oe-imgp-title', 'Title',
    { type: 'text', maxlength: '250', placeholder: 'Optional — shown on hover' });
  inTitle.value = (img && img.getAttribute('title')) || '';
  form.appendChild(wTitle);

  // ── Size: width / height + lock aspect ───────────────────────────────────────
  const sizeRow = el(doc, 'div', { className: 'oe-img-props__row' });
  const startW = pxValue(img && (img.style.width || img.getAttribute('width') || (img.naturalWidth || '')));
  const startH = pxValue(img && (img.style.height || img.getAttribute('height') || (img.naturalHeight || '')));
  const { wrap: wW, input: inW } = numRow(doc, 'oe-imgp-w', 'Width', startW);
  const { wrap: wH, input: inH } = numRow(doc, 'oe-imgp-h', 'Height', startH);
  sizeRow.appendChild(wW);
  sizeRow.appendChild(wH);
  form.appendChild(sizeRow);

  const lockWrap = el(doc, 'label', { className: 'oe-img-props__check', for: 'oe-imgp-lock' });
  const inLock = el(doc, 'input', { id: 'oe-imgp-lock', type: 'checkbox', className: 'oe-img-props__checkbox' });
  inLock.checked = true; // lock aspect by default (Jodit default)
  lockWrap.appendChild(inLock);
  lockWrap.appendChild(el(doc, 'span', { className: 'oe-img-props__check-label' }, 'Lock aspect ratio'));
  form.appendChild(lockWrap);

  // Live aspect linking: editing one dimension updates the other when locked.
  const ratio = (startW && startH) ? (Number(startW) / Number(startH)) : 0;
  inW.addEventListener('input', () => {
    if (inLock.checked && ratio) inH.value = Math.round(Number(inW.value) / ratio) || '';
  });
  inH.addEventListener('input', () => {
    if (inLock.checked && ratio) inW.value = Math.round(Number(inH.value) * ratio) || '';
  });

  // ── Alignment (reuse the insert dialog's field) ───────────────────────────────
  const { field: wAlign, getAlignment, setAlignment } = buildAlignmentField(doc, currentAlignment(figure));
  form.appendChild(wAlign);

  // ── Border radius ─────────────────────────────────────────────────────────────
  const { wrap: wRadius, input: inRadius } =
    numRow(doc, 'oe-imgp-radius', 'Border radius (px)', pxValue(img && img.style.borderRadius));
  form.appendChild(wRadius);

  // ── Margins (top / right / bottom / left + lock) ──────────────────────────────
  const mLabel = el(doc, 'label', { className: 'oe-img-props__label' }, 'Margins (px)');
  form.appendChild(mLabel);
  const marginRow = el(doc, 'div', { className: 'oe-img-props__row' });
  const cs = img ? img.style : {};
  const mk = (id, lbl, val) => numRow(doc, id, lbl, pxValue(val));
  const { wrap: wMT, input: inMT } = mk('oe-imgp-mt', 'Top', cs.marginTop);
  const { wrap: wMR, input: inMR } = mk('oe-imgp-mr', 'Right', cs.marginRight);
  const { wrap: wMB, input: inMB } = mk('oe-imgp-mb', 'Bottom', cs.marginBottom);
  const { wrap: wML, input: inML } = mk('oe-imgp-ml', 'Left', cs.marginLeft);
  marginRow.appendChild(wMT); marginRow.appendChild(wMR);
  marginRow.appendChild(wMB); marginRow.appendChild(wML);
  form.appendChild(marginRow);

  const mLockWrap = el(doc, 'label', { className: 'oe-img-props__check', for: 'oe-imgp-mlock' });
  const inMLock = el(doc, 'input', { id: 'oe-imgp-mlock', type: 'checkbox', className: 'oe-img-props__checkbox' });
  mLockWrap.appendChild(inMLock);
  mLockWrap.appendChild(el(doc, 'span', { className: 'oe-img-props__check-label' }, 'Same on all sides'));
  form.appendChild(mLockWrap);
  // When locked, typing in Top applies to all four.
  inMT.addEventListener('input', () => {
    if (inMLock.checked) { inMR.value = inMB.value = inML.value = inMT.value; }
  });

  // ── Advanced (CSS class / id / inline style) ──────────────────────────────────
  const advanced = buildAdvancedFields(doc, img, availableClasses);
  form.appendChild(advanced.group);

  function read() {
    const m = inMLock.checked
      ? { top: inMT.value, right: inMT.value, bottom: inMT.value, left: inMT.value }
      : { top: inMT.value, right: inMR.value, bottom: inMB.value, left: inML.value };
    const adv = advanced.read();
    return {
      src:          inSrc.value.trim(),
      alt:          inAlt.value.trim(),
      title:        inTitle.value.trim(),
      width:        inW.value.trim(),
      height:       inH.value.trim(),
      lockAspect:   !!inLock.checked,
      alignment:    getAlignment() || null,
      borderRadius: inRadius.value.trim(),
      margins:      m,
      marginLock:   !!inMLock.checked,
      className:    adv.className,
      id:           adv.id,
      style:        adv.style,
    };
  }

  return { form, read, srcInput: inSrc, setAlignment };
}
