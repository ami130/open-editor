/**
 * Consumer-side type check for @openeditors/loader (§1.5 stage 4).
 *
 * This file never runs; it must COMPILE under `tsc --strict`. It exercises the
 * loader the way a real TypeScript consumer would, and its whole purpose is to
 * prove ONE claim: that engine options are typed through to the loader without
 * being re-declared. If `LoaderOptions` ever stops extending `OpenEditorConfig`,
 * the editor-config lines below stop compiling.
 */
import {
  createEditor,
  openSession,
  fetchEngine,
  clearCache,
  clearBundle,
  readLastPlan,
  getInstallId,
  isValidInstallId,
  renderFallback,
  hasFallback,
  keyFor,
  MAX_ENTRIES,
  CSP_HELP,
  type LoaderOptions,
  type DeliverySession,
  type LoaderPlugins,
} from '@openeditors/loader';
// The ENGINE's types, vendored into the published loader (the engine package
// itself is private and never published, so a consumer could not install it).
import type { OpenEditor } from 'openeditor-text-engine';

// ── The minimum a consumer must supply ───────────────────────────────────────
async function minimal(): Promise<OpenEditor> {
  return createEditor('#app', { endpoint: 'https://delivery.example.com' });
}

// ── ENGINE options flow through, untyped by hand anywhere in the loader ──────
// This is the T16 claim made checkable: adding an engine option must NOT
// require a loader release for TypeScript users to see it.
async function withEngineConfig(): Promise<OpenEditor> {
  return createEditor('#app', {
    endpoint: 'https://delivery.example.com',
    licenceKey: 'oe_live_xxx',
    // …every one of these belongs to OpenEditorConfig, not to the loader.
    placeholder: 'Start typing…',
    theme: 'auto',
    direction: 'ltr',
    defaultContent: '<p>hello</p>',
    spellcheck: true,
  });
}

// ── Callbacks must survive as FUNCTIONS, never serialised ────────────────────
async function withCallbacks(): Promise<OpenEditor> {
  return createEditor(document.querySelector('#app')!, {
    endpoint: 'https://delivery.example.com',
    onError: (err: Error) => console.error(err.message),
    autosave: { storage: 'localStorage', key: 'draft', interval: 30_000 },
  });
}

// ── Loader-only options ──────────────────────────────────────────────────────
const plugins: LoaderPlugins = 'all';
const noPlugins: LoaderPlugins = [];

async function loaderOptions(): Promise<OpenEditor> {
  return createEditor('#app', {
    endpoint: 'https://delivery.example.com',
    // Historical spelling accepted alongside `licenceKey`.
    licenseKey: 'oe_live_xxx',
    version: '1.3.0',
    installId: 'oe_0123456789abcdef0123456789abcdef',
    plugins,
    cache: false,
    fallback: 'Editor unavailable — plain text only.',
    name: 'body',
  });
}

// A typed options object can be built up before use.
const opts: LoaderOptions = {
  endpoint: 'https://delivery.example.com',
  plugins: noPlugins,
  fallback: false,
};

// ── Session, cache, install id, fallback ─────────────────────────────────────
async function lowLevel(): Promise<void> {
  const session: DeliverySession = await openSession({
    endpoint: opts.endpoint,
    licenceKey: null,
  });
  const source: string = await fetchEngine(session.engine.url, session.engine.sha256);
  const features: string[] = session.features;
  const expires: number = session.expiresAt;

  const key: string = keyFor(session.version, session.plan);
  const max: number = MAX_ENTRIES;
  const help: string = CSP_HELP;

  await clearBundle(session.version, session.plan);
  await clearCache();
  const last = await readLastPlan();
  if (last) {
    const plan: string = last.plan;
    const version: string | null = last.version;
    void plan; void version;
  }

  const id: string | null = getInstallId();
  if (isValidInstallId(id)) {
    // The type guard narrows `string | null` to `string`.
    const narrowed: string = id;
    void narrowed;
  }

  const el = document.querySelector('#app')!;
  const area: HTMLTextAreaElement | null = renderFallback(el, new Error('offline'), {
    initialValue: 'draft',
    name: 'body',
  });
  const showing: boolean = hasFallback(el);

  void source; void features; void expires; void key; void max; void help; void area; void showing;
}

void minimal; void withEngineConfig; void withCallbacks; void loaderOptions; void lowLevel;
