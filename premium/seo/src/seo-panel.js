/**
 * seo-panel.js — renders an analyzeSeo() report into a DOM Node for the modal
 * body. Read-only view + two live inputs (focus keyword, meta description)
 * that re-run the analysis against the CURRENT editor content on each edit.
 *
 * Pure-ish builder: `buildSeoPanel(doc, { analyze, initial }) → { node }`,
 * where `analyze({keyword, metaDescription})` returns a fresh report (the
 * plugin supplies it, closing over the live editor). No editor import here.
 *
 * Theme-aware: colors come from the editor's CSS variables (same tokens the
 * core surfaces use), so the panel follows light/dark automatically.
 */

const STYLE_ID = 'oe-seo-panel-styles';

const CSS = `
.oe-seo { display: flex; flex-direction: column; gap: 14px; min-width: 340px; max-width: 460px; }
.oe-seo__score-row { display: flex; align-items: center; gap: 12px; }
.oe-seo__gauge {
  width: 54px; height: 54px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 15px; color: var(--oe-primary-fg, #fff);
}
.oe-seo__score-label { font-size: 13px; color: var(--oe-fg-muted); }
.oe-seo__fields { display: flex; flex-direction: column; gap: 8px; }
.oe-seo__field { display: flex; flex-direction: column; gap: 4px; }
.oe-seo__label { font-size: 12px; font-weight: 600; color: var(--oe-panel-fg); }
.oe-seo__input {
  padding: 7px 9px; border: 1.5px solid var(--oe-border-strong); border-radius: 6px;
  font-size: 13px; color: var(--oe-panel-fg); background: var(--oe-bg); outline: none; width: 100%;
  box-sizing: border-box;
}
.oe-seo__input:focus { border-color: var(--oe-primary); }
.oe-seo__stats { display: flex; gap: 16px; font-size: 12px; color: var(--oe-fg-muted); flex-wrap: wrap; }
.oe-seo__stats b { color: var(--oe-panel-fg); font-variant-numeric: tabular-nums; }
.oe-seo__checks { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.oe-seo__check { display: flex; gap: 8px; font-size: 12.5px; line-height: 1.45; }
.oe-seo__check-icon { flex-shrink: 0; font-weight: 700; }
.oe-seo__check--ok .oe-seo__check-icon { color: var(--oe-c-success, #16a34a); }
.oe-seo__check--warn .oe-seo__check-icon { color: var(--oe-c-warning, #d97706); }
.oe-seo__check-text { color: var(--oe-panel-fg); }
.oe-seo__hint { color: var(--oe-fg-muted); }
.oe-seo__section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--oe-fg-muted); margin-top: 4px; }
.oe-seo__snippet { border: 1px solid var(--oe-border); border-radius: 8px; padding: 10px 12px; background: var(--oe-bg); }
.oe-seo__snippet-title { color: #1a0dab; font-size: 15px; line-height: 1.3; }
.oe-seo__snippet-url { color: #006621; font-size: 12px; }
.oe-seo__snippet-desc { color: var(--oe-panel-fg); font-size: 12.5px; line-height: 1.4; }
.oe-seo__related { display: flex; flex-wrap: wrap; gap: 6px; }
.oe-seo__chip { font-size: 11.5px; padding: 2px 8px; border-radius: 999px; background: var(--oe-bg-secondary, var(--oe-bg-hover)); color: var(--oe-panel-fg); border: 1px solid var(--oe-border); }
@media (prefers-color-scheme: dark) {
  .oe-seo__snippet-title { color: #8ab4f8; }
  .oe-seo__snippet-url { color: #6ee7a8; }
}
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
  s.id = STYLE_ID;
  s.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(s);
}

/** Green→amber→red gauge color by score. */
function scoreColor(score) {
  if (score >= 75) return 'var(--oe-c-success, #16a34a)';
  if (score >= 45) return 'var(--oe-c-warning, #d97706)';
  return 'var(--oe-danger, #dc2626)';
}

export function buildSeoPanel(doc, { analyze, initial = {} }) {
  injectStyle(doc);
  const root = el(doc, 'div', 'oe-seo');
  root.setAttribute('data-oe-seo-panel', '');

  // Score gauge + label
  const scoreRow = el(doc, 'div', 'oe-seo__score-row');
  const gauge = el(doc, 'div', 'oe-seo__gauge');
  const scoreLabel = el(doc, 'div', 'oe-seo__score-label');
  scoreRow.appendChild(gauge);
  scoreRow.appendChild(scoreLabel);

  // Inputs
  const fields = el(doc, 'div', 'oe-seo__fields');
  const kwField = el(doc, 'div', 'oe-seo__field');
  kwField.appendChild(el(doc, 'label', 'oe-seo__label', 'Focus keyword'));
  const kwInput = el(doc, 'input', 'oe-seo__input');
  kwInput.type = 'text';
  kwInput.value = initial.keyword || '';
  kwInput.setAttribute('placeholder', 'e.g. rich text editor');
  kwField.appendChild(kwInput);

  const metaField = el(doc, 'div', 'oe-seo__field');
  metaField.appendChild(el(doc, 'label', 'oe-seo__label', 'Meta description'));
  const metaInput = el(doc, 'input', 'oe-seo__input');
  metaInput.type = 'text';
  metaInput.value = initial.metaDescription || '';
  metaInput.setAttribute('placeholder', '120–158 characters');
  metaField.appendChild(metaInput);
  fields.appendChild(kwField);
  fields.appendChild(metaField);

  const stats = el(doc, 'div', 'oe-seo__stats');

  // Google-style search snippet preview.
  const snipLabel = el(doc, 'div', 'oe-seo__section-label', 'Search preview');
  const snippet = el(doc, 'div', 'oe-seo__snippet');
  const snipTitle = el(doc, 'div', 'oe-seo__snippet-title');
  const snipUrl = el(doc, 'div', 'oe-seo__snippet-url');
  const snipDesc = el(doc, 'div', 'oe-seo__snippet-desc');
  snippet.appendChild(snipUrl);
  snippet.appendChild(snipTitle);
  snippet.appendChild(snipDesc);

  const checks = el(doc, 'ul', 'oe-seo__checks');

  // Related-term suggestions.
  const relLabel = el(doc, 'div', 'oe-seo__section-label', 'Related phrases');
  const related = el(doc, 'div', 'oe-seo__related');

  root.appendChild(scoreRow);
  root.appendChild(fields);
  root.appendChild(stats);
  root.appendChild(snipLabel);
  root.appendChild(snippet);
  root.appendChild(checks);
  root.appendChild(relLabel);
  root.appendChild(related);

  function render(report) {
    gauge.textContent = String(report.score);
    gauge.style.background = scoreColor(report.score);
    scoreLabel.textContent = report.score >= 75 ? 'Good' : report.score >= 45 ? 'Needs work' : 'Poor';

    stats.textContent = '';
    const stat = (label, val) => {
      const s = el(doc, 'span');
      s.appendChild(doc.createTextNode(`${label}: `));
      s.appendChild(el(doc, 'b', null, String(val)));
      stats.appendChild(s);
    };
    stat('Words', report.wordCount);
    stat('Headings', report.headings.length);
    stat('Reading ease', `${report.readability.score} (${report.readability.label})`);

    // Search snippet preview.
    if (report.snippet) {
      snipTitle.textContent = report.snippet.title;
      snipUrl.textContent = report.snippet.url;
      snipDesc.textContent = report.snippet.description;
    }

    checks.textContent = '';
    for (const c of report.checks) {
      const li = el(doc, 'li', `oe-seo__check oe-seo__check--${c.ok ? 'ok' : 'warn'}`);
      li.appendChild(el(doc, 'span', 'oe-seo__check-icon', c.ok ? '✓' : '!'));
      const txt = el(doc, 'span', 'oe-seo__check-text', c.label);
      if (!c.ok && c.hint) {
        txt.appendChild(doc.createTextNode(' — '));
        txt.appendChild(el(doc, 'span', 'oe-seo__hint', c.hint));
      }
      li.appendChild(txt);
      checks.appendChild(li);
    }

    // Related phrases (n-gram suggestions).
    related.textContent = '';
    const phrases = (report.related || []);
    relLabel.style.display = phrases.length ? '' : 'none';
    for (const p of phrases) related.appendChild(el(doc, 'span', 'oe-seo__chip', `${p.phrase} (${p.count})`));
  }

  function refresh() {
    render(analyze({
      keyword: kwInput.value,
      metaDescription: metaInput.value,
      title: initial.title,
    }));
  }
  kwInput.addEventListener('input', refresh);
  metaInput.addEventListener('input', refresh);
  refresh(); // initial render

  return { node: root, refresh };
}
