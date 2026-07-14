/**
 * link-dialog-form.js — Pure form builder for the Link dialog (Phase 10).
 *
 * Split out of link-dialog.js so the field-building + value-reading logic is
 * unit-testable without the async ModalManager glue. buildLinkForm() returns
 * { form, read, showError, clearError } — construct a jsdom doc, call it, poke
 * input values, and assert read() output.
 *
 * The `el` / `labeledInput` helpers are reused from the image dialog parts
 * (they are generic element factories, no image-specific state).
 */
import { el, labeledInput } from '../image/image-dialog-parts.js';

/** Read rel tokens off an <a> and report whether it contains 'nofollow'. */
function relHasNofollow(a) {
  const rel = (a && a.getAttribute('rel')) || '';
  return rel.split(/\s+/).filter(Boolean).includes('nofollow');
}

// Convert an rgb()/rgba() string to #rrggbb, or '' if it can't be parsed.
function rgbToHex(val) {
  const m = val.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!m) return '';
  const h = (n) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))).toString(16).padStart(2, '0');
  return '#' + h(m[1]) + h(m[2]) + h(m[3]);
}

/**
 * Read an existing link's inline color as a #rrggbb hex string, or '' if none.
 * A <input type=color> only accepts hex, so rgb()/rgba()/named colors are
 * normalized to hex here — previously they were dropped (LOW audit fix), so
 * editing a link with a non-hex color silently reset it to the default.
 */
function readColor(a) {
  if (!a) return '';
  const style = a.getAttribute('style') || '';
  const m = style.match(/color\s*:\s*([^;]+)/i);
  if (!m) return '';
  const val = m[1].trim();
  if (/^#[0-9a-f]{6}$/i.test(val)) return val;
  if (/^#[0-9a-f]{3}$/i.test(val)) {
    // Expand #abc → #aabbcc for the color input.
    return '#' + val.slice(1).split('').map((c) => c + c).join('');
  }
  const fromRgb = rgbToHex(val);
  if (fromRgb) return fromRgb;
  // Named color (e.g. "red") — resolve via the browser to an rgb() value, then
  // to hex. Falls back to '' in headless environments without getComputedStyle.
  try {
    const doc = a.ownerDocument || document;
    const probe = doc.createElement('span');
    probe.style.color = val;
    doc.body.appendChild(probe);
    const resolved = (doc.defaultView || window).getComputedStyle(probe).color;
    doc.body.removeChild(probe);
    return rgbToHex(resolved) || '';
  } catch { return ''; }
}

function checkboxRow(doc, id, labelText, checked) {
  const wrap  = el(doc, 'label', { className: 'oe-link-dialog__check', for: id });
  const input = el(doc, 'input', { id, type: 'checkbox', className: 'oe-link-dialog__checkbox' });
  input.checked = !!checked;
  const span  = el(doc, 'span', { className: 'oe-link-dialog__check-label' }, labelText);
  wrap.appendChild(input);
  wrap.appendChild(span);
  return { wrap, input };
}

/**
 * Build the link form.
 *   buildLinkForm(doc, editor, existingLink) → { form, read, showError, clearError }
 * `existingLink` is an <a> element or null (insert mode).
 * read() returns { href, text, target, nofollow, className, ariaLabel }.
 */
export function buildLinkForm(doc, editor, existingLink) {
  const config = (editor && editor._config) || {};

  const form = el(doc, 'div', { className: 'oe-link-dialog' });

  // ── URL (required, autofocused) ────────────────────────────────────────────
  const { wrap: wUrl, input: inUrl } = labeledInput(doc, 'oe-link-url', 'URL', {
    type: 'url', placeholder: 'https://example.com', required: 'required',
  });
  if (existingLink) inUrl.value = existingLink.getAttribute('href') || '';
  form.appendChild(wUrl);

  // ── Display text ────────────────────────────────────────────────────────────
  const { wrap: wText, input: inText } = labeledInput(doc, 'oe-link-text', 'Text', {
    type: 'text', placeholder: 'Link text',
  });
  if (existingLink) {
    inText.value = existingLink.textContent || '';
  } else if (editor && editor.selection && typeof editor.selection.getSelectedText === 'function') {
    inText.value = editor.selection.getSelectedText() || '';
  }
  form.appendChild(wText);

  // ── Options: new tab + nofollow ───────────────────────────────────────────────
  const opts = el(doc, 'div', { className: 'oe-link-dialog__options' });
  const newTabChecked = existingLink
    ? existingLink.getAttribute('target') === '_blank'
    : !!config.linkOpenInNewTabDefault;
  const { wrap: wNewTab, input: inNewTab } =
    checkboxRow(doc, 'oe-link-newtab', 'Open in new tab', newTabChecked);
  const { wrap: wNofollow, input: inNofollow } =
    checkboxRow(doc, 'oe-link-nofollow', 'No follow', existingLink ? relHasNofollow(existingLink) : false);
  opts.appendChild(wNewTab);
  opts.appendChild(wNofollow);
  form.appendChild(opts);

  // ── Advanced: CSS class + aria-label ──────────────────────────────────────────
  const { wrap: wClass, input: inClass } = labeledInput(doc, 'oe-link-class', 'CSS class', {
    type: 'text', placeholder: 'Optional class names',
  });
  if (existingLink) inClass.value = existingLink.getAttribute('class') || '';
  form.appendChild(wClass);

  const { wrap: wAria, input: inAria } = labeledInput(doc, 'oe-link-aria', 'ARIA label', {
    type: 'text', placeholder: 'Optional accessible label',
  });
  if (existingLink) inAria.value = existingLink.getAttribute('aria-label') || '';
  form.appendChild(wAria);

  // ── Link color ────────────────────────────────────────────────────────────────
  const { wrap: wColor, input: inColor } = labeledInput(doc, 'oe-link-color', 'Color', {
    type: 'color', value: readColor(existingLink) || '#2563eb',
  });
  // A "use default color" reset toggle — unchecking a color input can't clear it,
  // so pair it with a checkbox that means "no custom color".
  const { wrap: wNoColor, input: inNoColor } =
    checkboxRow(doc, 'oe-link-nocolor', 'No custom color', !readColor(existingLink));
  form.appendChild(wColor);
  form.appendChild(wNoColor);

  // ── Inline error area ─────────────────────────────────────────────────────────
  const errEl = el(doc, 'div', { className: 'oe-link-dialog__error oe-link-dialog__error--hidden', role: 'alert' });
  form.appendChild(errEl);

  function showError(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('oe-link-dialog__error--hidden');
  }
  function clearError() {
    errEl.textContent = '';
    errEl.classList.add('oe-link-dialog__error--hidden');
  }

  function read() {
    return {
      href:      inUrl.value.trim(),
      text:      inText.value.trim(),
      target:    !!inNewTab.checked,
      nofollow:  !!inNofollow.checked,
      className: inClass.value.trim(),
      ariaLabel: inAria.value.trim(),
      // "No custom color" checked → clear color (''); else the picker value.
      color:     inNoColor.checked ? '' : inColor.value,
    };
  }

  return { form, read, showError, clearError, urlInput: inUrl };
}
