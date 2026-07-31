/**
 * premium-panel.js — dev license PIPELINE (Phase 19 foundation).
 *
 * The VISIBLE dev license bar was removed from the playground page permanently
 * (2026-07-31, product decision — no license UI on the demo). The mint → verify
 * → gate → activate/degrade PIPELINE is kept here, headless, because the e2e
 * suite drives premium features through `window.__premium.*` (premium-gate, ai,
 * seo, export-pdf, export-docx specs) and the default flow auto-applies a
 * full-grant dev license so every premium feature is visible in the toolbar.
 *
 * Mints REAL ES256 licenses fully in-browser (WebCrypto signs P-256, and
 * subtle.sign already emits the raw r||s JWS format), builds a premium host with
 * the matching public key, and installs the gated plugins — zero server, NO
 * dev-host bypass (allowDevHost stays false; localhost must pass real license
 * mechanics). Installs NOTHING unless driven, so ?nopremium keeps a clean gate
 * baseline for the tests that assert grant/deny explicitly.
 */
import { allFeatureIds, getFeature } from '../../../packages/entitlements/src/index.js';
import { createPremiumHost, resetUpgradeNotice } from '../../../premium/runtime/src/index.js';
import { createHelloPremiumPlugin } from '../../../premium/hello/src/index.js';
import { createExportPdfPlugin } from '../../../premium/export-pdf/src/index.js';
import { createExportDocxPlugin } from '../../../premium/export-docx/src/index.js';
// SEO + AI are HIDDEN (product decision: not shipping SEO or AI). The plugin code
// stays intact in premium/seo + premium/ai; they are simply not registered below.
// To re-enable: re-import the factory AND add its FEATURE_PLUGINS entry.
// import { createSeoPlugin } from '../../../premium/seo/src/index.js';
// import {
//   createAiQuickActionsPlugin, createAiChatPlugin, createAiTranslatePlugin, createAiReviewPlugin,
// } from '../../../premium/ai/src/index.js';

// Registry of installable premium feature plugins, keyed by their factory's
// plugin `name`. Each entry knows the factory + the feature id it needs, so
// the pipeline installs the right gated plugin for whatever the license grants.
// Every real Wave-1 feature adds one line here.
const FEATURE_PLUGINS = [
  { pluginName: 'hello-premium',   create: (host) => createHelloPremiumPlugin(host) },
  { pluginName: 'export-pdf',      create: (host) => createExportPdfPlugin(host) },
  { pluginName: 'export-docx',     create: (host) => createExportDocxPlugin(host) },
  // SEO + AI hidden (code retained in premium/seo + premium/ai; re-enable by
  // re-importing the factory above and uncommenting its entry here):
  // { pluginName: 'seo',              create: (host) => createSeoPlugin(host) },
  // { pluginName: 'ai-quick-actions', create: (host) => createAiQuickActionsPlugin(host) },
  // { pluginName: 'ai-chat',         create: (host) => createAiChatPlugin(host) },
  // { pluginName: 'ai-translate',    create: (host) => createAiTranslatePlugin(host) },
  // { pluginName: 'ai-review',       create: (host) => createAiReviewPlugin(host) },
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
  }

  // e2e surface — the same code paths the (now-removed) dev bar drove.
  // `allFeatures` + `applyAll` let tests grant EVERY installed plugin's flag so
  // a "no notice" assertion stays correct no matter how many feature plugins are
  // registered. `checkAllFlags` is retained as a no-op (it only ticked the
  // removed panel's checkboxes) so existing e2e calls stay valid.
  window.__premium = {
    apply, installFree, clear, mintLicense, host: () => currentHost,
    checkAllFlags: () => {},
    allFeatures: () => allFeatureIds().filter((id) => { const m = getFeature(id); return m && !m.deprecated; }),
    applyAll: () => apply(allFeatureIds().filter((id) => { const m = getFeature(id); return m && !m.deprecated; })),
  };

  // ── Default flow (2026-07-17): show ALL (non-deprecated) premium features in
  // the toolbar by default, so they're testable at a glance. This is NOT a gate
  // bypass — it auto-applies a full-grant dev license through the exact same
  // mint→verify→gate→install path a real purchase uses; the mechanism is
  // unchanged, only the DEFAULT license differs.
  //
  // e2e opts OUT (?nopremium) so the gate tests keep their clean, nothing-
  // installed baseline and assert grant/deny explicitly.
  const params = new URLSearchParams(location.search);
  if (!params.has('nopremium')) {
    apply(window.__premium.allFeatures());
  }
}
