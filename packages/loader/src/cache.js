/**
 * cache.js — keep the downloaded engine on the visitor's machine (§1.5 stage 2).
 *
 * Without this, every page load re-downloads ~600 KB. With it, a returning
 * visitor mounts the editor with NO network call at all, and the entitlement
 * check happens afterwards, while they are already typing.
 *
 * ─── WHY INDEXEDDB, NOT localStorage ────────────────────────────────────────
 * localStorage is synchronous (it blocks the main thread — the opposite of what
 * a loader should do), string-only (a ~600 KB bundle would have to be stored as
 * text and re-encoded on every read), and typically capped around 5 MB across
 * the whole origin, which is the CUSTOMER'S budget, not ours. IndexedDB is
 * async, stores strings without ceremony, and has a far larger quota.
 *
 * ─── THE CACHE KEY IS version+plan, NEVER version ALONE ─────────────────────
 * A customer who upgrades keeps the same version and changes plan. Keyed on
 * version alone, they would keep loading the cached FREE bundle and premium
 * would silently never appear — the customer pays and sees no difference. That
 * is the single most expensive bug this module could have.
 *
 * ─── EVICTION IS BY LAST USE, NEVER BY VERSION ORDER ────────────────────────
 * "Keep the newest" is wrong here in two directions: a PINNED customer
 * legitimately stays on an old version forever, and a ROLLBACK makes an older
 * version current again. Both would fight a newest-wins policy. Least-recently-
 * used has no opinion about version ordering, so it survives both.
 */

import { digestHex } from './fetch-engine.js';

const DB_NAME = 'open-editor-engine';
const DB_VERSION = 1;
const STORE = 'bundles';

/** Where the visitor's last-known plan is remembered (T10). */
const META_STORE = 'meta';
const PLAN_KEY = 'last-plan';

/**
 * The remembered plan is scoped per endpoint for the same reason the bundle
 * cache is (D2): a staging session's plan must not steer a production load's
 * speculative read.
 */
const planKey = (endpoint = '') => (endpoint ? `${PLAN_KEY}::${keyOrigin(endpoint)}` : PLAN_KEY);

/** Origin of an endpoint, or the raw value when it is not a URL. */
function keyOrigin(endpoint) {
  try { return new URL(endpoint).origin; } catch { return endpoint; }
}

/**
 * How many bundles to keep. Two covers the common upgrade case (free →
 * premium) without hoarding; three leaves room for a version change on top of
 * that. Beyond this, the least recently used is dropped.
 */
export const MAX_ENTRIES = 3;

/**
 * Cache key. See the header: version ALONE would leak a stale plan.
 *
 * The ENDPOINT is included too (D2). Staging and production routinely serve the
 * same `version` and `plan`, so without it a developer testing against staging
 * and then loading production would get whichever bundle was cached first. The
 * hash check catches a genuine mismatch, but only after a wasted load — and two
 * environments serving byte-identical bundles would cross over silently.
 *
 * `origin` rather than the full endpoint URL, so a trailing slash or a path
 * suffix does not fragment the cache for what is really one environment.
 */
export const keyFor = (version, plan, endpoint = '') => {
  const scope = endpoint ? `${keyOrigin(endpoint)}::` : '';
  return `${scope}${version}::${plan}`;
};

/**
 * Open the database, creating the stores on first use.
 *
 * Resolves null rather than throwing when IndexedDB is unavailable — private
 * browsing modes, disabled storage, and some embedded webviews all block it.
 * Caching is an optimisation; losing it must never stop the editor loading.
 */
function openDb() {
  return new Promise((resolve) => {
    let req;
    try {
      if (!globalThis.indexedDB) return resolve(null);
      req = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    // A blocked upgrade (another tab holding an old version) must not hang the
    // load forever — give up and go to the network.
    req.onblocked = () => resolve(null);
  });
}

/** Promisify one IDBRequest. Never rejects — a cache miss is not an error. */
function reqAsPromise(request) {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });
}

/**
 * Read a cached bundle.
 *
 * The stored SHA is compared against the one the session promised: a bundle
 * whose hash no longer matches is stale or tampered with, and is discarded
 * rather than executed.
 */
export async function readBundle(version, plan, expectedSha, endpoint = '') {
  const db = await openDb();
  if (!db) return null;
  const key = keyFor(version, plan, endpoint);
  try {
    // ⚠️ READ IN ITS OWN TRANSACTION, then do the async work OUTSIDE it.
    //
    // An IndexedDB transaction auto-closes as soon as the event loop yields
    // without a pending request against it. `await digestHex(...)` is exactly
    // such a yield, so a transaction held across it is already dead by the time
    // the next operation runs. Chromium happens to be lenient here; FIREFOX AND
    // WEBKIT ARE NOT — the warm-load cache hit silently failed in both, and
    // every visitor on those browsers would have re-downloaded ~600 KB on every
    // single page load while Chromium looked perfect.
    const entry = await reqAsPromise(
      db.transaction([STORE], 'readonly').objectStore(STORE).get(key),
    );
    if (!entry?.source) return null;

    // Cheap check first: is this even the build the session asked for? Catches
    // a stale entry without hashing ~600 KB.
    if (expectedSha && entry.sha256 !== expectedSha.toLowerCase()) return null;

    // ⚠️ THEN RE-HASH THE ACTUAL BYTES. Comparing the stored `sha256` FIELD
    // alone proves nothing: it is a label sitting beside the source, and
    // anything able to write to IndexedDB (another script on the customer's
    // origin, an extension, a shared machine) can replace the source while
    // leaving the label intact.
    //
    // Found exactly that way — a test swapped the cached source for
    // `throw new Error("POISONED")`, kept the field, and the loader EXECUTED
    // it. The network path has always verified real bytes; the cache path must
    // hold the same bar, or the cache becomes the soft way in.
    const actual = await digestHex(new TextEncoder().encode(entry.source));
    if (expectedSha && actual !== expectedSha.toLowerCase()) {
      // Poisoned or corrupt — drop it and fall through to the network.
      try {
        db.transaction([STORE], 'readwrite').objectStore(STORE).delete(key);
      } catch { /* best effort */ }
      return null;
    }

    // Touch it so eviction knows this entry is in active use. A fresh
    // transaction, for the same reason as above.
    try {
      db.transaction([STORE], 'readwrite').objectStore(STORE)
        .put({ ...entry, usedAt: Date.now() }, key);
    } catch { /* a failed touch only affects eviction order */ }

    return entry.source;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/**
 * Store a verified bundle.
 *
 * CALLED BEFORE MOUNT, deliberately. The download is the expensive part, so it
 * is banked the moment it is known good — otherwise a mount failure would throw
 * away ~600 KB and the next load would fetch it all over again.
 */
export async function writeBundle(version, plan, sha256, source, endpoint = '') {
  const db = await openDb();
  if (!db) return false;
  const key = keyFor(version, plan, endpoint);
  const record = { source, sha256: sha256.toLowerCase(), version, plan, usedAt: Date.now() };

  /** One write attempt. Resolves true on commit, false on any failure. */
  const attempt = () => new Promise((resolve) => {
    let ok = true;
    const tx = db.transaction([STORE], 'readwrite');
    tx.objectStore(STORE).put(record, key);
    tx.oncomplete = () => resolve(ok);
    // A failed write is not fatal — the next load simply refetches.
    tx.onerror = () => { ok = false; resolve(false); };
    tx.onabort = () => { ok = false; resolve(false); };
  });

  try {
    // The write itself, committed on its own — see readBundle for why an await
    // must never sit between operations on one transaction.
    let stored = await attempt();

    // ⚠️ QUOTA: three ~640 KB bundles is close to 2 MB, and a customer's origin
    // budget is shared with everything else on their site. Eviction previously
    // ran only AFTER a successful write, so a full quota failed silently and
    // caching stayed permanently broken — correct, but degraded with no signal
    // and no way back. Evicting and retrying once recovers the common case.
    if (!stored) {
      await evictLru(db, /* aggressive */ true);
      stored = await attempt();
    }

    await evictLru(db);
    return stored;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

/**
 * Drop the least recently used entries beyond MAX_ENTRIES.
 *
 * Not by version order — see the header. A pinned customer and a rollback both
 * break "newest wins", and both are normal operations, not edge cases.
 */
async function evictLru(db, aggressive = false) {
  // `aggressive` is used after a quota failure: keep only the single most
  // recently used entry, freeing as much as possible for the retry.
  const keep = aggressive ? 1 : MAX_ENTRIES;
  // Keys and values are read in ONE transaction (no await between them), then
  // the deletes go in another — an await would close the first mid-flight.
  const read = db.transaction([STORE], 'readonly').objectStore(STORE);
  const keysReq = read.getAllKeys();
  const valsReq = read.getAll();
  const [keys, entries] = await Promise.all([reqAsPromise(keysReq), reqAsPromise(valsReq)]);
  if (!keys || keys.length <= keep || !entries) return;

  const pairs = keys.map((key, i) => ({ key, usedAt: entries[i]?.usedAt ?? 0 }));
  pairs.sort((a, b) => b.usedAt - a.usedAt);           // newest use first
  const doomed = pairs.slice(keep);
  if (!doomed.length) return;

  const write = db.transaction([STORE], 'readwrite').objectStore(STORE);
  for (const { key } of doomed) write.delete(key);
}

/**
 * Remember which plan this visitor had (T10).
 *
 * WHY: the loader cannot know WHICH bundle to request until /session answers,
 * so a first-ever visit must be sequential (~200 ms). Remembering the plan lets
 * every subsequent load start both requests AT ONCE (~50 ms). The sequential
 * cost is therefore paid once per browser profile, ever — which is what makes
 * the speed claim honest rather than aspirational.
 */
export async function readLastPlan(endpoint = '') {
  const db = await openDb();
  if (!db) return null;
  try {
    const store = db.transaction([META_STORE], 'readonly').objectStore(META_STORE);
    const v = await reqAsPromise(store.get(planKey(endpoint)));
    // BOTH plan and version: the cache key needs the pair, so returning the
    // plan alone would leave the caller unable to look anything up.
    return v?.plan ? { plan: v.plan, version: v.version ?? null } : null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function writeLastPlan(plan, version, endpoint = '') {
  const db = await openDb();
  if (!db) return false;
  try {
    // Awaited so the write commits before db.close() below — closing mid-flight
    // would abort it, and the next load would fall back to the sequential path.
    await new Promise((resolve) => {
      const tx = db.transaction([META_STORE], 'readwrite');
      tx.objectStore(META_STORE).put({ plan, version, at: Date.now() }, planKey(endpoint));
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    });
    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

/**
 * Drop ONE cached bundle.
 *
 * Used when a bundle hashed correctly but would not evaluate — the bytes are
 * unusable despite matching their digest, so keeping them would mean retrying
 * the same broken source on every future load. Targeted rather than a full
 * clear, so an unrelated cached bundle is not thrown away with it.
 */
export async function clearBundle(version, plan, endpoint = '') {
  const db = await openDb();
  if (!db) return false;
  try {
    await new Promise((resolve) => {
      const tx = db.transaction([STORE], 'readwrite');
      tx.objectStore(STORE).delete(keyFor(version, plan, endpoint));
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    });
    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

/** Remove everything. Exposed for support ("clear your editor cache"). */
export async function clearCache() {
  const db = await openDb();
  if (!db) return false;
  try {
    await new Promise((resolve) => {
      const tx = db.transaction([STORE, META_STORE], 'readwrite');
      tx.objectStore(STORE).clear();
      tx.objectStore(META_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    });
    return true;
  } catch {
    return false;
  } finally {
    db.close();
  }
}
