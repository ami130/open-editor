/**
 * Returns true if the modern async Clipboard API is available.
 * Requires HTTPS (isSecureContext) and a supporting browser.
 */
export function isClipboardApiAvailable() {
  return (
    typeof navigator !== 'undefined' &&
    navigator.clipboard != null &&
    typeof navigator.clipboard.writeText === 'function' &&
    typeof window !== 'undefined' &&
    window.isSecureContext === true
  );
}

/**
 * Writes text to the OS clipboard.
 * Tries navigator.clipboard.writeText first; falls back to execCommand('copy').
 * Never throws — resolves false on any failure.
 *
 * @param {string} text
 *
 * IMPORTANT: must be called inside a user-gesture handler (click / keydown)
 * for execCommand fallback to work.
 */
export async function copyToClipboard(text, docOverride) {
  if (typeof text !== 'string') return false;

  if (isClipboardApiAvailable()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or other error — fall through
    }
  }

  // Legacy execCommand fallback. Prefer the caller-supplied document (the
  // editor's document, which in iframe mode is where the active selection lives
  // so execCommand('copy') actually has a focusable, interactive context);
  // otherwise use the top-level document.
  const targetDoc = (docOverride && docOverride.body)
    ? docOverride
    : (typeof document !== 'undefined' ? document : null);
  // Guard against a missing <body> (e.g. called before parse) so the
  // "never throws — resolves false" contract holds.
  if (!targetDoc || !targetDoc.body) return false;

  // Remember the element that had focus so we can restore it — el.select()
  // steals focus from the user's editor/caret.
  const prevActive = targetDoc.activeElement;

  const el = targetDoc.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
  targetDoc.body.appendChild(el);
  try {
    el.focus();
    el.select();
    return !!targetDoc.execCommand('copy');
  } catch {
    return false;
  } finally {
    targetDoc.body.removeChild(el);
    // Restore focus to wherever it was before the copy.
    if (prevActive && typeof prevActive.focus === 'function') {
      try { prevActive.focus(); } catch { /* element may be gone */ }
    }
  }
}

/**
 * Reads text from a ClipboardEvent's clipboardData.
 * When preferHtml is true, tries text/html first then falls back to text/plain.
 * Returns null if no data is available.
 */
export function getClipboardText(clipboardEvent, preferHtml = false) {
  if (!clipboardEvent || !clipboardEvent.clipboardData) return null;
  const cd = clipboardEvent.clipboardData;
  if (preferHtml) {
    const html = cd.getData('text/html');
    if (html) return html;
  }
  const plain = cd.getData('text/plain');
  return plain || null;
}
