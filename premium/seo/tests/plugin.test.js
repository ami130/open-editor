/**
 * seo plugin — gated activation, headless analyzeSeo(), and the panel modal
 * flow, driven through the REAL core PluginManager + a stub modal.
 */
import { describe, it, expect } from 'vitest';
import { createSeoPlugin, FEATURE_ID } from '../src/index.js';
import { PluginManager } from '../../../packages/core/src/plugins/plugin-manager.js';

const ALLOW = { manager: { gate: () => ({ allowed: true, reason: 'granted' }) } };
const DENY  = { manager: { gate: () => ({ allowed: false, reason: 'no-license' }) } };

function makeEditor(html = '<h1>Title</h1><p>' + 'word '.repeat(320) + 'seo</p>') {
  const listeners = new Map();
  const modal = { opened: null, open(cfg) { this.opened = cfg; }, close() {} };
  const editable = document.createElement('div');
  editable.innerHTML = html;
  const editor = {
    _wrapper: document.createElement('div'),
    _config: {}, _destroyed: false, _iframeDoc: null,
    ui: { modal },
    getHTML: () => html,
    getEditorElement: () => editable,
    on(ev, fn) { (listeners.get(ev) || listeners.set(ev, []).get(ev)).push(fn); },
    off(ev, fn) { const a = listeners.get(ev) || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    emit(ev, p) { for (const fn of [...(listeners.get(ev) || [])]) fn(p); },
    logger: null, toolbar: null,
  };
  document.body.appendChild(editor._wrapper);
  return editor;
}

describe('seo — feature id', () => {
  it('requires seo', () => expect(FEATURE_ID).toBe('seo'));
});

describe('seo — granted', () => {
  it('installs, contributes a read-only-exempt button, exposes editor.analyzeSeo', () => {
    const editor = makeEditor();
    const pm = new PluginManager(editor); editor.plugins = pm;
    pm.install(createSeoPlugin(ALLOW));
    expect(pm.isInstalled('seo')).toBe(true);
    expect(typeof editor.analyzeSeo).toBe('function');
    expect(pm.get('seo').getToolbarButtons()[0]).toMatchObject({ name: 'seo', readOnlyExempt: true });
  });

  it('analyzeSeo() returns a report reflecting the live content', () => {
    const editor = makeEditor();
    createSeoPlugin(ALLOW).install(editor);
    const r = editor.analyzeSeo({ keyword: 'seo' });
    expect(r.wordCount).toBeGreaterThan(300);
    expect(r.headings.length).toBe(1);
    expect(r.keyword.count).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it('SEO-8 — in full-page context the title falls back to the document H1', () => {
    const editor = makeEditor('<h1>Doc Title From H1</h1><p>body text here</p>');
    createSeoPlugin(ALLOW, { contentContext: 'full-page' }).install(editor);
    expect(editor.analyzeSeo().snippet.title).toBe('Doc Title From H1');
  });
  it('SEO-8b — in the default body-fragment context an in-body H1 is NOT the page title', () => {
    const editor = makeEditor('<h1>In-body H1</h1><p>body text here</p>');
    createSeoPlugin(ALLOW).install(editor);
    // no host title configured → title is unset (not the in-body H1)
    expect(editor.analyzeSeo().snippet.title).toBe('Untitled document');
    // a host-configured title is always honored
    const editor2 = makeEditor('<h1>In-body H1</h1><p>body</p>');
    createSeoPlugin(ALLOW, { title: 'Real Page Title' }).install(editor2);
    expect(editor2.analyzeSeo().snippet.title).toBe('Real Page Title');
  });

  it('SEO-1 — keyword + meta persist across calls (survive panel reopen)', () => {
    const editor = makeEditor();
    createSeoPlugin(ALLOW).install(editor);
    // First call sets keyword + meta (as the panel would on keystroke).
    editor.analyzeSeo({ keyword: 'seo', metaDescription: 'x'.repeat(130) });
    // A later call with NO opts (as reopening the panel then reading) keeps them.
    const r = editor.analyzeSeo();
    expect(r.keyword.keyword).toBe('seo');
    expect(r.meta.length).toBe(130);
  });

  it('re-reads the LIVE editor each call (not a stale snapshot)', () => {
    let html = '<p>short</p>';
    const editor = makeEditor();
    editor.getHTML = () => html;
    createSeoPlugin(ALLOW).install(editor);
    expect(editor.analyzeSeo().wordCount).toBe(1);
    html = '<p>one two three</p>';
    expect(editor.analyzeSeo().wordCount).toBe(3);
  });

  it('the toolbar button opens the panel in a modal and emits afterCommand', () => {
    const editor = makeEditor();
    let cmd = null; editor.on('afterCommand', (p) => { cmd = p.command; });
    const spec = createSeoPlugin(ALLOW); spec.install(editor);
    spec.getToolbarButtons()[0].onClick();
    expect(editor.ui.modal.opened).toBeTruthy();
    expect(editor.ui.modal.opened.title).toBe('SEO Analysis');
    expect(editor.ui.modal.opened.body.getAttribute('data-oe-seo-panel')).toBe('');
    expect(cmd).toBe('seoAnalyze');
  });

  it('panel inputs re-run analysis live (typing a keyword updates the checks, debounced)', async () => {
    const editor = makeEditor('<h1>T</h1><p>alpha beta gamma delta</p>');
    const spec = createSeoPlugin(ALLOW); spec.install(editor);
    spec.getToolbarButtons()[0].onClick();
    const panel = editor.ui.modal.opened.body;
    const kw = panel.querySelector('.oe-seo__input');
    // Before: no keyword check present.
    expect(panel.textContent).not.toContain('Keyword');
    kw.value = 'alpha';
    kw.dispatchEvent(new window.Event('input'));
    // Re-analysis is debounced (~180ms); wait past it, then assert.
    await new Promise((r) => setTimeout(r, 250));
    expect(panel.textContent).toContain('Keyword');
  });

  it('panel exposes dual SEO + Readability scores and groups findings', () => {
    const editor = makeEditor('<h1>T</h1><p>' + 'word '.repeat(320) + '</p>');
    const spec = createSeoPlugin(ALLOW); spec.install(editor);
    spec.getToolbarButtons()[0].onClick();
    const panel = editor.ui.modal.opened.body;
    // two score gauges, each with an aria-label
    const gauges = panel.querySelectorAll('.oe-seo__gauge');
    expect(gauges.length).toBe(2);
    expect(gauges[0].getAttribute('aria-label')).toMatch(/SEO score \d+ out of 100/);
    expect(gauges[1].getAttribute('aria-label')).toMatch(/Readability score \d+ out of 100/);
    // findings live region + grouped section labels
    expect(panel.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(panel.textContent).toMatch(/Good \(\d+\)/);
  });

  it('inputs are programmatically labelled (for/id) for screen readers', () => {
    const editor = makeEditor('<p>hi</p>');
    const spec = createSeoPlugin(ALLOW); spec.install(editor);
    spec.getToolbarButtons()[0].onClick();
    const panel = editor.ui.modal.opened.body;
    const kw = panel.querySelector('.oe-seo__input');
    const label = panel.querySelector(`label[for="${kw.id}"]`);
    expect(kw.id).toBeTruthy();
    expect(label).not.toBeNull();
    expect(label.textContent).toContain('Focus keyword');
  });

  it('shows an empty state and hides findings for a blank document', () => {
    const editor = makeEditor('<p></p>');
    const spec = createSeoPlugin(ALLOW); spec.install(editor);
    spec.getToolbarButtons()[0].onClick();
    const panel = editor.ui.modal.opened.body;
    expect(panel.querySelector('.oe-seo__empty').style.display).toBe('');
    // no findings groups rendered when empty
    expect(panel.textContent).not.toMatch(/Problems \(/);
  });

  it('panel renders the search-snippet preview and related-phrase chips', () => {
    const editor = makeEditor('<h1>T</h1><p>' + 'rich text editor and rich text tools '.repeat(4) + '</p>');
    editor._config.documentTitle = 'My Great Page Title Here';
    const spec = createSeoPlugin(ALLOW); spec.install(editor);
    spec.getToolbarButtons()[0].onClick();
    const panel = editor.ui.modal.opened.body;
    expect(panel.querySelector('.oe-seo__snippet')).not.toBeNull();
    expect(panel.querySelector('.oe-seo__snippet-title').textContent).toContain('My Great Page Title');
    // repeated bigram "rich text" surfaces as a related chip
    expect(panel.textContent).toContain('rich text');
  });

  it('destroy removes the analyzeSeo handle', () => {
    const editor = makeEditor();
    const spec = createSeoPlugin(ALLOW); spec.install(editor);
    spec.destroy();
    expect(editor.analyzeSeo).toBeUndefined();
  });
});

describe('seo — denied (graceful degrade)', () => {
  it('no-op stub: no analyzeSeo, upgrade notice shown, editor untouched', () => {
    const editor = makeEditor();
    const pm = new PluginManager(editor); editor.plugins = pm;
    pm.install(createSeoPlugin(DENY));
    expect(pm.isInstalled('seo')).toBe(true);
    expect(editor.analyzeSeo).toBeUndefined();
    expect(editor._wrapper.querySelector('[data-oe-premium-notice]')).not.toBeNull();
  });
});
