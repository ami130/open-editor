import { OpenEditor, VERSION, createImagePlugin, createLinkPlugin, createTablePlugin, createSpellcheckPlugin, createSpecialCharsPlugin, createEmojiPlugin, createPreviewPlugin, createFormatPainterPlugin, createResizeEditorPlugin, createFindReplacePlugin, createMediaPlugin, createCodeBlockPlugin, createSourcePlugin, createSlashCommandPlugin, createAutoformatPlugin, createMentionsPlugin, createBlockDragPlugin, createTodoListPlugin, createBookmarkPlugin, createSpeechPlugin, createHorizontalRulePlugin } from 'openeditor-text';
import { localeEs, localeFr, localeDe, localeAr } from 'openeditor-text';

// Fixture user list for the @mentions e2e (16.6.5) — a real async source.
const DEMO_USERS = [
  { id: 1, label: 'alice' },
  { id: 2, label: 'alan' },
  { id: 3, label: 'bob' },
];

document.querySelector('.pg-version').textContent = `v${VERSION}`;

/**
 * Wrap window.fetch so requests to the demo AI endpoint return a canned,
 * streamed SSE reply (no network, no keys). Everything else passes through.
 * Purely a demo shim — real integrations use a real endpoint, not this.
 */
function installDemoAiEndpoint(url) {
  if (typeof window === 'undefined' || window.__demoAiInstalled) return;
  window.__demoAiInstalled = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const target = typeof input === 'string' ? input : (input && input.url);
    if (target !== url) return realFetch(input, init);
    let prompt = '';
    try { prompt = JSON.parse((init && init.body) || '{}').prompt || ''; } catch { /* ignore */ }
    // A believable canned reply: echo a short transformed version of the input.
    const src = (prompt.split(/\n\n/).pop() || '').trim().slice(0, 400);
    const langMatch = prompt.match(/into (\w[\w()\s]*?)\./i);
    const reply = langMatch
      ? `[${langMatch[1].trim()}] ${src}`      // translate: prefix with target lang
      : (src ? `${src} (AI-revised)` : 'AI demo response.');
    const enc = new TextEncoder();
    // Stream a few word chunks as data: {"delta": "..."} then [DONE].
    const words = reply.split(/(\s+)/);
    const lines = words.map((w) => `data: ${JSON.stringify({ delta: w })}\n\n`).concat('data: [DONE]\n\n');
    let i = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (i < lines.length) { controller.enqueue(enc.encode(lines[i++])); }
        else { controller.close(); }
      },
    });
    return Promise.resolve(new Response(stream, {
      status: 200, headers: { 'Content-Type': 'text/event-stream' },
    }));
  };
}

// ── DEMO AI endpoint ──────────────────────────────────────────────────────
// The AI features (Quick Actions / Translate / Chat / Review) are BYO-endpoint:
// the editor POSTs { prompt, system } to `aiEndpoint` and streams the reply. It
// ships with NO provider/key by design. For the DEMO we point it at a sentinel
// URL and intercept it below with a canned streaming reply, so the AI buttons
// visibly work with zero setup and zero API keys. In a real integration you'd
// set aiEndpoint to YOUR server/proxy (which holds the API key) in front of an
// LLM — e.g. Groq's free OpenAI-compatible API. NEVER put an API key here in
// client code; it would be public. See premium/ai/README.md.
// AI is DISABLED for this product (no-AI launch). We do NOT wire aiEndpoint, so
// the editor's AI surface stays inert and no AI buttons appear anywhere in the
// playground — matching what a real customer sees. (The demo AI shim + endpoint
// are kept above but intentionally unused; re-enable by passing aiEndpoint below.)
const DEMO_AI_ENDPOINT = '/__demo_ai__';
void installDemoAiEndpoint; void DEMO_AI_ENDPOINT; // retained for reference; not installed (no AI)

const editor = new OpenEditor('#editor', {
  debug: false, // was true — kept the public demo console quiet (no per-event spam)
  placeholder: 'Start typing…',
  minHeight: 500,
  defaultContent: '',
  // aiEndpoint intentionally omitted — no AI in this product.
  imageAllowDataUri: true,
  tableAvailableClasses: [
    { value: 'table-bordered', label: 'Bordered' },
    { value: 'table-striped', label: 'Striped' },
  ],
  mentions: {
    source: (query) => Promise.resolve(
      DEMO_USERS.filter((u) => u.label.toLowerCase().includes((query || '').toLowerCase()))
    ),
  },
});

// Expose for Playwright tests immediately — 'ready' fires synchronously
// during construction so an on('ready') handler registered here would miss it.
window.__openEditorInstance = editor;
// Constructor exposed for the memory-leak e2e (16.5.6): create/destroy cycles.
window.__OpenEditor = OpenEditor;
// 17.11 — locale packs exposed for the RTL/i18n e2e (locale-rtl.test.js).
window.__OpenEditorLocales = { es: localeEs, fr: localeFr, de: localeDe, ar: localeAr };
window.__playgroundFactories = { todo: createTodoListPlugin, bookmark: createBookmarkPlugin };

// Phase 22 gap #11 — expose the REAL offline verifier so an e2e can prove the
// ES256/WebCrypto verify path works in real browsers (Chromium/Firefox/WebKit),
// the algorithm bet behind PHASE-22-DESIGN.md. The entitlements package is
// browser-safe ESM and imports nothing from core, so exposing it here does not
// couple it to the editor — it's test-surface only.
import { verifyLicense, importEs256PublicKey, REASON } from '../../packages/entitlements/src/index.js';
window.__entitlements = { verifyLicense, importEs256PublicKey, REASON };

// Install plugins immediately — 'ready' already fired synchronously above.
// Use the factory so each editor instance gets its own plugin state.
editor.plugins.install(createImagePlugin());
editor.plugins.install(createLinkPlugin());
editor.plugins.install(createTablePlugin());
editor.plugins.install(createSpellcheckPlugin());
editor.plugins.install(createSpecialCharsPlugin());
editor.plugins.install(createEmojiPlugin());
editor.plugins.install(createPreviewPlugin());
editor.plugins.install(createFormatPainterPlugin());
editor.plugins.install(createResizeEditorPlugin());
editor.plugins.install(createFindReplacePlugin());
editor.plugins.install(createMediaPlugin());
editor.plugins.install(createCodeBlockPlugin());
editor.plugins.install(createSourcePlugin());
editor.plugins.install(createSlashCommandPlugin());
editor.plugins.install(createAutoformatPlugin());
editor.plugins.install(createMentionsPlugin());
editor.plugins.install(createBlockDragPlugin());
editor.plugins.install(createTodoListPlugin());
editor.plugins.install(createBookmarkPlugin());
editor.plugins.install(createSpeechPlugin()); // dictation (mic) — free, browser Web Speech API; button auto-hides where unsupported
editor.plugins.install(createHorizontalRulePlugin()); // click an <hr> to restyle it (color/style/thickness)

// Phase 19 foundation — dev license PIPELINE (the visible dev license bar was
// removed permanently). Headless: auto-applies a full-grant dev license so all
// premium features show in the toolbar, and exposes window.__premium for e2e.
import { initPremiumPanel } from './src/premium-panel.js';
initPremiumPanel(editor);

// Phase 5b — REAL backend-issued license verification PIPELINE (the visible real
// license bar was removed permanently). Headless: exposes window.__realLicense
// for manual/console testing against the backend's real published JWKS.
import { initRealLicensePanel } from './src/real-license-panel.js';
initRealLicensePanel();

editor.on('ready', () => {
  console.log('[Playground] Editor ready');
});
// (Removed the per-keystroke [onChange] HTML logger — it spammed the public
//  demo console on every edit. Re-add locally if you need to inspect output.)
