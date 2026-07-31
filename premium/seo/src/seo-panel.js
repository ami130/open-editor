/**
 * seo-panel.js — renders an analyzeSeo() report into a DOM Node for the modal
 * body. Read-only view + two live inputs (focus keyword, meta description)
 * that re-run the analysis against the CURRENT editor content on each edit
 * (debounced).
 *
 * Pure-ish builder: `buildSeoPanel(doc, { analyze, initial }) → { node }`,
 * where `analyze({keyword, metaDescription})` returns a fresh report (the
 * plugin supplies it, closing over the live editor). No editor import here.
 *
 * Theme-aware: colors come from the editor's CSS variables (same tokens the
 * core surfaces use), so the panel follows light/dark automatically. The panel
 * mirrors best-in-class SEO sidebars: dual SEO/Readability scores, a Google
 * snippet preview, and findings grouped Problems → Improvements → Good with a
 * three-state (problem/improvement/good) traffic-light per check.
 */

const STYLE_ID = 'oe-seo-panel-styles';

const CSS = `
.oe-seo { display: flex; flex-direction: column; gap: 14px; min-width: 320px; max-width: 460px; }
.oe-seo__scores { display: flex; gap: 10px; }
.oe-seo__score-card { flex: 1; display: flex; align-items: center; gap: 10px; border: 1px solid var(--oe-border); border-radius: 10px; padding: 10px 12px; }
.oe-seo__gauge {
  width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px; color: #fff;
}
.oe-seo__score-meta { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oe-seo__score-name { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: var(--oe-fg-muted); }
.oe-seo__score-label { font-size: 12.5px; color: var(--oe-panel-fg); }
.oe-seo__fields { display: flex; flex-direction: column; gap: 8px; }
.oe-seo__field { display: flex; flex-direction: column; gap: 4px; }
.oe-seo__label { font-size: 12px; font-weight: 600; color: var(--oe-panel-fg); display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.oe-seo__counter { font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--oe-fg-muted); }
.oe-seo__counter--warn { color: var(--oe-c-warning, #d97706); }
.oe-seo__input, .oe-seo__textarea {
  padding: 7px 9px; border: 1.5px solid var(--oe-border-strong); border-radius: 6px;
  font-size: 13px; color: var(--oe-panel-fg); background: var(--oe-bg); outline: none; width: 100%;
  box-sizing: border-box; font-family: inherit;
}
.oe-seo__textarea { resize: vertical; min-height: 46px; line-height: 1.4; }
.oe-seo__input:focus, .oe-seo__textarea:focus { border-color: var(--oe-primary); }
.oe-seo__stats { display: flex; gap: 16px; font-size: 12px; color: var(--oe-fg-muted); flex-wrap: wrap; }
.oe-seo__stats b { color: var(--oe-panel-fg); font-variant-numeric: tabular-nums; }
.oe-seo__empty { font-size: 13px; color: var(--oe-fg-muted); padding: 8px 0; line-height: 1.5; }
.oe-seo__group { display: flex; flex-direction: column; gap: 6px; }
.oe-seo__checks { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; max-height: 300px; overflow-y: auto; }
.oe-seo__check { display: flex; gap: 8px; font-size: 12.5px; line-height: 1.45; }
.oe-seo__check-icon { flex-shrink: 0; font-weight: 700; width: 1.1em; text-align: center; }
.oe-seo__check--good .oe-seo__check-icon { color: var(--oe-c-success, #16a34a); }
.oe-seo__check--improve .oe-seo__check-icon { color: var(--oe-c-warning, #d97706); }
.oe-seo__check--problem .oe-seo__check-icon { color: var(--oe-danger, #dc2626); }
.oe-seo__check--na .oe-seo__check-icon { color: var(--oe-fg-muted); }
.oe-seo__check--na .oe-seo__check-text { color: var(--oe-fg-muted); }
.oe-seo__check-text { color: var(--oe-panel-fg); }
.oe-seo__hint { color: var(--oe-fg-muted); }
.oe-seo__section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--oe-fg-muted); margin-top: 4px; }
.oe-seo__snippet { border: 1px solid var(--oe-border); border-radius: 8px; padding: 10px 12px; background: var(--oe-bg); }
.oe-seo__snippet-title { color: #1a0dab; font-size: 15px; line-height: 1.3; }
.oe-seo__snippet-url { color: #006621; font-size: 12px; }
.oe-seo__snippet-desc { color: var(--oe-panel-fg); font-size: 12.5px; line-height: 1.4; }
.oe-seo__related { display: flex; flex-wrap: wrap; gap: 6px; }
.oe-seo__chip { font-size: 11.5px; padding: 2px 8px; border-radius: 999px; background: var(--oe-bg-secondary, var(--oe-bg-hover)); color: var(--oe-panel-fg); border: 1px solid var(--oe-border); }
:root[data-theme="dark"] .oe-seo__snippet-title, .oe-seo--dark .oe-seo__snippet-title { color: #8ab4f8; }
:root[data-theme="dark"] .oe-seo__snippet-url, .oe-seo--dark .oe-seo__snippet-url { color: #6ee7a8; }
@media (prefers-color-scheme: dark) {
  .oe-seo__snippet-title { color: #8ab4f8; }
  .oe-seo__snippet-url { color: #6ee7a8; }
}
@media (max-width: 420px) {
  .oe-seo { min-width: 0; }
  .oe-seo__scores { flex-direction: column; }
}
`;

let uid = 0;
const nextId = () => `oe-seo-${++uid}`;

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

function scoreWord(score) {
  return score >= 75 ? 'Good' : score >= 45 ? 'Needs work' : 'Poor';
}

// A check's visual tier: not-applicable is neutral ("–", grey); a passing check
// is "good"; a failing SCORED check is a "problem" (red); a failing UNSCORED
// guidance check is an "improvement" (amber). Four states, so a doc is never
// credited for content it doesn't contain.
function checkTier(c) {
  if (c.na) return 'na';
  if (c.ok) return 'good';
  return c.scored ? 'problem' : 'improve';
}
const TIER_ICON = { good: '✓', improve: '!', problem: '✕', na: '–' };

export function buildSeoPanel(doc, { analyze, initial = {} }) {
  injectStyle(doc);
  const root = el(doc, 'div', 'oe-seo');
  root.setAttribute('data-oe-seo-panel', '');

  // ── Dual score cards (SEO + Readability) ──
  const scores = el(doc, 'div', 'oe-seo__scores');
  const makeCard = (name) => {
    const card = el(doc, 'div', 'oe-seo__score-card');
    const gauge = el(doc, 'div', 'oe-seo__gauge');
    gauge.setAttribute('role', 'img');
    const meta = el(doc, 'div', 'oe-seo__score-meta');
    const nameEl = el(doc, 'div', 'oe-seo__score-name', name);
    const label = el(doc, 'div', 'oe-seo__score-label');
    meta.appendChild(nameEl); meta.appendChild(label);
    card.appendChild(gauge); card.appendChild(meta);
    scores.appendChild(card);
    return { gauge, label };
  };
  const seoCard = makeCard('SEO');
  const readCard = makeCard('Readability');

  // ── Inputs (labelled + live char counters) ──
  const fields = el(doc, 'div', 'oe-seo__fields');

  const kwId = nextId();
  const kwField = el(doc, 'div', 'oe-seo__field');
  const kwLabel = el(doc, 'label', 'oe-seo__label');
  kwLabel.setAttribute('for', kwId);
  kwLabel.appendChild(doc.createTextNode('Focus keyword'));
  const kwInput = el(doc, 'input', 'oe-seo__input');
  kwInput.type = 'text';
  kwInput.id = kwId;
  kwInput.value = initial.keyword || '';
  kwInput.setAttribute('placeholder', 'e.g. rich text editor');
  kwField.appendChild(kwLabel);
  kwField.appendChild(kwInput);

  const metaId = nextId();
  const metaField = el(doc, 'div', 'oe-seo__field');
  const metaLabel = el(doc, 'label', 'oe-seo__label');
  metaLabel.setAttribute('for', metaId);
  metaLabel.appendChild(doc.createTextNode('Meta description'));
  const metaCounter = el(doc, 'span', 'oe-seo__counter');
  metaLabel.appendChild(metaCounter);
  const metaInput = el(doc, 'textarea', 'oe-seo__textarea');
  metaInput.id = metaId;
  metaInput.rows = 2;
  metaInput.value = initial.metaDescription || '';
  metaInput.setAttribute('placeholder', 'Recommended: 120–158 characters');
  metaField.appendChild(metaLabel);
  metaField.appendChild(metaInput);

  fields.appendChild(kwField);
  fields.appendChild(metaField);

  const stats = el(doc, 'div', 'oe-seo__stats');
  const emptyState = el(doc, 'div', 'oe-seo__empty', 'Start writing to see your SEO and readability analysis.');
  emptyState.style.display = 'none';

  // Google-style search snippet preview.
  const snipLabel = el(doc, 'div', 'oe-seo__section-label', 'Search preview');
  const snippet = el(doc, 'div', 'oe-seo__snippet');
  const snipTitle = el(doc, 'div', 'oe-seo__snippet-title');
  const snipUrl = el(doc, 'div', 'oe-seo__snippet-url');
  const snipDesc = el(doc, 'div', 'oe-seo__snippet-desc');
  snippet.appendChild(snipUrl);
  snippet.appendChild(snipTitle);
  snippet.appendChild(snipDesc);

  // Findings — grouped Problems / Improvements / Good. A polite live region so
  // screen readers hear the summary when the analysis updates.
  const findings = el(doc, 'div', 'oe-seo__group');
  findings.setAttribute('aria-live', 'polite');
  findings.setAttribute('aria-atomic', 'false');

  // Related-term suggestions (honestly labelled: these are the doc's own
  // most-repeated phrases, not external semantic suggestions).
  const relLabel = el(doc, 'div', 'oe-seo__section-label', 'Most-used phrases');
  const related = el(doc, 'div', 'oe-seo__related');

  root.appendChild(scores);
  root.appendChild(fields);
  root.appendChild(stats);
  root.appendChild(emptyState);
  root.appendChild(snipLabel);
  root.appendChild(snippet);
  root.appendChild(findings);
  root.appendChild(relLabel);
  root.appendChild(related);

  function paintGauge(card, score, name) {
    if (score == null) {
      // Nothing to assess yet — neutral, not a confident 100.
      card.gauge.textContent = '–';
      card.gauge.style.background = 'var(--oe-fg-muted, #6b7280)';
      card.label.textContent = 'N/A';
      card.gauge.setAttribute('aria-label', `${name} score not available — not enough content yet`);
      return;
    }
    card.gauge.textContent = String(score);
    card.gauge.style.background = scoreColor(score);
    card.label.textContent = scoreWord(score);
    card.gauge.setAttribute('aria-label', `${name} score ${score} out of 100 — ${scoreWord(score)}`);
  }

  function renderGroup(list, labelText) {
    if (!list.length) return;
    findings.appendChild(el(doc, 'div', 'oe-seo__section-label', labelText));
    const ul = el(doc, 'ul', 'oe-seo__checks');
    for (const c of list) {
      const tier = checkTier(c);
      const li = el(doc, 'li', `oe-seo__check oe-seo__check--${tier}`);
      const icon = el(doc, 'span', 'oe-seo__check-icon', TIER_ICON[tier]);
      icon.setAttribute('aria-hidden', 'true');
      li.appendChild(icon);
      const txt = el(doc, 'span', 'oe-seo__check-text', c.label);
      // Show the corrective hint only for a real, applicable failure — never on
      // an N/A row (it has nothing to fix) or a passing one.
      if (!c.na && !c.ok && c.hint) {
        txt.appendChild(doc.createTextNode(' — '));
        txt.appendChild(el(doc, 'span', 'oe-seo__hint', c.hint));
      }
      li.appendChild(txt);
      ul.appendChild(li);
    }
    findings.appendChild(ul);
  }

  function render(report) {
    if (!report) return;
    // Pass the raw category score (may be null → gauge shows "N/A"). Do NOT
    // fall back to a confident number when the category has nothing to assess.
    paintGauge(seoCard, report.seoScore, 'SEO');
    paintGauge(readCard, report.readabilityScore, 'Readability');

    // Meta char counter (turns amber outside the 120–158 band, ignoring empty).
    const mlen = metaInput.value.trim().length;
    metaCounter.textContent = `${mlen}/158`;
    metaCounter.className = 'oe-seo__counter' + ((mlen > 0 && (mlen < 120 || mlen > 158)) ? ' oe-seo__counter--warn' : '');

    stats.textContent = '';
    const stat = (label, val) => {
      const s = el(doc, 'span');
      s.appendChild(doc.createTextNode(`${label}: `));
      s.appendChild(el(doc, 'b', null, String(val)));
      stats.appendChild(s);
    };
    stat('Words', report.wordCount);
    stat('Headings', report.headings.length);
    stat('Grade', report.readability.grade || 0);
    stat('Read time', `${report.readability.readingTime || 0} min`);

    // Empty-state: no content yet → show a hint, hide the (meaningless) findings.
    const isEmpty = report.wordCount === 0;
    emptyState.style.display = isEmpty ? '' : 'none';

    if (report.snippet) {
      snipTitle.textContent = report.snippet.title;
      snipUrl.textContent = report.snippet.url;
      snipDesc.textContent = report.snippet.description;
    }

    // Group the checks: Problems (failing + scored), Improvements (failing +
    // unscored guidance), Good (passing). Most-actionable first.
    findings.textContent = '';
    if (!isEmpty) {
      const problems = report.checks.filter((c) => !c.na && !c.ok && c.scored);
      const improvements = report.checks.filter((c) => !c.na && !c.ok && !c.scored);
      const good = report.checks.filter((c) => !c.na && c.ok);
      const na = report.checks.filter((c) => c.na);
      renderGroup(problems, `Problems (${problems.length})`);
      renderGroup(improvements, `Improvements (${improvements.length})`);
      renderGroup(good, `Good (${good.length})`);
      renderGroup(na, `Not applicable (${na.length})`);
    }

    related.textContent = '';
    const phrases = report.wordCount === 0 ? [] : (report.related || []);
    relLabel.style.display = phrases.length ? '' : 'none';
    for (const p of phrases) related.appendChild(el(doc, 'span', 'oe-seo__chip', `${p.phrase} (${p.count})`));
  }

  function runAnalysis() {
    render(analyze({
      keyword: kwInput.value,
      metaDescription: metaInput.value,
      title: initial.title,
    }));
  }

  // Debounce live re-analysis so a large document doesn't re-parse on every
  // keystroke. ~180ms feels instant but coalesces bursts of typing.
  let timer = null;
  const debounced = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; runAnalysis(); }, 180);
  };
  kwInput.addEventListener('input', debounced);
  metaInput.addEventListener('input', debounced);

  runAnalysis(); // initial render (synchronous)

  return { node: root, refresh: runAnalysis, focusInput: () => kwInput.focus() };
}
