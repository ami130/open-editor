/**
 * review-panel.js — the AI Review panel body (a DOM Node for editor.ui.modal).
 * Lists each suggestion (original → suggestion + reason) with Accept / Reject.
 * Accepting stages the replacement; an "Apply accepted" button commits them all
 * to the reviewed text via the supplied onApply callback. Theme-aware.
 *
 * Pure-ish builder: buildReviewPanel(doc, { suggestions, onApply }) → { node }.
 */
const STYLE_ID = 'oe-ai-review-styles';
const CSS = `
.oe-ai-review { display:flex; flex-direction:column; gap:10px; min-width:360px; max-width:560px; }
.oe-ai-review__empty { color:var(--oe-fg-muted); font-size:13px; }
.oe-ai-review__list { display:flex; flex-direction:column; gap:8px; max-height:340px; overflow:auto; }
.oe-ai-review__item { border:1px solid var(--oe-border); border-radius:8px; padding:8px 10px; font-size:13px; display:flex; flex-direction:column; gap:4px; }
.oe-ai-review__item--done { opacity:.55; }
.oe-ai-review__orig { color:var(--oe-danger,#dc2626); text-decoration:line-through; }
.oe-ai-review__sugg { color:var(--oe-c-success,#16a34a); }
.oe-ai-review__reason { color:var(--oe-fg-muted); font-size:12px; }
.oe-ai-review__row { display:flex; gap:6px; margin-top:2px; }
.oe-ai-review__btn { font-size:11.5px; padding:2px 10px; border-radius:5px; cursor:pointer; border:1px solid var(--oe-border); background:transparent; color:var(--oe-panel-fg); }
.oe-ai-review__btn--accept { border-color:var(--oe-c-success,#16a34a); color:var(--oe-c-success,#16a34a); }
.oe-ai-review__apply { align-self:flex-end; padding:7px 14px; border-radius:6px; border:1px solid var(--oe-primary,#2563eb); background:var(--oe-primary,#2563eb); color:#fff; font-size:13px; cursor:pointer; }
.oe-ai-review__apply:disabled { opacity:.5; cursor:default; }
`;

function el(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function injectStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID; s.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(s);
}

export function buildReviewPanel(doc, { suggestions, onApply }) {
  injectStyle(doc);
  const root = el(doc, 'div', 'oe-ai-review');
  root.setAttribute('data-oe-ai-review', '');

  if (!suggestions.length) {
    root.appendChild(el(doc, 'div', 'oe-ai-review__empty', 'No suggestions — the text looks good.'));
    return { node: root };
  }

  const list = el(doc, 'div', 'oe-ai-review__list');
  const accepted = new Set();
  const apply = el(doc, 'button', 'oe-ai-review__apply', 'Apply accepted');
  apply.type = 'button';
  apply.disabled = true;

  suggestions.forEach((s, i) => {
    const item = el(doc, 'div', 'oe-ai-review__item');
    item.appendChild(el(doc, 'div', 'oe-ai-review__orig', s.original));
    item.appendChild(el(doc, 'div', 'oe-ai-review__sugg', s.suggestion));
    if (s.reason) item.appendChild(el(doc, 'div', 'oe-ai-review__reason', s.reason));
    const row = el(doc, 'div', 'oe-ai-review__row');
    const acc = el(doc, 'button', 'oe-ai-review__btn oe-ai-review__btn--accept', 'Accept');
    const rej = el(doc, 'button', 'oe-ai-review__btn', 'Reject');
    acc.type = 'button'; rej.type = 'button';
    acc.addEventListener('click', () => {
      accepted.add(i); item.classList.add('oe-ai-review__item--done');
      apply.disabled = accepted.size === 0;
    });
    rej.addEventListener('click', () => {
      accepted.delete(i); item.classList.add('oe-ai-review__item--done');
      apply.disabled = accepted.size === 0;
    });
    row.appendChild(acc); row.appendChild(rej);
    item.appendChild(row);
    list.appendChild(item);
  });

  apply.addEventListener('click', () => {
    const chosen = suggestions.filter((_s, i) => accepted.has(i));
    if (chosen.length && typeof onApply === 'function') onApply(chosen);
  });

  root.appendChild(list);
  root.appendChild(apply);
  return { node: root };
}
