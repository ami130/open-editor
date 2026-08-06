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
  // FR5 a11y: announce match-count changes ("3/12", "0/0") to screen readers.
  count.setAttribute('role', 'status');
  count.setAttribute('aria-live', 'polite');
  // FR1: a visible toggle to REVEAL the replace row from find mode. Without it, a
  // user who opened Find (toolbar / Ctrl+F) had no reachable way to replace.
  const repToggle = el(doc, 'button', 'oe-find__btn oe-find__toggle', '⇄');
  repToggle.type = 'button'; repToggle.title = 'Toggle replace';
  repToggle.setAttribute('aria-label', 'Toggle replace'); repToggle.setAttribute('aria-pressed', 'false');
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

  findRow.append(findInput, count, prev, next, caseBtn, wordBtn, repToggle, close);
  root.appendChild(findRow);

  // ── Replace row (hidden until replace mode) ─────────────────────────────────
  const repRow = el(doc, 'div', 'oe-find__row oe-find__row--replace');
  const replaceInput = el(doc, 'input', 'oe-find__input');
  replaceInput.type = 'text';
  replaceInput.setAttribute('placeholder', 'Replace with');
  replaceInput.setAttribute('aria-label', 'Replace with');
  // FR2: Enter in the replace field triggers Replace (Ctrl/Cmd+Enter = Replace
  // All); Escape closes — previously this field had no key handling, so the
  // natural "type replacement, press Enter" did nothing.
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) { h.onReplaceAll && h.onReplaceAll(replaceInput.value); }
      else { h.onReplace && h.onReplace(replaceInput.value); }
    }
    if (e.key === 'Escape') { e.preventDefault(); h.onClose && h.onClose(); }
  });
  // FR5 a11y: label the text-only action buttons.
  const repBtn = el(doc, 'button', 'oe-find__btn', 'Replace'); repBtn.type = 'button';
  repBtn.title = 'Replace'; repBtn.setAttribute('aria-label', 'Replace current match');
  const repAllBtn = el(doc, 'button', 'oe-find__btn', 'All'); repAllBtn.type = 'button';
  repAllBtn.title = 'Replace all'; repAllBtn.setAttribute('aria-label', 'Replace all matches');
  repBtn.addEventListener('click', () => h.onReplace && h.onReplace(replaceInput.value));
  repAllBtn.addEventListener('click', () => h.onReplaceAll && h.onReplaceAll(replaceInput.value));
  repRow.append(replaceInput, repBtn, repAllBtn);
  root.appendChild(repRow);

  let replaceShown = false;
  function setReplaceVisible(on) {
    replaceShown = !!on;
    // Inline 'flex' when shown — clearing to '' would fall back to the stylesheet's
    // `.oe-find__row--replace { display: none }` and stay hidden (the row is a
    // flex row like the find row). This was the "can't reach Replace" root cause.
    repRow.style.display = replaceShown ? 'flex' : 'none';
    repToggle.classList.toggle('oe-find__toggle--on', replaceShown);
    repToggle.setAttribute('aria-pressed', String(replaceShown));
  }
  // FR1: the toggle flips the replace row and moves focus into it when shown.
  repToggle.addEventListener('click', () => {
    setReplaceVisible(!replaceShown);
    if (replaceShown) { try { replaceInput.focus(); } catch { /* ignore */ } }
    else { try { findInput.focus(); } catch { /* ignore */ } }
  });
  // FR2: Ctrl/Cmd+H reveals the replace row even when focus is INSIDE the panel
  // (the editor's global Ctrl+H only fires while the editable is focused, and the
  // panel steals focus on open — so without this the shortcut was dead here).
  root.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      setReplaceVisible(true);
      try { replaceInput.focus(); } catch { /* ignore */ }
    }
  });

  return {
    node: root,
    findInput,
    replaceInput,
    setCount(cur, total) { count.textContent = `${cur}/${total}`; },
    setReplaceVisible,
    focusFind() { try { findInput.focus(); findInput.select(); } catch { /* ignore */ } },
  };
}
