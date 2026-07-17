/**
 * image-dialog.js — Insert Image dialog UI (9.1, 9.2, 9.3, 9.10, 9.15, 9.17).
 *
 * openImageDialog(editor) → Promise<result|null>
 *   result: { src, alt, title, alignment }
 *
 * Delegates all Promise resolution to ModalManager's button system.
 * modal.open() returns 'insert' or null; form values are read after it resolves.
 * A while loop re-opens the modal on validation errors so the user can correct
 * input without losing what they typed.
 */
import { sanitizeSrc } from './image-dom.js';
import { processImageFile, fileSizeError, maxFileSize, formatMB } from './image-upload.js';
import {
  el, labeledInput, isValidImageUrl, buildAlignmentField, buildProgressBar,
} from './image-dialog-parts.js';

// ─── Main dialog builder ──────────────────────────────────────────────────────

export async function openImageDialog(editor) {
  const doc    = (editor._wrapper && editor._wrapper.ownerDocument) || document;
  const config = editor._config || {};

  // ── Root container ──────────────────────────────────────────────────────────
  const root = el(doc, 'div', { className: 'oe-img-dialog' });

  // ── Tab bar ─────────────────────────────────────────────────────────────────
  const tabBar  = el(doc, 'div', { className: 'oe-img-dialog__tabs', role: 'tablist' });
  const tabUrl  = el(doc, 'button', { id: 'oe-img-tab-url', className: 'oe-img-dialog__tab oe-img-dialog__tab--active', role: 'tab', type: 'button', 'aria-selected': 'true', 'aria-controls': 'oe-img-panel-url' }, 'From URL');
  const tabFile = el(doc, 'button', { id: 'oe-img-tab-file', className: 'oe-img-dialog__tab', role: 'tab', type: 'button', 'aria-selected': 'false', 'aria-controls': 'oe-img-panel-file' }, 'Upload File');
  tabBar.appendChild(tabUrl);
  tabBar.appendChild(tabFile);
  root.appendChild(tabBar);

  // ── URL panel ───────────────────────────────────────────────────────────────
  const panelUrl = el(doc, 'div', { id: 'oe-img-panel-url', className: 'oe-img-dialog__panel', role: 'tabpanel', 'aria-labelledby': 'oe-img-tab-url' });
  const { wrap: wUrl, input: inUrl } = labeledInput(doc, 'oe-img-url', 'Image URL', {
    type: 'url', placeholder: 'https://example.com/image.png',
  });
  const urlPreview    = el(doc, 'img', { className: 'oe-img-dialog__preview oe-img-dialog__preview--hidden', alt: '' });
  const urlPreviewDim = el(doc, 'div', { className: 'oe-img-dialog__preview-dim oe-img-dialog__preview--hidden' });
  panelUrl.appendChild(wUrl);
  panelUrl.appendChild(urlPreview);
  panelUrl.appendChild(urlPreviewDim);

  // ── File panel ──────────────────────────────────────────────────────────────
  const panelFile = el(doc, 'div', { id: 'oe-img-panel-file', className: 'oe-img-dialog__panel oe-img-dialog__panel--hidden', role: 'tabpanel', 'aria-labelledby': 'oe-img-tab-file' });
  const dropZone  = el(doc, 'div', { className: 'oe-img-dialog__dropzone', tabindex: '0',
    'aria-label': 'Drop image here or choose file' });
  dropZone.innerHTML = '<svg class="oe-img-dialog__dz-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
  const dzText = el(doc, 'span', { className: 'oe-img-dialog__dz-text' });
  dzText.textContent = 'Drop image here or ';
  const chooseLbl = el(doc, 'label', { className: 'oe-img-dialog__choose', for: 'oe-img-file' }, 'browse');
  const fileInput = el(doc, 'input', { id: 'oe-img-file', type: 'file', accept: 'image/*', className: 'oe-img-dialog__file-input' });
  chooseLbl.appendChild(fileInput);
  dzText.appendChild(chooseLbl);
  dropZone.appendChild(dzText);
  const dzHint = el(doc, 'span', { className: 'oe-img-dialog__dz-hint' }, `PNG, JPG, GIF, WebP · Max ${formatMB(maxFileSize(config))}`);
  dropZone.appendChild(dzHint);

  const filePreview    = el(doc, 'img', { className: 'oe-img-dialog__preview oe-img-dialog__preview--hidden', alt: '' });
  const filePreviewDim = el(doc, 'div', { className: 'oe-img-dialog__preview-dim oe-img-dialog__preview--hidden' });
  panelFile.appendChild(dropZone);
  panelFile.appendChild(filePreview);
  panelFile.appendChild(filePreviewDim);

  // Progress bar (hidden until upload starts) — built in image-dialog-parts.js.
  const { progressWrap, progressBar, progressPct, abortBtn } = buildProgressBar(doc);
  panelFile.appendChild(progressWrap);

  root.appendChild(panelUrl);
  root.appendChild(panelFile);

  // ── Shared fields (alt, title, alignment) ───────────────────────────────────
  const shared = el(doc, 'div', { className: 'oe-img-dialog__shared' });

  // Alt text with character counter
  const wAlt  = el(doc, 'div', { className: 'oe-img-dialog__field' });
  const altLabelRow = el(doc, 'div', { className: 'oe-img-dialog__label-row' });
  const altLbl  = el(doc, 'label', { for: 'oe-img-alt', className: 'oe-img-dialog__label' }, 'Alt text');
  const altCtr  = el(doc, 'span',  { className: 'oe-img-dialog__char-count' }, 'empty = decorative');
  altLabelRow.appendChild(altLbl);
  altLabelRow.appendChild(altCtr);
  const inAlt = el(doc, 'input', { id: 'oe-img-alt', type: 'text', className: 'oe-img-dialog__input',
    placeholder: 'Describe the image for screen readers', maxlength: '125' });
  inAlt.addEventListener('input', () => {
    const len = inAlt.value.length;
    // Empty alt is valid (decorative image) — tell the user that rather than
    // nagging. Once they type, switch to the live character counter.
    altCtr.textContent = len === 0 ? 'empty = decorative' : `${len} / 125`;
    altCtr.classList.toggle('oe-img-dialog__char-count--warn', len > 100);
  });
  wAlt.appendChild(altLabelRow);
  wAlt.appendChild(inAlt);

  const { wrap: wTitle, input: inTitle } = labeledInput(doc, 'oe-img-title', 'Title',
    { type: 'text', placeholder: 'Optional — shown on hover', maxlength: '250' });

  // Alignment: 5 icon toggle buttons (None / Left / Center / Right / Inline)
  const { field: wAlign, getAlignment } = buildAlignmentField(doc);

  // Inline error display
  const errEl = el(doc, 'div', { className: 'oe-img-dialog__error oe-img-dialog__panel--hidden', role: 'alert' });

  shared.append(wAlt, wTitle, wAlign, errEl);
  root.appendChild(shared);

  // ── Internal state ──────────────────────────────────────────────────────────
  let activeTab   = 'url';
  let resolvedSrc = null;
  let abortCtrl   = null;

  function showError(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('oe-img-dialog__panel--hidden');
  }
  function clearError() {
    errEl.textContent = '';
    errEl.classList.add('oe-img-dialog__panel--hidden');
  }
  // #4: a local file needs an upload server or data-URI embedding; neither = dead-end.
  const fileUploadDeadEnd = !config.imageUploadUrl && !config.imageAllowDataUri;

  function switchTab(tab) {
    activeTab = tab;
    tabUrl.classList.toggle('oe-img-dialog__tab--active',  tab === 'url');
    tabFile.classList.toggle('oe-img-dialog__tab--active', tab === 'file');
    tabUrl.setAttribute('aria-selected',  tab === 'url'  ? 'true' : 'false');
    tabFile.setAttribute('aria-selected', tab === 'file' ? 'true' : 'false');
    panelUrl.classList.toggle('oe-img-dialog__panel--hidden',  tab !== 'url');
    panelFile.classList.toggle('oe-img-dialog__panel--hidden', tab !== 'file');
    clearError();
    if (tab === 'file' && fileUploadDeadEnd) {   // warn up front, not after a failed insert
      showError('Uploading local files is not configured. Use the “From URL” tab, ' +
        'or ask your developer to enable image uploads (imageUploadUrl) or inline embedding (imageAllowDataUri).');
    }
  }
  tabUrl.addEventListener('click',  () => switchTab('url'));
  tabFile.addEventListener('click', () => switchTab('file'));

  // Live URL preview — debounced 400ms. A token guards against a STALE
  // load/error from a previous URL firing after a new one is typed (#5).
  let _urlDebounce = null;
  let _previewToken = 0;
  function refreshUrlPreview() {
    const raw = inUrl.value.trim();
    const token = ++_previewToken;
    if (raw && sanitizeSrc(raw, config)) {
      urlPreview.onload = () => {
        if (token !== _previewToken) return;   // superseded
        urlPreviewDim.textContent = `${urlPreview.naturalWidth} × ${urlPreview.naturalHeight} px`;
        urlPreviewDim.classList.remove('oe-img-dialog__preview--hidden');
      };
      urlPreview.onerror = () => {
        if (token !== _previewToken) return;   // superseded
        urlPreviewDim.textContent = '';
        urlPreviewDim.classList.add('oe-img-dialog__preview--hidden');
      };
      urlPreview.src = raw;
      urlPreview.classList.remove('oe-img-dialog__preview--hidden');
    } else {
      urlPreview.src = '';
      urlPreview.classList.add('oe-img-dialog__preview--hidden');
      urlPreviewDim.classList.add('oe-img-dialog__preview--hidden');
    }
  }
  const scheduleUrlPreview = (delay) => {
    clearTimeout(_urlDebounce);
    _urlDebounce = setTimeout(refreshUrlPreview, delay);
  };
  inUrl.addEventListener('input', () => scheduleUrlPreview(400));
  inUrl.addEventListener('blur',  () => scheduleUrlPreview(0));

  // Enter key in URL field submits the dialog (same as clicking Insert Image)
  inUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const insertBtn = root.getRootNode()?.querySelector?.('.oe-modal__btn--primary');
      if (insertBtn) insertBtn.click();
    }
  });

  function showProgress(pct) {
    progressWrap.classList.remove('oe-img-dialog__panel--hidden');
    progressBar.style.width = `${pct}%`;
    progressPct.textContent = `${pct}%`;
  }
  function hideProgress() {
    progressWrap.classList.add('oe-img-dialog__panel--hidden');
    progressBar.style.width = '0%';
    progressPct.textContent = '0%';
  }
  // File-panel status line (neutral: dimensions + cancel notice).
  function setPanelStatus(text) {
    filePreviewDim.textContent = text;
    filePreviewDim.classList.toggle('oe-img-dialog__preview--hidden', !text);
  }

  async function handleFile(file) {
    if (!file) return;
    clearError();
    setPanelStatus('');
    const sizeErr = fileSizeError(file, config);   // config-driven, shared with drop/paste
    if (sizeErr) { showError(sizeErr); return; }
    resolvedSrc = null;
    abortCtrl = new AbortController();
    showProgress(0);
    try {
      const result = await processImageFile(file, config, (pct) => showProgress(pct), abortCtrl.signal, doc);
      if (!result) { hideProgress(); return; }
      resolvedSrc = result.src;
      showProgress(100);
      filePreview.src = result.src;
      filePreview.classList.remove('oe-img-dialog__preview--hidden');
      // Show dimensions + file size
      const kb = (file.size / 1024).toFixed(0);
      setPanelStatus(result.width && result.height
        ? `${result.width} × ${result.height} px · ${kb} KB`
        : `${kb} KB`);
    } catch (err) {
      hideProgress();
      showError(err.message || 'Upload failed.');
    } finally {
      abortCtrl = null;
    }
  }

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  });
  abortBtn.addEventListener('click', () => {
    if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; }
    hideProgress();
    // Confirm the cancellation so the progress bar doesn't silently vanish.
    setPanelStatus('Upload cancelled.');
  });
  dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('oe-img-dialog__dropzone--over'); });
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('oe-img-dialog__dropzone--over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('oe-img-dialog__dropzone--over');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // ── Open modal — let ModalManager own the Promise ───────────────────────────
  // modal.open() returns 'insert' or null. If null → cancelled, return null.
  // If 'insert' → validate; on error show message and re-open (loop).
  // closeOnBackdrop: false prevents accidental dismiss while filling fields.
   
  while (true) {
    const action = await editor.ui.modal.open({
      title: 'Insert Image',
      body:  root,
      buttons: [
        { label: 'Cancel',       value: null },
        { label: 'Insert Image', value: 'insert', variant: 'primary' },
      ],
      closeOnBackdrop: false,
      closeOnEscape:   false,
    });

    if (action !== 'insert') {
      if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; }
      return null;
    }

    clearError();
    let src;
    if (activeTab === 'url') {
      const raw = inUrl.value.trim();
      const isData = /^data:/i.test(raw);
      // Data URIs are accepted here only when imageAllowDataUri is on; otherwise
      // redirect to the Upload tab. Non-data URLs must match a known scheme.
      if (isData && !config.imageAllowDataUri) {
        showError('Data URIs are not enabled — use the “Upload File” tab to embed an image.');
        continue;
      }
      if (!isData && !isValidImageUrl(raw)) {
        showError('Please enter a valid image URL (must start with https://, http://, or /).');
        continue;
      }
      src = sanitizeSrc(raw, config);
      if (!src) {
        showError('That URL was blocked for security reasons.');
        continue;
      }
    } else {
      if (!resolvedSrc) { showError('Please choose an image file first.'); continue; }
      src = resolvedSrc;
    }

    return {
      src,
      alt:       inAlt.value.trim(),
      title:     inTitle.value.trim(),
      alignment: getAlignment() || null,
    };
  }
}
