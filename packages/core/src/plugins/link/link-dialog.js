/**
 * link-dialog.js — async Insert/Edit Link dialog (Phase 10).
 *
 * openLinkDialog(editor, existingLink) → Promise<result|null>
 *   result: { href, text, target, nofollow, className, ariaLabel }
 *   null on cancel / backdrop / escape.
 *
 * The heavy lifting (field building + value reading) lives in link-dialog-form.js
 * as the pure buildLinkForm() so it can be unit-tested headlessly. This file is
 * the thin ModalManager glue: it opens the modal in a validation loop and only
 * resolves once the href passes isAllowedLinkHref (10.9/10.12 — block truly
 * unsafe schemes; allow merely odd-but-valid URLs).
 */
import { isAllowedLinkHref } from '../../sanitizer/sanitizer-utils.js';
import { buildLinkForm } from './link-dialog-form.js';

export async function openLinkDialog(editor, existingLink = null) {
  const doc = (editor._wrapper && editor._wrapper.ownerDocument) || document;

  const { form, read, showError, clearError, urlInput } =
    buildLinkForm(doc, editor, existingLink);

  const submitLabel = existingLink ? 'Update' : 'Insert Link';

  // Enter in the URL field submits (clicks the primary button), mirroring
  // image-dialog.js — the modal owns the Promise, so we click its button.
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const btn = form.getRootNode()?.querySelector?.('.oe-modal__btn--primary');
      if (btn) btn.click();
    }
  });

  // Autofocus the URL field once the modal is in the DOM.
  setTimeout(() => { try { urlInput.focus(); } catch { /* non-fatal */ } }, 0);

  // Buttons: when editing an existing link, offer an Unlink action (Jodit-style,
  // hidden on insert). It resolves the dialog with a sentinel the plugin handles.
  const buttons = [{ label: 'Cancel', value: null }];
  if (existingLink) buttons.push({ label: 'Unlink', value: 'unlink' });
  buttons.push({ label: submitLabel, value: 'submit', variant: 'primary' });

   
  while (true) {
    const action = await editor.ui.modal.open({
      title: existingLink ? 'Edit Link' : 'Insert Link',
      body:  form,
      buttons,
      closeOnBackdrop: true,
      closeOnEscape:   true,
    });

    if (action === 'unlink') return { unlink: true };
    if (action !== 'submit') return null; // cancel / backdrop / escape

    clearError();
    const values = read();
    // Warn-not-block (10.12): reject only unsafe/empty schemes via the whitelist.
    if (!values.href) {
      showError('Please enter a URL.');
      continue;
    }
    if (!isAllowedLinkHref(values.href)) {
      showError('That URL was blocked for security reasons.');
      continue;
    }
    return values;
  }
}
