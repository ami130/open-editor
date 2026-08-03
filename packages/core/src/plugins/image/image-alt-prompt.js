/**
 * image-alt-prompt.js — when `imageRequireAlt` is on, quick-insert paths (paste,
 * drag-drop) have no metadata step, so an image would otherwise be inserted with
 * empty alt, silently defeating the requirement. This is the shared enforcement:
 * prompt for alt text before those inserts.
 *
 * Returns the entered alt (non-empty) or null if the user cancelled (→ skip the
 * insert). No-ops to '' when there's no modal surface so nothing hard-fails.
 */

/**
 * Prompt for required alt text via the shared modal.
 * @param {object} editor the editor (needs editor.ui.modal)
 * @returns {Promise<string|null>} the alt text, or null if cancelled
 */
export async function promptForAlt(editor) {
  const modal = editor && editor.ui && editor.ui.modal;
  const doc = (editor && editor._wrapper && editor._wrapper.ownerDocument) || (typeof document !== 'undefined' ? document : null);
  if (!modal || !doc) return ''; // no UI surface — don't block the insert

  const body = doc.createElement('div');
  body.className = 'oe-img-alt-prompt';
  const label = doc.createElement('label');
  label.setAttribute('for', 'oe-img-alt-prompt-input');
  label.textContent = 'Describe this image for screen readers (required):';
  label.style.cssText = 'display:block;margin-bottom:6px;font-weight:600;';
  const input = doc.createElement('input');
  input.id = 'oe-img-alt-prompt-input';
  input.type = 'text';
  input.setAttribute('aria-required', 'true');
  input.setAttribute('maxlength', '125');
  input.placeholder = 'e.g. A bar chart of quarterly sales';
  input.style.cssText = 'width:100%;box-sizing:border-box;padding:6px 8px;';
  const err = doc.createElement('div');
  err.style.cssText = 'color:var(--oe-danger,#b02a37);font-size:12px;margin-top:4px;min-height:14px;';
  body.appendChild(label);
  body.appendChild(input);
  body.appendChild(err);

  // Loop until the user provides non-empty alt or cancels.
  while (true) {
    const action = await modal.open({
      title: 'Add alt text',
      body,
      buttons: [
        { label: 'Cancel', value: null },
        { label: 'Insert', value: 'insert', variant: 'primary' },
      ],
      closeOnBackdrop: false,
    });
    if (action !== 'insert') return null; // cancelled → caller skips the insert
    const alt = input.value.trim();
    if (alt) return alt;
    err.textContent = 'Alt text is required.';
    if (typeof input.focus === 'function') input.focus();
  }
}
