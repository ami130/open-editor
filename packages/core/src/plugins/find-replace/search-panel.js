/**
 * search-panel.js — Phase 13.2: the floating Find/Replace panel (a DOM Node).
 * Pure builder — takes a callbacks object; holds no editor reference.
 *
 * buildSearchPanel(doc, handlers) → { node, findInput, replaceInput,
 *   setCount(current,total), setReplaceVisible(bool), focusFind() }
 * handlers: { onFind(q), onNext(), onPrev(), onReplace(rep), onReplaceAll(rep),
 *   onClose(), onCaseToggle(bool), onWholeWordToggle(bool) }
 */

function el(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function buildSearchPanel(doc, handlers = {}) {
  const h = handlers;
  const root = el(doc, 'div', 'oe-find');
  root.setAttribute('role', 'search');
  root.setAttribute('aria-label', 'Find and replace');

  // ── Find row ──────────────────────────────────────────────────────────────
  const findRow = el(doc, 'div', 'oe-find__row');
  const findInput = el(doc, 'input', 'oe-find__input');
  findInput.type = 'search';
  findInput.setAttribute('placeholder', 'Find');
  findInput.setAttribute('aria-label', 'Find');
  findInput.addEventListener('input', () => h.onFind && h.onFind(findInput.value));
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); (e.shiftKey ? h.onPrev : h.onNext) && (e.shiftKey ? h.onPrev() : h.onNext()); }
    if (e.key === 'Escape') { e.preventDefault(); h.onClose && h.onClose(); }
  });

  const count = el(doc, 'span', 'oe-find__count', '0/0');
  // LOW a11y fix: title alone is an inconsistent accessible-name source across
  // screen readers — add explicit aria-label to every icon-only button.
  const prev = el(doc, 'button', 'oe-find__btn', '‹'); prev.type = 'button'; prev.title = 'Previous'; prev.setAttribute('aria-label', 'Previous match');
  const next = el(doc, 'button', 'oe-find__btn', '›'); next.type = 'button'; next.title = 'Next'; next.setAttribute('aria-label', 'Next match');
  const caseBtn = el(doc, 'button', 'oe-find__btn oe-find__case', 'Aa'); caseBtn.type = 'button'; caseBtn.title = 'Match case'; caseBtn.setAttribute('aria-label', 'Match case'); caseBtn.setAttribute('aria-pressed', 'false');
  // 16.7.4 — whole-word toggle, same shape/behavior as the case-sensitive
  // toggle right next to it (icon-button, aria-pressed, an --on modifier class).
  const wordBtn = el(doc, 'button', 'oe-find__btn oe-find__word', 'W'); wordBtn.type = 'button'; wordBtn.title = 'Whole word'; wordBtn.setAttribute('aria-label', 'Whole word'); wordBtn.setAttribute('aria-pressed', 'false');
  const close = el(doc, 'button', 'oe-find__btn oe-find__close', '×'); close.type = 'button'; close.title = 'Close'; close.setAttribute('aria-label', 'Close find');
  let caseOn = false;
  let wordOn = false;
  caseBtn.addEventListener('click', () => {
    caseOn = !caseOn;
    caseBtn.classList.toggle('oe-find__case--on', caseOn);
    caseBtn.setAttribute('aria-pressed', String(caseOn)); // expose on/off state to SRs
    h.onCaseToggle && h.onCaseToggle(caseOn);
  });
  wordBtn.addEventListener('click', () => {
    wordOn = !wordOn;
    wordBtn.classList.toggle('oe-find__word--on', wordOn);
    wordBtn.setAttribute('aria-pressed', String(wordOn));
    h.onWholeWordToggle && h.onWholeWordToggle(wordOn);
  });
  prev.addEventListener('click', () => h.onPrev && h.onPrev());
  next.addEventListener('click', () => h.onNext && h.onNext());
  close.addEventListener('click', () => h.onClose && h.onClose());

  findRow.append(findInput, count, prev, next, caseBtn, wordBtn, close);
  root.appendChild(findRow);

  // ── Replace row (hidden until replace mode) ─────────────────────────────────
  const repRow = el(doc, 'div', 'oe-find__row oe-find__row--replace');
  const replaceInput = el(doc, 'input', 'oe-find__input');
  replaceInput.type = 'text';
  replaceInput.setAttribute('placeholder', 'Replace with');
  replaceInput.setAttribute('aria-label', 'Replace with');
  const repBtn = el(doc, 'button', 'oe-find__btn', 'Replace'); repBtn.type = 'button';
  const repAllBtn = el(doc, 'button', 'oe-find__btn', 'All'); repAllBtn.type = 'button'; repAllBtn.title = 'Replace all';
  repBtn.addEventListener('click', () => h.onReplace && h.onReplace(replaceInput.value));
  repAllBtn.addEventListener('click', () => h.onReplaceAll && h.onReplaceAll(replaceInput.value));
  repRow.append(replaceInput, repBtn, repAllBtn);
  root.appendChild(repRow);

  return {
    node: root,
    findInput,
    replaceInput,
    setCount(cur, total) { count.textContent = `${cur}/${total}`; },
    setReplaceVisible(on) { repRow.style.display = on ? '' : 'none'; },
    focusFind() { try { findInput.focus(); findInput.select(); } catch { /* ignore */ } },
  };
}
