/**
 * index.js — the Open Editor runtime loader (execution plan §1.5).
 *
 * This is the ONLY code that lives in the customer's node_modules. The editor
 * itself is fetched at page load and never touches their disk.
 *
 *     render container
 *          → POST /delivery/session      who are you, which build, what features
 *          → GET  <engine url>           the bundle
 *          → verify SHA-256              before anything executes
 *          → blob: import                T22 — the only CSP-viable mechanism
 *          → new OpenEditor(el, config)
 *          → installAllPlugins           B3 — auto-install, opt-out available
 *          → editor live
 *
 * ─── T16: THIS FILE MUST STAY BORING ────────────────────────────────────────
 * A bug here means every customer must `npm update` — the exact friction this
 * architecture exists to remove. So anything that might plausibly change lives
 * in the DELIVERED ENGINE instead: feature logic, UI, copy, retry tuning, and
 * token refresh. The rule is simple — if a change would force customers to
 * update, it does not belong in this package.
 */
import { openSession } from './session.js';
import { fetchEngine, digestHex } from './fetch-engine.js';
import { evaluateModule, looksLikeCspDenial } from './evaluate.js';
import {
  readBundle, writeBundle, writeLastPlan, readLastPlan, clearBundle, keyFor,
} from './cache.js';
import { getInstallId } from './install-id.js';
import { readActivatedKey, writeActivatedKey } from './activated-key.js';
import { subscribeEntitlements } from './entitlement-stream.js';
import { renderFallback, removeFallback } from './fallback.js';
import { showActivatePrompt } from './activate.js';

/**
 * How long BEFORE expiry to refresh the session token (D1).
 *
 * Sized against the backend's 15-minute session TTL, not the engine's default
 * 24 hours — that default assumes a ~30-day licence token and is longer than
 * this token's whole lifetime. Three minutes leaves room for a retry or two
 * inside the window without the timer firing often.
 */
const REFRESH_LEAD_SECONDS = 180;

/** Backoff when a refresh returns no new token. Well inside the lead above. */
const REFRESH_RETRY_SECONDS = 60;

/**
 * The free plan's id, as the backend reports it (delivery/session.service.ts).
 * Used to tell an UPGRADE (free → premium, worth prompting about) from a
 * DOWNGRADE (premium → free, which must never interrupt anyone).
 */
const FREE_PLAN = 'free';

/**
 * Options the LOADER consumes. Everything else is forwarded to the engine
 * untouched, so a new engine option never requires a loader release (T16).
 *
 * Namespaced deliberately: `endpoint` and `licenceKey` could otherwise collide
 * with a future engine option and silently change its meaning.
 */
const LOADER_OPTIONS = new Set([
  'endpoint', 'licenceKey', 'licenseKey', 'version', 'installId', 'plugins', 'onError',
  'cache', 'fallback',
  // Fallback-only: the form field name the degraded textarea should carry.
  // Stripped so it does not reach the engine, which would warn about an
  // unknown config key on every load.
  'name',
]);

/**
 * Load the engine and mount an editor.
 *
 * @param {string|Element} target  selector or element to mount into
 * @param {object} options         loader options + any engine config
 * @returns {Promise<object>} the live editor instance
 */
export async function createEditor(target, options = {}) {
  const {
    endpoint,
    // Both spellings accepted: the API says `licenceKey`, but the editor's own
    // config has always said `licenseKey`, and making integrators remember
    // which is which would be a needless papercut.
    licenceKey = options.licenseKey ?? null,
    version = null,
    installId = null,
    plugins = 'all',
    onError = null,
    // Opt out with `cache: false` — some environments (kiosks, shared
    // machines, strict privacy policies) would rather not persist anything.
    cache = true,
    // `false` disables the degraded textarea; a string overrides its message.
    fallback = true,
  } = options;

  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) throw new Error(`[open-editor] mount target not found: ${target}`);

  // A retry into the same container must not sit below the previous failure's
  // textarea — and a successful load must leave no trace of one.
  removeFallback(el);

  try {
    // ─── T10: start the cache read WHILE /session is in flight ──────────────
    //
    // The loader cannot know WHICH bundle to want until /session answers, so a
    // first-ever visit is unavoidably sequential. But a returning visitor's
    // plan and version are already on disk, so the cached bundle can be read
    // CONCURRENTLY with the session request rather than after it.
    //
    // Deliberately speculative: whatever comes back is still checked against
    // the session's own version/plan/hash below, so a stale guess (a customer
    // who upgraded since their last visit) is discarded, not used. Being wrong
    // costs one wasted local read; being right removes the round-trip.
    const guess = cache ? readLastPlan(endpoint).catch(() => null) : Promise.resolve(null);
    // T18 — a stable anonymous id per browser profile, so anonymous traffic can
    // be rate limited per install and usage attributed (S1) instead of being an
    // undifferentiated per-IP flood. Falls back to null wherever storage is
    // unavailable; a missing id must never block a load.
    // §2.4 — a key handed to this browser by a previous activation claim. Used
    // only when the caller supplied none of their own, so an explicitly
    // configured key always wins over a remembered one.
    const effectiveKey = licenceKey ?? readActivatedKey(endpoint);
    const sessionPromise = openSession({
      endpoint, licenceKey: effectiveKey, version, installId: installId ?? getInstallId(),
    });
    const speculative = guess.then((last) => (
      last?.plan && last?.version
        ? readBundle(last.version, last.plan, null, endpoint).then(
          (source) => (source ? { ...last, source } : null),
          () => null,
        )
        : null
    ));

    const session = await sessionPromise;

    // Resolve the bundle URL against the DELIVERY endpoint, not the page.
    // /session may legitimately return a relative path (same-origin or
    // local development, where DELIVERY_PUBLIC_BASE_URL is unset); left alone,
    // the browser would resolve it against the CUSTOMER'S domain and 404 —
    // or, worse, fetch a stale look-alike from their own server.
    const engineUrl = new URL(session.engine.url, endpoint).toString();
    const source = await loadSource(session, engineUrl, cache, speculative, endpoint);

    let engine;
    try {
      engine = await evaluateModule(source);
    } catch (err) {
      // The bytes hashed correctly but would not EVALUATE. A CSP block is the
      // integrator's to fix and retrying cannot help, so it is rethrown as-is.
      // Anything else means the source we hold is unusable despite matching its
      // hash — so discard it and fetch once from the network before giving up.
      if (!cache || looksLikeCspDenial(err)) throw err;
      await clearBundle(session.version, session.plan, endpoint).catch(() => {});
      const fresh = await fetchEngine(engineUrl, session.engine.sha256);
      engine = await evaluateModule(fresh);
    }

    if (typeof engine.OpenEditor !== 'function') {
      throw new Error('[open-editor] the delivered bundle does not export OpenEditor');
    }

    // Everything not consumed by the loader goes to the engine verbatim —
    // including functions (onChange, upload handlers). Never serialised: the
    // config is passed by reference, so callbacks survive intact.
    const engineConfig = forwardConfig(options);

    // The session token is what unlocks premium. The engine verifies it OFFLINE
    // against the public key compiled into the bundle (§1.1) — no second
    // round-trip, and the key cannot be swapped by the host page.
    /**
     * §2.4 — the backend hands over a purchased licence key EXACTLY ONCE, on the
     * session that redeems the activation claim. Persist it immediately: the
     * claim is already spent, so if this value is lost the upgrade would vanish
     * on the next reload with no way to recover it automatically.
     */
    if (session.licenceKey) writeActivatedKey(endpoint, session.licenceKey);

    engineConfig.licenseKey = session.sessionToken;

    /**
     * ─── THE PACKAGE IS THE TRUTH (Stage 3) ─────────────────────────────────
     *
     * Without this, the engine grants its OWN built-in free set on top of
     * whatever the token says:
     *
     *   feature-gate.js:  if (!strictEntitlements && FREE_SET.has(id)) return true;
     *
     * FREE_SET is "every feature compiled into this bundle". So an admin could
     * compose a package of two features, the backend would grant exactly two,
     * the signed token would carry exactly two — and the editor would still
     * enable all ~53, because the BUILD contains them. Measured on a real
     * domain: a 2-feature package granted insert.table, insert.image and
     * colour anyway.
     *
     * That made the free tier a property of the ENGINE BUILD rather than of the
     * package an admin composed, which is the opposite of what runtime delivery
     * is for. Premium was gated correctly (export.pdf denied), so it LOOKED
     * like two fixed tiers rather than N admin-composed packages.
     *
     * ⚠️ WHY IT WAS SAFE TO DEFAULT THIS ON, when the engine still defaults it
     * off: strict mode makes the TOKEN the only source of truth, so it is only
     * safe once every token carries its full effective grant. Under runtime
     * delivery that is guaranteed — /delivery/session mints a fresh token on
     * every page load and already sends `free tier ∪ package`. The historical
     * hazard was a long-lived pasted licence listing ONLY premium ids (a real
     * production token was `['export.pdf']` alone); tightening against one of
     * those would strip ~53 features from a payer. The loader never sees those:
     * it always passes a session token it just fetched.
     *
     * ALWAYS_ON (typing, undo, clipboard, selection) is checked ABOVE the
     * strict branch, so a minimal package cannot brick the editor.
     *
     * A host that wants the old blanket behaviour can still pass
     * `strictEntitlements: false` — this is a default, not an override.
     */
    if (engineConfig.strictEntitlements === undefined) {
      engineConfig.strictEntitlements = true;
    }

    // ─── D1: keep the session alive while the editor is open ────────────────
    //
    // A session token lives 15 MINUTES. Anyone writing a real document outlives
    // that, and an expired token means premium silently switches off
    // mid-sentence — for exactly the customer who paid for it.
    //
    // The engine already owns this machinery (a jittered near-expiry timer that
    // swaps the token in place, with no remount and no content loss), so per
    // T16 the refresh lives THERE and the loader only points it at the endpoint.
    //
    // ⚠️ THE LEAD TIME MUST BE OVERRIDDEN. The engine's default is 24 HOURS,
    // tuned for ~30-day licence tokens — longer than this token's entire life,
    // which would make every refresh fire instantly and never settle. Three
    // minutes leaves room for a couple of retries inside a 15-minute window
    // while keeping the timer rare.
    // ⚠️ The refresh token rides in the QUERY STRING, not the body (E3).
    //
    // The engine posts exactly `{ token }` — it has no hook for extra fields,
    // and adding one would mean an engine change plus a version rollout for
    // something the loader can express itself. The URL is loader-controlled, so
    // the long-lived credential travels there instead.
    //
    // WHY IT IS NEEDED: the engine refreshes with whatever is in `licenseKey`,
    // i.e. the 15-minute SESSION token. A tab reopened after a lunch break
    // presents one past its `exp`, which fails verification — and without a
    // second credential the customer is silently downgraded to free for having
    // taken a break. The server tries this one only when the first fails, and
    // re-resolves entitlements from the licence either way, so recovery widens
    // without anything extra being granted.
    //
    // It is a POST to our own origin over TLS, and the token is already held in
    // the page's memory — the query string adds no exposure the page did not
    // already have. (Server access logs are the one asymmetry; a body field
    // would be preferable if the engine ever grows a hook for it.)
    const refreshUrl = new URL(`${endpoint}/delivery/refresh`);
    if (session.refreshToken) refreshUrl.searchParams.set('refreshToken', session.refreshToken);
    engineConfig.licenseRefreshUrl = refreshUrl.toString();
    engineConfig.licenseRefreshLeadSeconds = REFRESH_LEAD_SECONDS;
    engineConfig.licenseRefreshRetrySeconds = REFRESH_RETRY_SECONDS;

    const editor = new engine.OpenEditor(el, engineConfig);
    installPlugins(engine, editor, plugins);

    // Which BUNDLE this editor is running, recorded so applyLicence() can tell
    // "re-verify in place" from "this needs a different bundle" (E1). Without
    // it, handing a free editor a premium token would appear to succeed and
    // unlock nothing — the premium code is simply not in the downloaded file.
    editor._deliveryPlan = session.plan;
    editor._deliveryVersion = session.version;

    /**
     * §2.3 — hold a push channel open so an entitlement change lands in ~2s
     * instead of waiting for the engine's refresh timer (up to 15 min).
     *
     * Subscribed by INSTALL ID rather than licence id: the licId lives inside
     * the signed session token, and decoding a JWT client-side just to name a
     * channel would add a parser (and a failure mode) for no benefit. The
     * backend publishes a purchase on the installId channel precisely so a
     * not-yet-licensed browser can be reached — which is the case that matters
     * most, since that editor has no key to refresh with yet.
     *
     * Everything here is best-effort: on any failure the timer still runs,
     * exactly as it did before push existed.
     */
    const streamId = installId ?? getInstallId();
    if (streamId) {
      const stopStream = subscribeEntitlements({
        endpoint,
        installId: streamId,
        onChange: () => {
          // Re-run the SAME refresh the engine performs on its timer. It
          // re-verifies offline, re-applies entitlements in place, re-arms the
          // timer and tears down revoked features — all without touching the
          // document. Reimplementing any of that here would create a second
          // path that has to agree with the first forever.
          try { editor._doLicenseRefresh?.(); } catch { /* timer still covers it */ }
        },
      });
      // Close the socket with the editor, or every destroyed editor leaks a
      // connection and its heartbeat for as long as the page lives.
      const originalDestroy = typeof editor.destroy === 'function'
        ? editor.destroy.bind(editor) : null;
      editor.destroy = function destroyWithStream(...args) {
        try { stopStream(); } catch { /* already closed */ }
        return originalDestroy ? originalDestroy(...args) : undefined;
      };
    }

    return editor;
  } catch (err) {
    // A failure here must never be silent: without this, an integrator sees an
    // empty container and no explanation anywhere.
    if (typeof onError === 'function') onError(err);
    else console.error(err?.message || err);

    // The visitor keeps a usable text box unless the host opts out. They were
    // in the middle of something; degraded beats blocked (§1.9).
    if (fallback !== false) {
      renderFallback(el, err, {
        message: typeof fallback === 'string' ? fallback : undefined,
        // `defaultContent` is the engine's own option for starting content, so
        // the degraded textarea starts with whatever the editor would have.
        initialValue: options.defaultContent ?? '',
        name: options.name,
      });
    }
    throw err;
  }
}

/**
 * Get the engine source: from cache when it is there, otherwise the network.
 *
 * TWO ORDERING RULES, both deliberate:
 *
 *  • CACHE BEFORE MOUNT. The download is the expensive part, so it is banked
 *    the moment it is known good. Storing after mount would mean a mount
 *    failure discards ~600 KB and the next load fetches it all over again.
 *
 *  • VERIFY BEFORE TRUST — including on the cache path. `readBundle` compares
 *    the stored hash against the one this session promised, so a stale or
 *    tampered entry is discarded rather than executed. A cache hit is not
 *    evidence that the bytes are still the right ones.
 *
 * Every cache failure falls through to the network. Caching is an optimisation;
 * losing it must never stop the editor from loading.
 */
/**
 * Downloads currently in flight, keyed version+plan.
 *
 * WHY: two editors on one page (a perfectly normal CMS layout) both miss the
 * cache and both start fetching ~600 KB. Measured: Chromium's HTTP cache
 * coalesces them, but FIREFOX AND WEBKIT DO NOT — 1.2 MB instead of 600 KB on
 * those browsers. Sharing the promise makes the behaviour the same everywhere
 * and is strictly better on all three.
 *
 * Module-scoped rather than per-call, because the whole point is that separate
 * createEditor() calls find each other.
 */
const inFlight = new Map();

async function loadSource(session, engineUrl, cache, speculative = null, endpoint = '') {
  const { version, plan } = session;
  const sha = session.engine.sha256;
  const key = keyFor(version, plan, endpoint);

  if (cache) {
    // The speculative read (started alongside /session) is only usable if the
    // guess turned out to match what the session actually resolved — a customer
    // who upgraded, or a version that moved, invalidates it.
    const guessed = await (speculative ?? Promise.resolve(null)).catch(() => null);
    if (guessed && guessed.version === version && guessed.plan === plan) {
      // ⚠️ It was read WITHOUT a hash to compare against (none was known yet),
      // so it must be verified now, exactly as the normal cache path does.
      // Skipping this would make the fast path the one that trusts unverified
      // bytes — the same hole the poisoned-cache fix closed.
      const actual = await digestHex(new TextEncoder().encode(guessed.source))
        .catch(() => null);
      if (actual === sha.toLowerCase()) return guessed.source;
    }

    const hit = await readBundle(version, plan, sha, endpoint).catch(() => null);
    // No network call at all on a warm load — the editor appears, and the
    // entitlement check has already happened via /session.
    if (hit) return hit;
  }

  // A second caller for the same bundle waits on the first one's download
  // instead of starting its own.
  const existing = inFlight.get(key);
  if (existing) return existing;

  const pending = fetchEngine(engineUrl, sha)
    .then(async (source) => {
      if (cache) {
        // ⚠️ AWAITED, despite the mount not depending on it.
        //
        // Fire-and-forget loses the write when the page is closed or navigated
        // immediately after mount — measured intermittently in WebKit, where a
        // fast close cut the transaction short and the next visit re-downloaded
        // ~600 KB. Caching exists precisely to avoid that, so a few
        // milliseconds of certainty here is the right trade.
        //
        // Errors stay swallowed: a full quota or private-browsing mode must
        // never turn a working load into a failed one.
        await Promise.all([
          writeBundle(version, plan, sha, source, endpoint).catch(() => {}),
          // Remembering the plan is what makes the NEXT load parallel (T10).
          writeLastPlan(plan, version, endpoint).catch(() => {}),
        ]);
      }
      return source;
    })
    .finally(() => {
      // Cleared on BOTH paths: leaving a rejected promise cached would make
      // one transient network failure permanent for the life of the page.
      inFlight.delete(key);
    });

  inFlight.set(key, pending);
  return pending;
}

/**
 * Apply a new licence key to a LIVE editor, without remounting (E1).
 *
 * ─── WHY setLicenseKey ALONE IS NOT ENOUGH HERE ─────────────────────────────
 * With the npm package, a new key is purely a verification question: all the
 * code is already on the page, so re-verifying unlocks it.
 *
 * Under runtime delivery the PLAN decides which BUNDLE was downloaded. A free
 * visitor holds the free bundle, which contains no premium code at all — handing
 * it a premium token would verify happily and unlock nothing, because there is
 * nothing there to unlock.
 *
 * So this opens a NEW SESSION with the new key and reports what changed:
 *
 *   • same plan  → the token is swapped in place. Premium that was already
 *     downloaded lights up immediately, with no remount and no content loss.
 *   • plan CHANGED → the running engine cannot serve it. The editor keeps
 *     working exactly as it is, and the caller is told a reload is required.
 *
 * That second case is deliberately NOT handled by swapping the engine
 * underneath a live document: §1.7 rules that out because the failure mode is
 * losing a customer's unsaved work on their first paid transaction (R14).
 * Option C — notify, then let the user choose the moment — is the whole point.
 *
 * @returns {Promise<{applied: boolean, plan: string, reloadRequired: boolean}>}
 */
export async function applyLicence(editor, licenceKey, options = {}) {
  const {
    endpoint, version = null, installId = null,
    // Show the built-in "Premium unlocked — reload to activate" prompt on an
    // upgrade. `false` opts out for hosts with their own design system; the
    // result is still returned either way.
    //
    // Default TRUE deliberately: `reloadRequired` was returned and surfaced
    // through all three wrappers, and nothing rendered it — so a customer paid,
    // their editor kept running free, and nothing explained why. An opt-in
    // prompt would have left most integrations in exactly that state.
    prompt = true,
  } = options;
  if (!editor || editor.isDestroyed?.()) {
    throw new Error('[open-editor] applyLicence called on a destroyed editor');
  }
  if (!endpoint) throw new Error('[open-editor] applyLicence needs the delivery endpoint');

  const session = await openSession({
    endpoint,
    licenceKey,
    version,
    installId: installId ?? getInstallId(),
  });

  // What the RUNNING engine can actually serve — not what the new session says
  // it is entitled to. A free bundle cannot become premium by re-verifying.
  const runningPlan = editor._deliveryPlan ?? null;
  const planChanged = runningPlan !== null && runningPlan !== session.plan;

  // ─── DOWNGRADES NEVER PROMPT (§1.7) ───────────────────────────────────────
  //
  // "Never remove capability from under someone mid-edit." An upgrade is good
  // news the customer is waiting for; a DOWNGRADE is not, and interrupting
  // someone's work to offer them fewer features is pure harm. It also cannot
  // lose them anything by waiting: they keep the premium bundle they already
  // have until their next natural page load, at which point the session
  // resolves to free on its own.
  //
  // Entitlements are still re-applied in place, so a revoked feature stops
  // being usable immediately — the engine tears those down without touching
  // the document (_disableRevokedFeatures).
  const isUpgrade = planChanged && runningPlan === FREE_PLAN;
  const reloadRequired = planChanged;

  if (!planChanged) {
    // Same bundle, new entitlements: verified offline, applied in place.
    // Measured safe — content, cursor, undo history and typing all survive.
    await editor.setLicenseKey(session.sessionToken);
  } else if (!isUpgrade) {
    // Downgrade: apply what the licence now allows, but keep running the
    // premium bundle until a natural boundary. Losing a feature is survivable;
    // losing a document is not.
    await editor.setLicenseKey(session.sessionToken);
  }

  // Render the prompt ourselves on an upgrade. The alternative — returning
  // `reloadRequired` and hoping every integrator builds a banner — is what left
  // this invisible in the first place.
  // `_container` is the element the editor mounted into (editor.js:84). Named
  // with an underscore, so it is checked rather than assumed — a wrong property
  // here would make the prompt a silent no-op, which is the exact failure this
  // whole step exists to fix.
  const host = options.container || editor._container || null;
  if (isUpgrade && prompt !== false && host) {
    showActivatePrompt(host, typeof prompt === 'object' ? prompt : {});
  }

  return {
    applied: !planChanged,
    plan: session.plan,
    reloadRequired,
    /** True only for free → premium: the case worth interrupting someone for. */
    isUpgrade,
  };
}

/** Strip loader-only keys; forward the rest untouched. */
function forwardConfig(options) {
  const out = {};
  for (const [k, v] of Object.entries(options)) {
    if (!LOADER_OPTIONS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Install plugins (B3).
 *
 * Default is 'all', matching what an npm consumer gets today, so the editor is
 * fully featured with zero configuration. `plugins: []` opts out entirely, and
 * an array of factories selects a subset.
 *
 * All 21 plugins are in the bundle either way — this decides BEHAVIOUR, not
 * payload. Auto-installing also means adding a plugin to the engine later needs
 * no loader release (T16).
 */
function installPlugins(engine, editor, plugins) {
  if (plugins === 'all') {
    engine.installAllPlugins?.(editor);
    return;
  }
  if (Array.isArray(plugins)) {
    for (const factory of plugins) {
      editor.plugins.install(typeof factory === 'function' ? factory() : factory);
    }
  }
}

export { openSession } from './session.js';
export { fetchEngine } from './fetch-engine.js';
export { evaluateModule, CSP_HELP } from './evaluate.js';
// clearCache is the answer to "try clearing your editor cache" during support.
export { clearCache, clearBundle, readLastPlan, keyFor, MAX_ENTRIES } from './cache.js';
export { getInstallId, mintInstallId, isValidInstallId } from './install-id.js';
export { renderFallback, removeFallback, hasFallback } from './fallback.js';
export { showActivatePrompt, dismissActivatePrompt, hasActivatePrompt } from './activate.js';
// §2.4 — surface the install id so a buyer can paste it at checkout. Opt-in:
// most people loading an editor are not buying anything.
export { showInstallId, hideInstallId, hasInstallId } from './install-id-badge.js';
export { readActivatedKey, writeActivatedKey, clearActivatedKey } from './activated-key.js';
// §2.3 — push channel, for hosts driving their own refresh.
export { subscribeEntitlements } from './entitlement-stream.js';
