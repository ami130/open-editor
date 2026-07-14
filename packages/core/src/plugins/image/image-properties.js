/**
 * image-properties.js — Image Properties dialog (Phase 9.1).
 *
 *   applyImageProps(figure, props, config) — pure: write dialog values to the
 *     figure/img (sizing/border-radius/margins → img inline style so they
 *     compose with drag-resize; alignment → figure via applyAlignment).
 *   openImageProperties(editor, figure) → Promise<'apply'|'delete'|null>
 *     Opens the modal, applies on Apply, signals Delete, resolves the action.
 *
 * The heavy field logic lives in image-properties-form.js (unit-tested);
 * this file is the thin ModalManager glue, mirroring image-dialog.js.
 */
import { sanitizeSrc, applyAlignment } from './image-dom.js';
import { buildImagePropsForm } from './image-properties-form.js';

/** Apply properties to an existing figure. See module header for semantics. */
export function applyImageProps(figure, props = {}, config = {}) {
  if (!figure) return;
  const img = figure.querySelector('img');
  if (!img) return;

  if (props.src != null && props.src !== '') {
    const safe = sanitizeSrc(props.src, config);
    if (safe) img.setAttribute('src', safe);
  }
  if (props.alt != null) {
    if (props.alt === '') img.removeAttribute('alt'); else img.setAttribute('alt', props.alt);
  }
  if (props.title != null) {
    if (props.title === '') img.removeAttribute('title'); else img.setAttribute('title', props.title);
  }

  // Advanced: id + class. (class is on the <img>; alignment classes live on the
  // <figure>, so there is no collision.)
  if ('id' in props) {
    if (props.id) img.setAttribute('id', props.id); else img.removeAttribute('id');
  }
  if ('className' in props) {
    if (props.className) img.setAttribute('class', props.className); else img.removeAttribute('class');
  }

  // Advanced inline style: apply author styles FIRST as cssText, then let the
  // dedicated fields (width/height/margins/border-radius) override individual
  // sub-properties below. This preserves extra author styles (e.g. box-shadow)
  // without the free-text box clobbering the managed props.
  if ('style' in props) {
    img.style.cssText = props.style || '';
  }

  const setPx = (prop, val) => {
    if (val == null || val === '') img.style[prop] = '';
    else img.style[prop] = `${parseInt(val, 10)}px`;
  };
  if ('width' in props) {
    setPx('width', props.width);
    if (props.width) img.setAttribute('width', parseInt(props.width, 10));
    else img.removeAttribute('width');
  }
  if ('height' in props) {
    setPx('height', props.height);
    if (props.height) img.setAttribute('height', parseInt(props.height, 10));
    else img.removeAttribute('height');
  }
  if ('borderRadius' in props) setPx('borderRadius', props.borderRadius);

  if (props.margins) {
    setPx('marginTop',    props.margins.top);
    setPx('marginRight',  props.margins.right);
    setPx('marginBottom', props.margins.bottom);
    setPx('marginLeft',   props.margins.left);
  }

  if ('alignment' in props) applyAlignment(figure, props.alignment || '');
}

/**
 * Open the Image Properties dialog for an existing figure.
 * Returns 'apply' (props were applied), 'delete' (caller should remove the
 * figure), or null (cancelled). The caller owns history snapshots + reselect.
 */
export async function openImageProperties(editor, figure) {
  if (!editor || !figure || !editor.ui || !editor.ui.modal) return null;
  const doc = (editor._wrapper && editor._wrapper.ownerDocument) || document;
  const config = editor._config || {};

  const { form, read, srcInput } = buildImagePropsForm(doc, figure, config.imageAvailableClasses);

  // Enter in the src field submits (clicks the primary button).
  srcInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const btn = form.getRootNode()?.querySelector?.('.oe-modal__btn--primary');
      if (btn) btn.click();
    }
  });
  setTimeout(() => { try { srcInput.focus(); } catch { /* non-fatal */ } }, 0);

  const action = await editor.ui.modal.open({
    title: 'Image properties',
    body:  form,
    buttons: [
      { label: 'Cancel', value: null },
      { label: 'Delete', value: 'delete' },
      { label: 'Apply',  value: 'apply', variant: 'primary' },
    ],
    closeOnBackdrop: false,
    closeOnEscape:   true,
  });

  if (action === 'delete') return 'delete';
  if (action !== 'apply')  return null;

  applyImageProps(figure, read(), config);
  return 'apply';
}
