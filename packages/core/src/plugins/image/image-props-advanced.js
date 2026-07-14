/**
 * image-props-advanced.js — the "Advanced" field group of the Image Properties
 * dialog (Phase 9.2): CSS class, id, and inline style. Split out of
 * image-properties-form.js to keep both files under the 300-line limit.
 *
 * buildAdvancedFields(doc, img, availableClasses) → { group, read }
 *   availableClasses: optional [{ value, label }] — when present, the class
 *   field is a <select> (multiple) instead of a free-text input (Jodit's
 *   editClass select mode). read() → { className, id, style }.
 *
 * Note: the `style` value is re-run through the sanitizer's isUnsafeStyle when
 * the document is serialized (getHTML), so a hand-entered dangerous style is
 * dropped on output even though it is accepted into the field here.
 */
import { el, labeledInput } from './image-dialog-parts.js';

export function buildAdvancedFields(doc, img, availableClasses) {
  const group = el(doc, 'div', { className: 'oe-img-props__advanced' });
  group.appendChild(el(doc, 'div', { className: 'oe-img-props__section-label' }, 'Advanced'));

  const existingClasses = ((img && img.getAttribute('class')) || '')
    .split(/\s+/).filter((c) => c && c !== 'oe-figure');

  // ── CSS class: <select multiple> when availableClasses given, else text input ──
  let classInput, classSelect = null;
  if (Array.isArray(availableClasses) && availableClasses.length) {
    const wrap = el(doc, 'div', { className: 'oe-img-props__field' });
    wrap.appendChild(el(doc, 'label', { className: 'oe-img-props__label', for: 'oe-imgp-class-sel' }, 'CSS class'));
    classSelect = el(doc, 'select', {
      id: 'oe-imgp-class-sel', className: 'oe-img-props__select', multiple: 'multiple', size: '3',
    });
    for (const opt of availableClasses) {
      const o = el(doc, 'option', { value: opt.value }, opt.label || opt.value);
      if (existingClasses.includes(opt.value)) o.selected = true;
      classSelect.appendChild(o);
    }
    wrap.appendChild(classSelect);
    group.appendChild(wrap);
  } else {
    const { wrap, input } = labeledInput(doc, 'oe-imgp-class', 'CSS class',
      { type: 'text', placeholder: 'Optional class names' });
    input.value = existingClasses.join(' ');
    classInput = input;
    group.appendChild(wrap);
  }

  // ── id ────────────────────────────────────────────────────────────────────────
  const { wrap: wId, input: inId } = labeledInput(doc, 'oe-imgp-id', 'ID',
    { type: 'text', placeholder: 'Optional element id' });
  inId.value = (img && img.getAttribute('id')) || '';
  group.appendChild(wId);

  // ── inline style ───────────────────────────────────────────────────────────────
  const { wrap: wStyle, input: inStyle } = labeledInput(doc, 'oe-imgp-style', 'Inline style',
    { type: 'text', placeholder: 'e.g. box-shadow: 0 2px 6px #0003' });
  // Show only author-set style, minus the props the dedicated fields own, to
  // avoid the user seeing/clobbering width/height/margins/border-radius here.
  inStyle.value = readAuthorStyle(img);
  group.appendChild(wStyle);

  function read() {
    let className;
    if (classSelect) {
      className = Array.from(classSelect.selectedOptions).map((o) => o.value).join(' ');
    } else {
      className = classInput.value.trim();
    }
    return { className, id: inId.value.trim(), style: inStyle.value.trim() };
  }

  return { group, read };
}

// Managed properties are edited by their own dialog fields; exclude them from
// the free-text "inline style" box so it only shows extra author styles.
const MANAGED = new Set([
  'width', 'height', 'border-radius',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'float', 'display',
]);

function readAuthorStyle(img) {
  if (!img) return '';
  const raw = img.getAttribute('style') || '';
  return raw.split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => {
      const prop = d.split(':')[0].trim().toLowerCase();
      return !MANAGED.has(prop);
    })
    .join('; ');
}
