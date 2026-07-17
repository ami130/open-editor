/**
 * seo-plugin.js — raw plugin spec (module-private; wrapped by the gated
 * factory in index.js). Adds a toolbar button that opens the SEO Analyzer
 * panel in a modal, plus an imperative `editor.analyzeSeo(opts)` returning the
 * report object (headless — useful for tests / server-side scoring).
 *
 * Strictly READ-ONLY: it calls editor.getHTML() and analyzes; it never mutates
 * content. Safe in readonly mode (readOnlyExempt).
 */
import { analyzeSeo } from './seo-analyze.js';
import { buildSeoPanel } from './seo-panel.js';

const SEO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6M11 8v6"/>
</svg>`;

export function rawSeoSpec(config = {}) {
  let editor = null;

  // Persist the user's focus keyword + meta description for the editor's
  // lifetime, so reopening the panel doesn't lose what they typed (SEO-1).
  const state = { keyword: config.keyword || '', metaDescription: config.metaDescription || '' };

  function docFor() {
    return editor._iframeDoc || (typeof document !== 'undefined' ? document : null);
  }

  /** The best available document title: config → documentTitle → the doc's H1. */
  function docTitle() {
    const configured = config.title || (editor && editor._config && editor._config.documentTitle);
    if (configured) return configured;
    // Fallback: the document's first H1 (what a reader would call the title).
    const el = editor && editor.getEditorElement && editor.getEditorElement();
    const h1 = el && el.querySelector && el.querySelector('h1');
    return (h1 && h1.textContent.trim()) || '';
  }

  /** Headless analysis of the current content. Uses persisted keyword/meta. */
  function analyze(opts = {}) {
    const doc = docFor();
    if (!doc || !editor) return null;
    const html = editor.getHTML ? editor.getHTML() : '';
    // Remember any keyword/meta passed in so the values survive panel reopens.
    if (typeof opts.keyword === 'string') state.keyword = opts.keyword;
    if (typeof opts.metaDescription === 'string') state.metaDescription = opts.metaDescription;
    return analyzeSeo(html, {
      title: docTitle(),
      keyword: state.keyword,
      metaDescription: state.metaDescription,
      ...opts,
    }, doc);
  }

  function open() {
    if (!editor || !editor.ui || !editor.ui.modal) return;
    const doc = docFor();
    if (!doc) return;
    const panel = buildSeoPanel(doc, {
      analyze, // closes over the LIVE editor — re-reads getHTML() each refresh
      // Seed from persisted state so reopening restores the last keyword/meta.
      initial: { keyword: state.keyword, metaDescription: state.metaDescription, title: docTitle() },
    });
    editor.ui.modal.open({ title: 'SEO Analysis', body: panel.node });
    editor.emit('afterCommand', { command: 'seoAnalyze', args: [] });
  }

  return {
    name: 'seo',
    install(ed) {
      editor = ed;
      ed.analyzeSeo = analyze;
    },
    destroy() {
      if (editor && editor.analyzeSeo === analyze) delete editor.analyzeSeo;
      editor = null;
    },
    getToolbarButtons() {
      return [{
        name: 'seo',
        type: 'button',
        icon: SEO_ICON,
        tooltip: 'SEO Analysis',
        readOnlyExempt: true, // read-only analysis: safe when the editor is locked
        onClick: () => open(),
      }];
    },
  };
}
