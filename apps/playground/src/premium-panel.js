/**
 * premium-panel.js — dev license switcher (Phase 19 foundation).
 *
 * Mints REAL ES256 licenses fully in-browser (WebCrypto can sign P-256, and
 * subtle.sign already emits the raw r||s JWS format), builds a premium host
 * with the matching public key, and installs the gated hello-premium plugin —
 * so the playground exercises mint → verify → gate → activate/degrade with
 * zero server and NO dev-host bypass (allowDevHost stays false; localhost
 * must pass real license mechanics here).
 *
 * Deliberately installs NOTHING on page load: the gated plugin appears only
 * when the panel (or an e2e via window.__premium) drives it, so every other
 * playground test is untouched.
 */
import { allFeatureIds, getFeature } from '../../../packages/entitlements/src/index.js';
import { createPremiumHost, resetUpgradeNotice } from '../../../premium/runtime/src/index.js';
import { createHelloPremiumPlugin } from '../../../premium/hello/src/index.js';
import { createExportPdfPlugin } from '../../../premium/export-pdf/src/index.js';
import { createExportDocxPlugin } from '../../../premium/export-docx/src/index.js';
import { createSeoPlugin } from '../../../premium/seo/src/index.js';
import { createFootnotesPlugin } from '../../../premium/footnotes/src/index.js';
import {
  createAiQuickActionsPlugin, createAiChatPlugin, createAiTranslatePlugin, createAiReviewPlugin,
} from '../../../premium/ai/src/index.js';

// Registry of installable premium feature plugins, keyed by their factory's
// plugin `name`. Each entry knows the factory + the feature id it needs, so
// the panel installs the right gated plugin for whatever the license grants.
// Every real Wave-1 feature adds one line here.
const FEATURE_PLUGINS = [
  { pluginName: 'hello-premium',   create: (host) => createHelloPremiumPlugin(host) },
  { pluginName: 'export-pdf',      create: (host) => createExportPdfPlugin(host) },
  { pluginName: 'export-docx',     create: (host) => createExportDocxPlugin(host) },
  { pluginName: 'seo',             create: (host) => createSeoPlugin(host) },
  { pluginName: 'footnotes',       create: (host) => createFootnotesPlugin(host) },
  { pluginName: 'ai-quick-actions', create: (host) => createAiQuickActionsPlugin(host) },
  { pluginName: 'ai-chat',         create: (host) => createAiChatPlugin(host) },
  { pluginName: 'ai-translate',    create: (host) => createAiTranslatePlugin(host) },
  { pluginName: 'ai-review',       create: (host) => createAiReviewPlugin(host) },
];

const te = new TextEncoder();
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (obj) => b64url(te.encode(JSON.stringify(obj)));

/** Mint a signed ES256 license with an ephemeral in-browser keypair. */
async function mintLicense(features, { ttlSeconds = 3600, domains } = {}) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const iat = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: 'pg-dev', typ: 'JWT' };
  const payload = {
    lic: `pg-${iat}`, customer: 'playground', plan: 'dev-panel',
    features, domains: domains || [location.hostname], limits: {},
    iat, exp: iat + ttlSeconds,
  };
  const input = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, te.encode(input));
  return { token: `${input}.${b64url(sig)}`, publicJwk: jwk };
}

export function initPremiumPanel(editor) {
  let currentHost = null;

  function uninstallAll() {
    for (const { pluginName } of FEATURE_PLUGINS) {
      if (editor.plugins.isInstalled(pluginName)) editor.plugins.uninstall(pluginName);
    }
  }

  async function swapPlugin(host) {
    currentHost = host;
    resetUpgradeNotice(editor);
    uninstallAll();
    // Re-license pattern: the gate decides at wrap time, so a NEW spec must
    // REPLACE the registered one — install(spec) alone would resolve the
    // stale spec still in the registry from the previous license state.
    for (const { pluginName, create } of FEATURE_PLUGINS) {
      editor.plugins.register(create(host));
      editor.plugins.install(pluginName);
    }
    renderStatus();
    return host;
  }

  /** Mint + verify + install with the given feature grants. */
  async function apply(features, opts = {}) {
    const { token, publicJwk } = await mintLicense(features, opts);
    const host = await createPremiumHost({
      license: token,
      keys: [{ kid: 'pg-dev', jwk: publicJwk }],
      hostname: location.hostname,
    });
    return swapPlugin(host);
  }

  /** Install the gated plugin with NO license at all (free tier). */
  async function installFree() {
    return swapPlugin(await createPremiumHost({ hostname: location.hostname }));
  }

  /** Remove the gated plugins + notice; back to a clean free playground. */
  function clear() {
    uninstallAll();
    resetUpgradeNotice(editor);
    currentHost = null;
    renderStatus();
  }

  // ── Panel UI ──────────────────────────────────────────────────────────────
  const panel = document.createElement('details');
  panel.className = 'pg-premium-panel';
  panel.innerHTML = `
    <summary>Premium license (dev)</summary>
    <div class="pg-premium-panel__body">
      <div class="pg-premium-panel__flags"></div>
      <div class="pg-premium-panel__actions">
        <button type="button" data-pg-premium="apply">Apply license</button>
        <button type="button" data-pg-premium="free">Install without license</button>
        <button type="button" data-pg-premium="clear">Clear</button>
      </div>
      <div class="pg-premium-panel__status" data-pg-premium-status>free tier — nothing installed</div>
    </div>`;

  const flagsEl = panel.querySelector('.pg-premium-panel__flags');
  for (const id of allFeatureIds()) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = id;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(` ${getFeature(id).title}`));
    flagsEl.appendChild(label);
  }

  /** Tick every flag box (keeps the panel UI in sync with an auto-grant). */
  function checkAllFlags(on) {
    for (const cb of flagsEl.querySelectorAll('input[type=checkbox]')) cb.checked = on;
  }

  function checkedFlags() {
    return [...flagsEl.querySelectorAll('input:checked')].map((cb) => cb.value);
  }

  function renderStatus() {
    const el = panel.querySelector('[data-pg-premium-status]');
    if (!currentHost) { el.textContent = 'free tier — nothing installed'; return; }
    const r = currentHost.result;
    const granted = currentHost.manager.grantedFeatures();
    const state = r && r.valid
      ? `license valid — granted: ${granted === '*' ? 'ALL (dev host)' : (granted.join(', ') || 'none')}`
      : `license ${r ? `invalid (${r.reason})` : 'absent'} — premium degraded`;
    const helloActive = editor._wrapper.hasAttribute('data-oe-premium-hello');
    const pdfActive = typeof editor.exportPdf === 'function';
    el.textContent = `${state} · hello-premium: ${helloActive ? 'ACTIVE' : 'inactive'}`
      + ` · export-pdf: ${pdfActive ? 'ACTIVE' : 'inactive'}`;
  }

  panel.addEventListener('click', (e) => {
    const action = e.target.getAttribute && e.target.getAttribute('data-pg-premium');
    if (action === 'apply') apply(checkedFlags());
    else if (action === 'free') installFree();
    else if (action === 'clear') clear();
  });

  const style = document.createElement('style');
  style.textContent = `
    .pg-premium-panel { margin-top: 14px; border: 1px solid #d5d9e0; border-radius: 8px; padding: 8px 12px; font-size: 13px; background: #fafbfc; }
    .pg-premium-panel summary { cursor: pointer; font-weight: 600; }
    .pg-premium-panel__flags { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 2px 12px; margin: 10px 0; }
    .pg-premium-panel__flags label { display: flex; align-items: center; gap: 6px; }
    .pg-premium-panel__actions { display: flex; gap: 8px; margin-bottom: 8px; }
    .pg-premium-panel__actions button { padding: 4px 12px; border: 1px solid #c6ccd6; border-radius: 6px; background: #fff; cursor: pointer; }
    .pg-premium-panel__status { color: #57606a; font-family: ui-monospace, monospace; font-size: 12px; }`;
  document.head.appendChild(style);
  document.querySelector('.pg-main').appendChild(panel);

  // e2e surface — the same code paths the buttons drive. `allFeatures` +
  // `applyAll` let tests grant EVERY installed plugin's flag so a "no notice"
  // assertion stays correct no matter how many feature plugins are registered.
  window.__premium = {
    apply, installFree, clear, mintLicense, host: () => currentHost, checkAllFlags,
    allFeatures: () => allFeatureIds(),
    applyAll: () => apply(allFeatureIds()),
  };

  // ── Default flow (2026-07-17): show ALL premium features in the toolbar by
  // default, so they're testable at a glance. This is NOT a gate bypass — it
  // auto-applies a full-grant dev license through the exact same
  // mint→verify→gate→install path a real purchase uses; the mechanism is
  // unchanged, only the DEFAULT license differs. Flip the default here later.
  //
  // e2e opts OUT (?nopremium) so the gate tests keep their clean, nothing-
  // installed baseline and assert grant/deny explicitly.
  const params = new URLSearchParams(location.search);
  if (!params.has('nopremium')) {
    checkAllFlags(true);
    apply(allFeatureIds());
  }
}
