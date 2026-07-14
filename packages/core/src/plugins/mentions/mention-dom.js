/**
 * mention-dom.js — Phase 16.6.3: build the non-editable mention node.
 *
 * Follows the same `contenteditable="false"` island contract as images/media
 * (data-oe-island marker) so it participates correctly in the editor's
 * existing island-aware delete/find-replace/history handling.
 */
export function createMentionNode(doc, item) {
  const span = doc.createElement('span');
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('data-oe-island', 'mention');
  span.setAttribute('data-oe-mention', '');
  if (item.id != null) span.setAttribute('data-id', String(item.id));
  span.className = 'oe-mention';
  span.textContent = '@' + (item.label || item.id || '');
  return span;
}
